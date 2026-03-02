import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * Session middleware — derives `user` from session cookie
 */
export const authGuard = new Elysia({ name: "auth-guard" })
  .derive(
    { as: "scoped" },
    async ({ cookie: { session_id }, set }) => {
      if (!session_id?.value) {
        set.status = 401;
        return { user: null };
      }

      const [sessionRow] = await db
        .select()
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.id, session_id.value),
            gt(schema.sessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!sessionRow) {
        set.status = 401;
        return { user: null };
      }

      const [user] = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, sessionRow.userId))
        .limit(1);

      if (!user) {
        set.status = 401;
        return { user: null };
      }

      return { user };
    }
  );

/**
 * Auth routes — login, logout, me
 */
export const authRoutes = new Elysia({ prefix: "/auth" })
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

      // Verify password
      const valid = await bcrypt.compare(password, user.passwordHash);
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
    }
  )

  // ─── Logout ────────────────────────────────────────────────
  .post("/logout", async ({ cookie: { session_id } }) => {
    if (session_id?.value) {
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.id, session_id.value));

      session_id.remove();
    }

    return { success: true };
  })

  // ─── Me (get current user) ────────────────────────────────
  .use(authGuard)
  .get("/me", ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }

    return { user };
  });
