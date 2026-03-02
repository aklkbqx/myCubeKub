import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import authGuard from "../services/authGuard";
import { cacheService } from "../services/CacheService";
import { cacheKeys, getSessionCacheTtl } from "../services/cacheKeys";

const errorResponse = t.Object({
  error: t.String(),
});

const authUserResponse = t.Object({
  user: t.Object({
    id: t.String(),
    username: t.String(),
  }),
});

const authMeResponse = t.Object({
  user: t.Object({
    id: t.String(),
    username: t.String(),
    createdAt: t.String(),
  }),
});

const authRoutes = new Elysia({ prefix: "/auth" })
  // ─── Login ─────────────────────────────────────────────────
  .post(
    "/login",
    async ({ body, cookie: { session_id }, set }) => {
      const { username, password } = body;

      // Find user
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, username))
        .limit(1);

      if (!user) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const valid = await Bun.password.verify(
        password,
        user.passwordHash,
        'argon2id'
      );

      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      // Create session (24h)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [session] = await db
        .insert(schema.sessions)
        .values({
          userId: user.id,
          expiresAt,
        })
        .returning();

      // Set cookie
      session_id.set({
        value: session.id,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 24 * 60 * 60, // 24h
      });

      await cacheService.set(
        cacheKeys.auth.session(session.id),
        {
          user: {
            id: user.id,
            username: user.username,
            createdAt: user.createdAt.toISOString(),
          },
        },
        getSessionCacheTtl(expiresAt)
      );

      return {
        user: {
          id: user.id,
          username: user.username,
        },
      };
    },
    {
      body: t.Object({
        username: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
      response: {
        200: authUserResponse,
        401: errorResponse,
      },
    }
  )

  // ─── Logout ────────────────────────────────────────────────
  .post(
    "/logout",
    async ({ cookie: { session_id } }) => {
      const sessionId =
        typeof session_id?.value === "string" ? session_id.value : undefined;

      if (sessionId) {
        await db
          .delete(schema.sessions)
          .where(eq(schema.sessions.id, sessionId));

        await cacheService.del(cacheKeys.auth.session(sessionId));
        session_id.remove();
      }

      return { success: true };
    },
    {
      response: t.Object({
        success: t.Boolean(),
      }),
    }
  )

  // ─── Me (get current user) ────────────────────────────────
  .use(authGuard)
  .get(
    "/me",
    ({ user, authUnavailable, set }) => {
      if (authUnavailable) {
        set.status = 503;
        return { error: "Authentication schema is not ready. Run database migrations first." };
      }

      if (!user) {
        set.status = 401;
        return { error: "Not authenticated" };
      }

      return {
        user: {
          ...user,
          createdAt: user.createdAt.toISOString(),
        },
      };
    },
    {
      response: {
        200: authMeResponse,
        401: errorResponse,
        503: errorResponse,
      },
    }
  );


export default authRoutes
