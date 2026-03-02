import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { and, eq, ne } from "drizzle-orm";
import * as dockerService from "../services/docker";
import * as composeService from "../services/compose";
import authGuard from "../services/authGuard";
import { cacheService } from "../services/CacheService";
import { CACHE_TTL, cacheKeys } from "../services/cacheKeys";

const errorResponse = t.Object({
  error: t.String(),
});

const serverStatsSchema = t.Object({
  cpuPercent: t.Number(),
  memoryUsage: t.Number(),
  memoryLimit: t.Number(),
  memoryPercent: t.Number(),
});

const serverStatusSchema = t.Union([
  t.Literal("running"),
  t.Literal("stopped"),
  t.Literal("error"),
  t.Literal("not_found"),
]);

const serverInfoSchema = t.Object({
  id: t.String(),
  name: t.String(),
  directoryPath: t.String(),
  port: t.Number(),
  version: t.String(),
  type: t.String(),
  memoryMb: t.Number(),
  statusCache: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

const serverWithStatusSchema = t.Object({
  ...serverInfoSchema.properties,
  status: serverStatusSchema,
  stats: t.Nullable(serverStatsSchema),
});

type ServerStatus = "running" | "stopped" | "error" | "not_found";

interface ServerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
}

interface SerializedServerWithStatus {
  id: string;
  name: string;
  directoryPath: string;
  port: number;
  version: string;
  type: string;
  memoryMb: number;
  statusCache: string | null;
  createdAt: string;
  updatedAt: string;
  status: ServerStatus;
  stats: ServerStats | null;
}

function serializeServer<T extends { createdAt: Date; updatedAt: Date }>(server: T) {
  return {
    ...server,
    createdAt: server.createdAt.toISOString(),
    updatedAt: server.updatedAt.toISOString(),
  };
}

async function findServerByPort(port: number, excludeId?: string) {
  const conditions = excludeId
    ? and(eq(schema.servers.port, port), ne(schema.servers.id, excludeId))
    : eq(schema.servers.port, port);

  const [server] = await db
    .select({
      id: schema.servers.id,
      name: schema.servers.name,
      port: schema.servers.port,
    })
    .from(schema.servers)
    .where(conditions)
    .limit(1);

  return server;
}

function isUniquePortViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "23505" &&
    "constraint_name" in err &&
    err.constraint_name === "servers_port_unique"
  );
}

async function invalidateServerCache(serverId: string) {
  await cacheService.delMany([
    cacheKeys.servers.list,
    cacheKeys.servers.detail(serverId),
    cacheKeys.servers.stats(serverId),
    cacheKeys.servers.properties(serverId),
  ]);
}

async function rebuildServerRuntime(serverId: string) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  if (!server) {
    return null;
  }

  await dockerService.removeContainer(serverId).catch(() => undefined);

  try {
    await dockerService.composeDown(composeService.getServerDir(serverId));
  } catch {
    // Ignore compose cleanup failures during rebuild.
  }

  await composeService.deleteServerFiles(serverId);

  const serverDir = await composeService.createServerFiles({
    serverId: server.id,
    name: server.name,
    port: server.port,
    version: server.version,
    type: server.type,
    memoryMb: server.memoryMb,
  });

  await db
    .update(schema.servers)
    .set({
      directoryPath: serverDir,
      statusCache: "stopped",
      updatedAt: new Date(),
    })
    .where(eq(schema.servers.id, server.id));

  await dockerService.composeUp(serverDir);

  const [updated] = await db
    .update(schema.servers)
    .set({
      directoryPath: serverDir,
      statusCache: "running",
      updatedAt: new Date(),
    })
    .where(eq(schema.servers.id, server.id))
    .returning();

  await invalidateServerCache(server.id);

  return updated;
}

async function getSerializedServer(serverId: string): Promise<SerializedServerWithStatus | null> {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  if (!server) {
    return null;
  }

  const status = await dockerService.getContainerStatus(serverId);
  const stats = status === "running"
    ? await dockerService.getContainerStats(serverId)
    : null;

  return {
    ...serializeServer(server),
    status,
    stats,
  };
}

const serverRoutes = new Elysia({ prefix: "/servers" })
  .use(authGuard)

  // ─── Guard: check auth on all server routes ────────────────
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

  // ─── List all servers ──────────────────────────────────────
  .get("/", async () => {
    const payload = await cacheService.remember(
      cacheKeys.servers.list,
      CACHE_TTL.serverList,
      async () => {
        const allServers = await db.select().from(schema.servers);
        const enriched = await Promise.all(
          allServers.map(async (server) => {
            const status = await dockerService.getContainerStatus(server.id);
            const stats = status === "running"
              ? await dockerService.getContainerStats(server.id)
              : null;

            return {
              ...serializeServer(server),
              status,
              stats,
            };
          })
        );

        return { servers: enriched };
      }
    );

    return payload;
  }, {
    response: {
      200: t.Object({ servers: t.Array(serverWithStatusSchema) }),
      401: errorResponse,
    },
  })

  // ─── Get single server ────────────────────────────────────
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const cached = await cacheService.get<{ server: SerializedServerWithStatus }>(
        cacheKeys.servers.detail(id)
      );
      if (cached?.server) {
        return cached;
      }

      const server = await getSerializedServer(id);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      const payload = { server };
      await cacheService.set(
        cacheKeys.servers.detail(id),
        payload,
        CACHE_TTL.serverDetail
      );

      return payload;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ server: serverWithStatusSchema }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )

  // ─── Create server ────────────────────────────────────────
  .post(
    "/",
    async ({ body, set }) => {
      const { name, port, version, type, memoryMb } = body;
      let createdServerId: string | null = null;

      try {
        const existingServer = await findServerByPort(port);
        if (existingServer) {
          set.status = 409;
          return {
            error: `Port ${port} is already in use by server "${existingServer.name}"`,
          };
        }

        // Insert into DB first to get the ID
        const [server] = await db
          .insert(schema.servers)
          .values({
            name,
            port,
            version: version || "latest",
            type: type || "vanilla",
            memoryMb: memoryMb || 1024,
            directoryPath: "", // will update after
            statusCache: "stopped",
          })
          .returning();
        createdServerId = server.id;

        // Create server files (docker-compose.yml + data dir)
        const serverDir = await composeService.createServerFiles({
          serverId: server.id,
          name,
          port,
          version: server.version,
          type: server.type,
          memoryMb: server.memoryMb,
        });

        // Update directoryPath
        await db
          .update(schema.servers)
          .set({ directoryPath: serverDir })
          .where(eq(schema.servers.id, server.id));

        // Run docker compose up
        await dockerService.composeUp(serverDir);

        // Update status
        await db
          .update(schema.servers)
          .set({ statusCache: "running", updatedAt: new Date() })
          .where(eq(schema.servers.id, server.id));

        await invalidateServerCache(server.id);

        return {
          server: {
            ...serializeServer(server),
            directoryPath: serverDir,
            statusCache: "running",
          },
        };
      } catch (err: any) {
        if (createdServerId) {
          await dockerService.removeContainer(createdServerId).catch(() => undefined);
          await composeService.deleteServerFiles(createdServerId).catch(() => undefined);
          await db.delete(schema.servers).where(eq(schema.servers.id, createdServerId)).catch(() => undefined);
          await invalidateServerCache(createdServerId);
        }
        if (isUniquePortViolation(err)) {
          set.status = 409;
          return { error: `Port ${port} is already in use` };
        }
        set.status = 500;
        return { error: `Failed to create server: ${err.message}` };
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        port: t.Number({ minimum: 1024, maximum: 65535 }),
        version: t.Optional(t.String()),
        type: t.Optional(t.String()),
        memoryMb: t.Optional(t.Number({ minimum: 512 })),
      }),
      response: {
        200: t.Object({ server: serverInfoSchema }),
        401: errorResponse,
        409: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Update server settings ────────────────────────────────
  .put(
    "/:id",
    async ({ params: { id }, body, set }) => {
      try {
        const [server] = await db
          .select()
          .from(schema.servers)
          .where(eq(schema.servers.id, id))
          .limit(1);

        if (!server) {
          set.status = 404;
          return { error: "Server not found" };
        }

        if (body.port !== undefined) {
          const existingServer = await findServerByPort(body.port, id);
          if (existingServer) {
            set.status = 409;
            return {
              error: `Port ${body.port} is already in use by server "${existingServer.name}"`,
            };
          }
        }

        const nextConfig = {
          serverId: id,
          name: body.name ?? server.name,
          port: body.port ?? server.port,
          version: body.version ?? server.version,
          type: body.type ?? server.type,
          memoryMb: body.memoryMb ?? server.memoryMb,
          jvmArgs: body.jvmArgs,
        };

        await composeService.updateServerFiles(nextConfig);

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (body.name !== undefined) updates.name = body.name;
        if (body.port !== undefined) updates.port = body.port;
        if (body.version !== undefined) updates.version = body.version;
        if (body.type !== undefined) updates.type = body.type;
        if (body.memoryMb !== undefined) updates.memoryMb = body.memoryMb;

        // Update DB
        const [updated] = await db
          .update(schema.servers)
          .set(updates)
          .where(eq(schema.servers.id, id))
          .returning();

        const restartRequired =
          body.port !== undefined ||
          body.version !== undefined ||
          body.type !== undefined ||
          body.memoryMb !== undefined;

        await invalidateServerCache(id);

        return { server: serializeServer(updated), restartRequired };
      } catch (err: any) {
        if (isUniquePortViolation(err)) {
          set.status = 409;
          return { error: `Port ${body.port} is already in use` };
        }
        set.status = 500;
        return { error: `Failed to update server: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        port: t.Optional(t.Number({ minimum: 1024, maximum: 65535 })),
        version: t.Optional(t.String()),
        type: t.Optional(t.String()),
        memoryMb: t.Optional(t.Number({ minimum: 512 })),
        jvmArgs: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          server: serverInfoSchema,
          restartRequired: t.Boolean(),
        }),
        401: errorResponse,
        404: errorResponse,
        409: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Delete server ─────────────────────────────────────────
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        // Stop and remove container
        await dockerService.removeContainer(id);

        // Try compose down if directory exists
        try {
          const serverDir = composeService.getServerDir(id);
          await dockerService.composeDown(serverDir);
        } catch { /* ok */ }

        // Delete server files
        await composeService.deleteServerFiles(id);

        // Delete from DB (cascades to backups)
        await db.delete(schema.servers).where(eq(schema.servers.id, id));

        await invalidateServerCache(id);

        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to delete: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Start server ─────────────────────────────────────────
  .post(
    "/:id/start",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        // Try compose up first (handles container not existing)
        const serverDir = composeService.getServerDir(id);
        await dockerService.composeUp(serverDir);
        await db
          .update(schema.servers)
          .set({ statusCache: "running", updatedAt: new Date() })
          .where(eq(schema.servers.id, id));
        await invalidateServerCache(id);
        return { success: true, status: "running" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to start: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), status: t.String() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Stop server ──────────────────────────────────────────
  .post(
    "/:id/stop",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        await dockerService.stopContainer(id);
        await db
          .update(schema.servers)
          .set({ statusCache: "stopped", updatedAt: new Date() })
          .where(eq(schema.servers.id, id));
        await invalidateServerCache(id);
        return { success: true, status: "stopped" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to stop: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), status: t.String() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Restart server ───────────────────────────────────────
  .post(
    "/:id/restart",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        await dockerService.restartContainer(id);
        await db
          .update(schema.servers)
          .set({ statusCache: "running", updatedAt: new Date() })
          .where(eq(schema.servers.id, id));
        await invalidateServerCache(id);
        return { success: true, status: "running" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to restart: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean(), status: t.String() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Recreate server runtime from current settings ────────
  .post(
    "/:id/recreate",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        const recreated = await rebuildServerRuntime(id);
        if (!recreated) {
          set.status = 404;
          return { error: "Server not found" };
        }

        return {
          success: true,
          status: "running",
          server: serializeServer(recreated),
        };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to recreate server: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.String(),
          server: serverInfoSchema,
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Get server stats ─────────────────────────────────────
  .get(
    "/:id/stats",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      const status = await dockerService.getContainerStatus(id);
      if (status !== "running") {
        await cacheService.del(cacheKeys.servers.stats(id));
        return { stats: null, status };
      }

      const payload = await cacheService.remember(
        cacheKeys.servers.stats(id),
        CACHE_TTL.serverStats,
        async () => ({
          stats: await dockerService.getContainerStats(id),
          status,
        })
      );

      return payload;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          stats: t.Nullable(serverStatsSchema),
          status: t.String(),
        }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )

  // ─── Get server.properties ─────────────────────────────────
  .get(
    "/:id/properties",
    async ({ params: { id }, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      const payload = await cacheService.remember(
        cacheKeys.servers.properties(id),
        CACHE_TTL.serverProperties,
        async () => ({
          properties: await composeService.readServerProperties(id),
        })
      );

      return payload;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          properties: t.Record(t.String(), t.String()),
        }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )

  // ─── Update server.properties ──────────────────────────────
  .put(
    "/:id/properties",
    async ({ params: { id }, body, set }) => {
      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, id))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        await composeService.writeServerProperties(id, body.properties);
        await invalidateServerCache(id);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to update properties: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        properties: t.Record(t.String(), t.String()),
      }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  );


export default serverRoutes
