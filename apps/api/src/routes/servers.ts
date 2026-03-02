import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { and, eq, ne } from "drizzle-orm";
import { authGuard } from "./auth";
import * as dockerService from "../services/docker";
import * as composeService from "../services/compose";

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

export const serverRoutes = new Elysia({ prefix: "/servers" })
  .use(authGuard)

  // ─── Guard: check auth on all server routes ────────────────
  .onBeforeHandle(({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
  })

  // ─── List all servers ──────────────────────────────────────
  .get("/", async () => {
    const allServers = await db.select().from(schema.servers);

    // Enrich with Docker status
    const enriched = await Promise.all(
      allServers.map(async (server) => {
        const status = await dockerService.getContainerStatus(server.id);
        let stats = null;
        if (status === "running") {
          stats = await dockerService.getContainerStats(server.id);
        }
        return {
          ...server,
          status,
          stats,
        };
      })
    );

    return { servers: enriched };
  })

  // ─── Get single server ────────────────────────────────────
  .get(
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

      const status = await dockerService.getContainerStatus(id);
      let stats = null;
      if (status === "running") {
        stats = await dockerService.getContainerStats(id);
      }

      return { server: { ...server, status, stats } };
    },
    {
      params: t.Object({ id: t.String() }),
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

        return {
          server: { ...server, directoryPath: serverDir, status: "running" },
        };
      } catch (err: any) {
        if (createdServerId) {
          await dockerService.removeContainer(createdServerId).catch(() => undefined);
          await composeService.deleteServerFiles(createdServerId).catch(() => undefined);
          await db.delete(schema.servers).where(eq(schema.servers.id, createdServerId)).catch(() => undefined);
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

        return { server: updated, restartRequired };
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

        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to delete: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
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
        return { success: true, status: "running" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to start: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
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
        return { success: true, status: "stopped" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to stop: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
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
        return { success: true, status: "running" };
      } catch (err: any) {
        set.status = 500;
        return { error: `Failed to restart: ${err.message}` };
      }
    },
    {
      params: t.Object({ id: t.String() }),
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
        return { stats: null, status };
      }

      const stats = await dockerService.getContainerStats(id);
      return { stats, status };
    },
    {
      params: t.Object({ id: t.String() }),
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

      const properties = await composeService.readServerProperties(id);
      return { properties };
    },
    {
      params: t.Object({ id: t.String() }),
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
    }
  );
