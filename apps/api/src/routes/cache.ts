import { Elysia, t } from "elysia";
import authGuard from "../services/authGuard";
import { cacheService } from "../services/CacheService";
import { cacheScopes, type CacheScope } from "../services/cacheKeys";

const errorResponse = t.Object({
  error: t.String(),
});

const cacheMetricsSchema = t.Object({
  hits: t.Number(),
  misses: t.Number(),
  writes: t.Number(),
  invalidations: t.Number(),
  errors: t.Number(),
  lastErrorAt: t.Nullable(t.String()),
  lastErrorMessage: t.Nullable(t.String()),
  requests: t.Number(),
  hitRate: t.Number(),
});

const cacheInfoSchema = t.Object({
  enabled: t.Boolean(),
  connected: t.Boolean(),
  metrics: cacheMetricsSchema,
});

const cacheScopeSchema = t.Union([
  t.Literal("all"),
  t.Literal("health"),
  t.Literal("auth"),
  t.Literal("servers"),
  t.Literal("files"),
]);

const cacheRoutes = new Elysia({ prefix: "/cache" })
  .use(authGuard)
  .onBeforeHandle(({ user, authUnavailable, set }) => {
    if (authUnavailable) {
      set.status = 503;
      return { error: "Authentication schema is not ready. Run database migrations first." };
    }

    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
  })
  .get(
    "/",
    () => ({
      cache: cacheService.getInfo(),
    }),
    {
      response: {
        200: t.Object({ cache: cacheInfoSchema }),
        401: errorResponse,
        503: errorResponse,
      },
    }
  )
  .post(
    "/flush",
    async ({ body, set }) => {
      const scope = (body.scope || "all") as CacheScope;
      const success = scope === "all"
        ? await cacheService.flushAll()
        : await cacheService.flushByPattern(cacheScopes[scope]);

      if (!success) {
        set.status = 503;
        return { error: "Cache flush failed or Redis is disabled" };
      }

      return {
        success: true,
        scope,
        cache: cacheService.getInfo(),
      };
    },
    {
      body: t.Object({
        scope: t.Optional(cacheScopeSchema),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          scope: cacheScopeSchema,
          cache: cacheInfoSchema,
        }),
        401: errorResponse,
        503: errorResponse,
      },
    }
  );

export default cacheRoutes;
