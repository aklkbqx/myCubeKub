import { Elysia } from 'elysia';
import { createHash } from 'crypto';
import { RateLimiterMemory, RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
import { cacheService } from '../services/CacheService';
import {
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_ADMIN_MAX,
  RATE_LIMIT_ADMIN_WINDOW_MS,
  RATE_LIMIT_API_MAX,
  RATE_LIMIT_API_WINDOW_MS,
  RATE_LIMIT_AUTH_ENABLED,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
  RATE_LIMIT_EXPENSIVE_MAX,
  RATE_LIMIT_EXPENSIVE_WINDOW_MS,
  RATE_LIMIT_FILES_MAX,
  RATE_LIMIT_FILES_WINDOW_MS,
  RATE_LIMIT_LOG_EXCEEDED,
  RATE_LIMIT_NOTIFICATIONS_MAX,
  RATE_LIMIT_NOTIFICATIONS_WINDOW_MS,
  RATE_LIMIT_PROFILE_MAX,
  RATE_LIMIT_PROFILE_WINDOW_MS,
  RATE_LIMIT_PUBLIC_MAX,
  RATE_LIMIT_PUBLIC_WINDOW_MS,
  RATE_LIMIT_RESPONDER_MAX,
  RATE_LIMIT_RESPONDER_WINDOW_MS
} from '../utils';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  pathPrefixes?: string[];
  includePath?: boolean;
  includeMethod?: boolean;
  logExceeded?: boolean;
  skip?: (request: Request) => boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  total: number;
}

interface RegisteredLimiter {
  redis: RateLimiterRedis | null;
  memory: RateLimiterMemory;
}

const limiterRegistry = new Map<string, RegisteredLimiter>();

const toDurationSec = (windowMs: number) => Math.max(Math.ceil(windowMs / 1000), 1);

const getClientId = (request: Request): string => {
  const headers = request.headers;
  const cfConnectingIp = headers.get('cf-connecting-ip')?.trim();
  if (cfConnectingIp) return `ip:${cfConnectingIp}`;

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return `ip:${realIp}`;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return `ip:${first}`;
  }

  const fingerprint = `${headers.get('user-agent') || 'na'}|${headers.get('accept-language') || 'na'}|${headers.get('host') || 'na'}`;
  const hash = createHash('sha1').update(fingerprint).digest('hex').slice(0, 16);
  return `fp:${hash}`;
};

const getRequestKey = (request: Request, config: RateLimitConfig): string => {
  const url = new URL(request.url);
  const parts = [getClientId(request)];
  if (config.includeMethod !== false) {
    parts.push(request.method.toUpperCase());
  }
  if (config.includePath !== false) {
    parts.push(url.pathname);
  }
  return parts.join(':');
};

const toRateLimitResult = (
  response: RateLimiterRes,
  maxRequests: number,
  fallbackWindowMs: number,
  allowed: boolean
): RateLimitResult => ({
  allowed,
  remaining: Math.max(response.remainingPoints ?? 0, 0),
  resetTime: Date.now() + Math.max(response.msBeforeNext ?? fallbackWindowMs, 0),
  total: maxRequests,
});

const isRateLimiterResponse = (value: unknown): value is RateLimiterRes =>
  typeof value === 'object' &&
  value !== null &&
  'remainingPoints' in value &&
  'msBeforeNext' in value;

const getLimiters = (config: Required<Pick<RateLimitConfig, 'windowMs' | 'maxRequests' | 'keyPrefix'>>): RegisteredLimiter => {
  const registryKey = `${config.keyPrefix}:${config.maxRequests}:${config.windowMs}`;
  const existing = limiterRegistry.get(registryKey);
  if (existing) return existing;

  const memoryLimiter = new RateLimiterMemory({
    keyPrefix: config.keyPrefix,
    points: config.maxRequests,
    duration: toDurationSec(config.windowMs),
  });

  const redisClient = cacheService.getClient();
  const redisLimiter = redisClient
    ? new RateLimiterRedis({
        storeClient: redisClient as any,
        keyPrefix: config.keyPrefix,
        points: config.maxRequests,
        duration: toDurationSec(config.windowMs),
        insuranceLimiter: memoryLimiter,
      })
    : null;

  const created = { redis: redisLimiter, memory: memoryLimiter };
  limiterRegistry.set(registryKey, created);
  return created;
};

const consumeLimit = async (request: Request, config: Required<Pick<RateLimitConfig, 'windowMs' | 'maxRequests' | 'keyPrefix' | 'includeMethod' | 'includePath'>>): Promise<RateLimitResult> => {
  const key = getRequestKey(request, config);
  const { redis, memory } = getLimiters(config);

  try {
    if (!redis) {
      const memoryRes = await memory.consume(key, 1);
      return toRateLimitResult(memoryRes, config.maxRequests, config.windowMs, true);
    }

    const redisRes = await redis.consume(key, 1);
    return toRateLimitResult(redisRes, config.maxRequests, config.windowMs, true);
  } catch (err: any) {
    if (isRateLimiterResponse(err)) {
      return toRateLimitResult(err, config.maxRequests, config.windowMs, false);
    }

    try {
      const fallback = await memory.consume(key, 1);
      return toRateLimitResult(fallback, config.maxRequests, config.windowMs, true);
    } catch (fallbackErr) {
      if (isRateLimiterResponse(fallbackErr)) {
        return toRateLimitResult(fallbackErr, config.maxRequests, config.windowMs, false);
      }

      throw fallbackErr;
    }
  }
};

export function rateLimit(config: RateLimitConfig) {
  const mergedConfig = {
    keyPrefix: 'rl',
    pathPrefixes: undefined as string[] | undefined,
    includeMethod: true,
    includePath: true,
    logExceeded: RATE_LIMIT_LOG_EXCEEDED,
    ...config,
  };

  return new Elysia().onRequest(async ({ request, set }) => {
    if (!RATE_LIMIT_ENABLED) return;
    if (request.method === 'OPTIONS') return;
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return;
    const pathname = new URL(request.url).pathname;
    if (pathname === '/swagger' || pathname.startsWith('/swagger/')) return;
    if (mergedConfig.pathPrefixes?.length) {
      const matched = mergedConfig.pathPrefixes.some((prefix) => pathname.startsWith(prefix));
      if (!matched) return;
    }
    if (mergedConfig.skip?.(request)) return;

    const result = await consumeLimit(request, mergedConfig);

    set.headers = set.headers || {};
    set.headers['X-RateLimit-Limit'] = mergedConfig.maxRequests.toString();
    set.headers['X-RateLimit-Remaining'] = result.remaining.toString();
    set.headers['X-RateLimit-Reset'] = new Date(result.resetTime).toISOString();
    set.headers['RateLimit-Limit'] = result.total.toString();
    set.headers['RateLimit-Remaining'] = result.remaining.toString();
    set.headers['RateLimit-Reset'] = Math.max(Math.ceil((result.resetTime - Date.now()) / 1000), 0).toString();

    if (!result.allowed) {
      const retryAfter = Math.max(Math.ceil((result.resetTime - Date.now()) / 1000), 1);
      set.headers['Retry-After'] = retryAfter.toString();
      set.status = 429;
      if (mergedConfig.logExceeded) {
        console.warn(`⚠️ Rate limit exceeded: ${request.method} ${pathname} [${mergedConfig.keyPrefix}]`);
      }
      return {
        success: false,
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      };
    }
  });
}

export const rateLimitPresets = {
  auth: rateLimit({
    windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
    maxRequests: RATE_LIMIT_AUTH_MAX,
    keyPrefix: 'rl:auth',
    pathPrefixes: ['/api/auth'],
    skip: () => !RATE_LIMIT_AUTH_ENABLED,
  }),

  api: rateLimit({
    windowMs: RATE_LIMIT_API_WINDOW_MS,
    maxRequests: RATE_LIMIT_API_MAX,
    keyPrefix: 'rl:api',
    pathPrefixes: ['/api'],
  }),

  public: rateLimit({
    windowMs: RATE_LIMIT_PUBLIC_WINDOW_MS,
    maxRequests: RATE_LIMIT_PUBLIC_MAX,
    keyPrefix: 'rl:public',
  }),

  expensive: rateLimit({
    windowMs: RATE_LIMIT_EXPENSIVE_WINDOW_MS,
    maxRequests: RATE_LIMIT_EXPENSIVE_MAX,
    keyPrefix: 'rl:expensive',
  }),

  notifications: rateLimit({
    windowMs: RATE_LIMIT_NOTIFICATIONS_WINDOW_MS,
    maxRequests: RATE_LIMIT_NOTIFICATIONS_MAX,
    keyPrefix: 'rl:notifications',
    pathPrefixes: ['/api/notifications'],
  }),

  profile: rateLimit({
    windowMs: RATE_LIMIT_PROFILE_WINDOW_MS,
    maxRequests: RATE_LIMIT_PROFILE_MAX,
    keyPrefix: 'rl:profile',
    pathPrefixes: ['/api/profile'],
  }),

  admin: rateLimit({
    windowMs: RATE_LIMIT_ADMIN_WINDOW_MS,
    maxRequests: RATE_LIMIT_ADMIN_MAX,
    keyPrefix: 'rl:admin',
    pathPrefixes: ['/api/admin'],
  }),

  responder: rateLimit({
    windowMs: RATE_LIMIT_RESPONDER_WINDOW_MS,
    maxRequests: RATE_LIMIT_RESPONDER_MAX,
    keyPrefix: 'rl:responder',
    pathPrefixes: ['/api/responder'],
  }),

  files: rateLimit({
    windowMs: RATE_LIMIT_FILES_WINDOW_MS,
    maxRequests: RATE_LIMIT_FILES_MAX,
    keyPrefix: 'rl:files',
    pathPrefixes: ['/api/servers'],
    skip: (request) => !new URL(request.url).pathname.includes('/files'),
  }),
};

export const destroyRateLimiter = () => {
  limiterRegistry.clear();
};

process.on('SIGTERM', destroyRateLimiter);
process.on('SIGINT', destroyRateLimiter);
