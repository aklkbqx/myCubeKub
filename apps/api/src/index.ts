// backend/src/index.ts
import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import apiRoute from './routes/_routes';
import jwt from '@elysiajs/jwt';
import { thaiDate } from './utils/DateUtil';
import {
  API_PORT,
  DOCS_PORT,
  JWT_SECRET,
  PROJECT_NAME,
  READINESS_MAX_WAIT_MS,
  READINESS_INTERVAL_MS,
  READINESS_ALLOW_DEGRADED,
  READINESS_ENABLED,
  SWAGGER_ENABLED,
  SWAGGER_SERVER_URL,
  PUBLIC_FILE_BASE_URL,
} from './utils';
import { healthService } from './services/HealthService';
import { cacheService } from './services/CacheService';
import cors from '@elysiajs/cors';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSwaggerConfig } from './config/swagger';
import { resolveLocaleFromAcceptLanguage } from './utils/locale';
import { CACHE_TTL, cacheKeys } from './services/cacheKeys';
import { rateLimitPresets } from './services/rateLimiter';
import { getPublicResourcePackPath } from './services/resourcePacks';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  throw new Error('Missing required environment variable: ALLOWED_ORIGINS (comma-separated origins)');
}

const corsConfig = {
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept-Language',
    'X-Client-Id',
    'X-Client-Secret',
    'X-Timestamp',
    'X-Signature',
    'Upgrade',
    'Connection',
    'Sec-WebSocket-Key',
    'Sec-WebSocket-Version',
    'Sec-WebSocket-Protocol',
  ],
  credentials: true,
  maxAge: 86400,
};

const CLIENT_GUARD_ENABLED = (process.env.CLIENT_GUARD_ENABLED || 'false').toLowerCase() === 'true';
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const CLIENT_SIGNING_SECRET = (process.env.CLIENT_SIGNING_SECRET || '').trim();
const CLIENT_SIGNATURE_TOLERANCE_SEC = Number(process.env.CLIENT_SIGNATURE_TOLERANCE_SEC || 300);

if (CLIENT_GUARD_ENABLED && (!CLIENT_ID || !CLIENT_SIGNING_SECRET)) {
  throw new Error('Missing required environment variable: CLIENT_ID / CLIENT_SIGNING_SECRET (when CLIENT_GUARD_ENABLED=true)');
}

const buildExpectedSignature = (method: string, pathname: string, timestamp: string, clientId: string) =>
  createHmac('sha256', CLIENT_SIGNING_SECRET)
    .update(`${method}\n${pathname}\n${timestamp}\n${clientId}`)
    .digest('hex');

const isTimingSafeHexEqual = (left: string, right: string) => {
  try {
    const leftBytes = Buffer.from(left, 'hex');
    const rightBytes = Buffer.from(right, 'hex');
    if (leftBytes.length === 0 || rightBytes.length === 0 || leftBytes.length !== rightBytes.length) {
      return false;
    }
    return timingSafeEqual(leftBytes, rightBytes);
  } catch {
    return false;
  }
};

const verifyClientHeaders = (request: Request) => {
  if (!CLIENT_GUARD_ENABLED || request.method === 'OPTIONS') return { ok: true };

  const requestClientId = request.headers.get('x-client-id')?.trim() || '';
  const requestClientSecret = request.headers.get('x-client-secret')?.trim() || '';
  const timestampRaw = request.headers.get('x-timestamp')?.trim() || '';
  const requestSignature = request.headers.get('x-signature')?.trim().toLowerCase() || '';

  if (!requestClientId) {
    return { ok: false, status: 401, message: 'Missing client authentication headers' };
  }

  if (requestClientId !== CLIENT_ID) {
    return { ok: false, status: 401, message: 'Invalid client id' };
  }

  // Simpler mode: accept shared secret header (good for immediate rollout)
  if (requestClientSecret) {
    if (requestClientSecret !== CLIENT_SIGNING_SECRET) {
      return { ok: false, status: 401, message: 'Invalid client secret' };
    }
    return { ok: true };
  }

  // Stronger mode: HMAC signature with timestamp
  if (!timestampRaw || !requestSignature) {
    return { ok: false, status: 401, message: 'Missing request signature headers' };
  }

  const parsedTs = Number(timestampRaw);
  if (!Number.isFinite(parsedTs) || parsedTs <= 0) {
    return { ok: false, status: 401, message: 'Invalid timestamp format' };
  }
  const tsSeconds = parsedTs > 1_000_000_000_000 ? Math.floor(parsedTs / 1000) : Math.floor(parsedTs);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > CLIENT_SIGNATURE_TOLERANCE_SEC) {
    return { ok: false, status: 401, message: 'Expired request timestamp' };
  }

  const pathname = new URL(request.url).pathname;
  const expectedSignature = buildExpectedSignature(request.method.toUpperCase(), pathname, timestampRaw, requestClientId);
  if (!isTimingSafeHexEqual(requestSignature, expectedSignature)) {
    return { ok: false, status: 401, message: 'Invalid request signature' };
  }

  return { ok: true };
};

const isGuardedPath = (pathname: string) =>
  pathname === '/test' ||
  pathname.startsWith('/api');

const requiredEnvVars = { API_PORT, JWT_SECRET, PROJECT_NAME, PUBLIC_FILE_BASE_URL };
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const createBaseApp = () => {
  const app = new Elysia()
    .use(cors(corsConfig))
    .use(rateLimitPresets.auth)
    .use(rateLimitPresets.files)
    .use(rateLimitPresets.api)
    .derive(({ request, set }) => {
      const locale = resolveLocaleFromAcceptLanguage(request.headers.get('accept-language'));
      set.headers['content-language'] = locale;
      return { locale };
    })
    .onRequest(({ request, set }) => {
      const pathname = new URL(request.url).pathname;
      if (!isGuardedPath(pathname)) return;

      const verification = verifyClientHeaders(request);
      if (verification.ok) return;

      set.status = verification.status;
      return {
        success: false,
        message: verification.message,
      };
    })
    .group('', app => app
      .get('/public/resource-packs/:filename', async ({ params, set }) => {
        const file = Bun.file(getPublicResourcePackPath(params.filename));

        if (!await file.exists()) {
          set.status = 404;
          return {
            success: false,
            message: 'Resource pack not found',
          };
        }

        set.headers['content-type'] = 'application/zip';
        set.headers['cache-control'] = 'public, max-age=31536000, immutable';
        set.headers['content-disposition'] = `inline; filename="${params.filename}"`;
        return file;
      }, {
        detail: { tags: ['Public'] }
      })
      .get('/health', async () => {
        const health = await cacheService.remember(
          cacheKeys.health.overall,
          CACHE_TTL.health,
          () => healthService.getOverallHealth()
        );
        return {
          success: true,
          data: health,
        };
      }, {
        detail: { tags: ['System'] }
      })
      .get('/test', () => ({
        success: true,
        message: 'API is running',
        project: PROJECT_NAME,
        timestamp: thaiDate.isoBangkok(),
      }), {
        detail: { tags: ['System'] }
      })
    );

  return app.group('/api', app => app.use(apiRoute));
};

const createDocsApp = (swaggerReady: boolean) => {
  return new Elysia()
    .get('/swagger', () => {
      if (!swaggerReady) {
        return new Response('Swagger is not available on API server.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      const html = `<!doctype html>
                    <html>
                      <head>
                        <meta charset="utf-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1" />
                        <title>${PROJECT_NAME} API Docs</title>
                        <style>
                          html, body { margin: 0; height: 100%; }
                          iframe { border: 0; width: 100%; height: 100%; }
                        </style>
                      </head>
                      <body>
                        <iframe src="http://localhost:${API_PORT}/swagger" title="${PROJECT_NAME} API Docs"></iframe>
                      </body>
                    </html>`;

      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }, {
      detail: { tags: ['Docs'] }
    })
    .get('/swagger/json', async ({ set }) => {
      if (!swaggerReady) {
        set.status = 503;
        return {
          success: false,
          message: 'Swagger is not available on API server',
        };
      }
      try {
        const res = await fetch(`http://127.0.0.1:${API_PORT}/swagger/json`);
        const body = await res.text();
        set.status = res.status;
        set.headers['content-type'] = 'application/json; charset=utf-8';
        return body;
      } catch (error) {
        set.status = 502;
        return {
          success: false,
          message: 'Failed to load OpenAPI spec from API server',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }, {
      detail: { tags: ['Docs'] }
    });
};

// Shutdown coordination flag
let isShuttingDown = false;

async function waitForReadiness(
  maxWaitMs = READINESS_MAX_WAIT_MS,
  intervalMs = READINESS_INTERVAL_MS
) {
  const start = Date.now();
  while (true) {
    if (isShuttingDown) {
      throw new Error('SHUTDOWN');
    }
    try {
      const health = await healthService.getOverallHealth();
      const dbOk = health.services.database.status === 'healthy';
      const systemOk = health.services.system.status !== 'unhealthy';
      const overallOk = health.overall === 'healthy' || (READINESS_ALLOW_DEGRADED && health.overall === 'degraded');
      if (dbOk && systemOk && overallOk) {
        return health;
      }
      console.log(`⏳ Readiness waiting... overall=${health.overall} (allowDegraded=${READINESS_ALLOW_DEGRADED}), db=${health.services.database.status}, system=${health.services.system.status}`);
    } catch (e) {
      console.warn(`⏳ Readiness check error: ${e instanceof Error ? e.message : e}`);
    }

    if (Date.now() - start >= maxWaitMs) {
      const errorMsg = `Readiness check timed out after ${maxWaitMs}ms`;
      throw new Error(errorMsg);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

let apiServer: unknown;
let docsServer: unknown;

const stopServer = async (server: any) => {
  if (!server) return;
  try {
    if (typeof server.stop === 'function') {
      await server.stop();
      return;
    }
    if (typeof server.close === 'function') {
      await new Promise(resolve => server.close(resolve));
      return;
    }
  } catch (e) {
    console.warn('Error stopping server:', e);
  }
};

const handleSignal = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Shutting down...`);
  await Promise.allSettled([
    stopServer(apiServer as any),
    stopServer(docsServer as any),
  ]);
  process.exit(0);
};

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

async function start() {
  try {
    console.log(`🚀 Starting "${PROJECT_NAME}" Backend Server...`);

    let ready: Awaited<ReturnType<typeof waitForReadiness>> | null = null;
    if (READINESS_ENABLED) {
      ready = await waitForReadiness();
    } else {
      console.log('⚠️ Readiness check is disabled (READINESS_ENABLED=false)');
    }

    const redisOk = await cacheService.healthCheck();
    if (redisOk) {
      console.log('✅ Redis connection established');
    } else {
      console.warn('⚠️ Redis connection failed! Caching will be disabled.');
    }

    if (process.env.NODE_ENV === 'development' && ready) {
      console.log(`✅ Readiness check passed. Overall status: ${ready.overall}`);
    }

    let apiApp = createBaseApp().use(jwt({ name: 'jwt', secret: JWT_SECRET }));
    let swaggerMounted = false;
    if (SWAGGER_ENABLED) {
      try {
        apiApp = apiApp.use(swagger(createSwaggerConfig(PROJECT_NAME, SWAGGER_SERVER_URL)));
        swaggerMounted = true;
      } catch (swaggerError) {
        console.error(`⚠️ Swagger disabled due to startup error: ${swaggerError instanceof Error ? swaggerError.message : swaggerError}`);
      }
    }
    apiServer = apiApp.listen(API_PORT, async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🦊 API Server is running at http://localhost:${API_PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        if (!swaggerMounted && SWAGGER_ENABLED) {
          console.log('⚠️ API Documentation is unavailable because Swagger failed to initialize');
        }
      }
    });

    docsServer = null;
    if (SWAGGER_ENABLED) {
      const docsApp = createDocsApp(swaggerMounted);
      docsServer = docsApp.listen(DOCS_PORT, () => {
        console.log(`📚 API Documentation is available at: http://localhost:${DOCS_PORT}/swagger`);
      });
    }

    console.log('✨ Server startup completed successfully!');
  } catch (err) {
    if (
      isShuttingDown ||
      (err instanceof Error && err.message === 'SHUTDOWN')
    ) {
      console.log('🛑 Shutdown in progress. Exiting.');
      process.exit(0);
    }
    console.error(`❌ Server startup failed: ${err instanceof Error ? err.message : err}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// start server
start();

export { apiServer, docsServer };
