import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { authGuard } from "./auth";
import { getServerDir } from "../services/compose";
import { readdir, stat, mkdir, rm, rename, readFile, writeFile } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { existsSync } from "fs";

/**
 * Get the safe resolved path within a server's data directory
 */
function safePath(serverId: string, relativePath: string): string {
  const dataDir = join(getServerDir(serverId), "data");
  const resolved = join(dataDir, relativePath || "");

  // Prevent directory traversal
  if (!resolved.startsWith(dataDir)) {
    throw new Error("Invalid path: directory traversal detected");
  }

  return resolved;
}

/**
 * Get file info for a path
 */
async function getFileInfo(fullPath: string, relativePath: string) {
  const stats = await stat(fullPath);
  return {
    name: basename(fullPath),
    path: relativePath,
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
}

export const fileRoutes = new Elysia({ prefix: "/servers" })
  .use(authGuard)
  .onBeforeHandle(({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Not authenticated" };
    }
  })

  // ─── List files ────────────────────────────────────────────
  .get(
    "/:id/files",
    async ({ params: { id }, query, set }) => {
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
        const dirPath = safePath(id, query.path || "");

        if (!existsSync(dirPath)) {
          return { files: [], path: query.path || "" };
        }

        const entries = await readdir(dirPath);
        const files = await Promise.all(
          entries.map(async (entry) => {
            const fullPath = join(dirPath, entry);
            const relativePath = join(query.path || "", entry);
            try {
              return await getFileInfo(fullPath, relativePath);
            } catch {
              return null;
            }
          })
        );

        // Sort: directories first, then alphabetically
        const sorted = files
          .filter(Boolean)
          .sort((a, b) => {
            if (a!.isDirectory !== b!.isDirectory) return a!.isDirectory ? -1 : 1;
            return a!.name.localeCompare(b!.name);
          });

        return { files: sorted, path: query.path || "" };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.Optional(t.String()) }),
    }
  )

  // ─── Read file content ─────────────────────────────────────
  .get(
    "/:id/files/content",
    async ({ params: { id }, query, set }) => {
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
        const filePath = safePath(id, query.path);
        const content = await readFile(filePath, "utf-8");
        return { content, path: query.path };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.String() }),
    }
  )

  // ─── Write file content ────────────────────────────────────
  .put(
    "/:id/files/content",
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
        const filePath = safePath(id, body.path);
        await writeFile(filePath, body.content, "utf-8");
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        path: t.String(),
        content: t.String(),
      }),
    }
  )

  // ─── Create directory ──────────────────────────────────────
  .post(
    "/:id/files/mkdir",
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
        const dirPath = safePath(id, body.path);
        await mkdir(dirPath, { recursive: true });
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ path: t.String() }),
    }
  )

  // ─── Delete file/directory ─────────────────────────────────
  .delete(
    "/:id/files",
    async ({ params: { id }, query, set }) => {
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
        const targetPath = safePath(id, query.path);
        await rm(targetPath, { recursive: true, force: true });
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.String() }),
    }
  )

  // ─── Rename file/directory ─────────────────────────────────
  .patch(
    "/:id/files/rename",
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
        const oldPath = safePath(id, body.oldPath);
        const newPath = safePath(id, body.newPath);
        await rename(oldPath, newPath);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        oldPath: t.String(),
        newPath: t.String(),
      }),
    }
  )

  // ─── Upload file ───────────────────────────────────────────
  .post(
    "/:id/files/upload",
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
        const uploadDir = safePath(id, body.path || "");
        if (!existsSync(uploadDir)) {
          await mkdir(uploadDir, { recursive: true });
        }

        const file = body.file;
        const filePath = join(uploadDir, file.name);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));

        return { success: true, filename: file.name };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        file: t.File(),
        path: t.Optional(t.String()),
      }),
    }
  )

  // ─── Download file ─────────────────────────────────────────
  .get(
    "/:id/files/download",
    async ({ params: { id }, query, set }) => {
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
        const filePath = safePath(id, query.path);
        const file = Bun.file(filePath);

        if (!await file.exists()) {
          set.status = 404;
          return { error: "File not found" };
        }

        set.headers["content-disposition"] = `attachment; filename="${basename(query.path)}"`;
        return file;
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.String() }),
    }
  );
