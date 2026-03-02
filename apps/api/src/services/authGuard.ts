import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "../db";
import Elysia from "elysia";
import { cacheService } from "./CacheService";
import { cacheKeys, getSessionCacheTtl } from "./cacheKeys";

interface CachedAuthSession {
    user: {
        id: string;
        username: string;
        createdAt: string;
    };
}

function isMissingAuthRelation(error: unknown) {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "42P01"
    );
}

const authGuard = new Elysia({ name: "auth-guard" })
    .derive(
        { as: "scoped" },
        async ({ cookie: { session_id }, set }) => {
            const sessionId =
                typeof session_id?.value === "string" ? session_id.value : undefined;

            if (!sessionId) {
                set.status = 401;
                return { user: null, authUnavailable: false };
            }

            const cachedSession = await cacheService.get<CachedAuthSession>(
                cacheKeys.auth.session(sessionId)
            );
            if (cachedSession) {
                return {
                    user: {
                        ...cachedSession.user,
                        createdAt: new Date(cachedSession.user.createdAt),
                    },
                    authUnavailable: false,
                };
            }

            try {
                const [sessionRow] = await db
                    .select()
                    .from(schema.sessions)
                    .where(
                        and(
                            eq(schema.sessions.id, sessionId),
                            gt(schema.sessions.expiresAt, new Date())
                        )
                    )
                    .limit(1);

                if (!sessionRow) {
                    set.status = 401;
                    return { user: null, authUnavailable: false };
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
                    return { user: null, authUnavailable: false };
                }

                await cacheService.set(
                    cacheKeys.auth.session(sessionId),
                    {
                        user: {
                            ...user,
                            createdAt: user.createdAt.toISOString(),
                        },
                    },
                    getSessionCacheTtl(sessionRow.expiresAt)
                );

                return { user, authUnavailable: false };
            } catch (error) {
                if (isMissingAuthRelation(error)) {
                    set.status = 503;
                    return { user: null, authUnavailable: true };
                }

                throw error;
            }
        }
    );

export default authGuard
