import { Elysia, t } from "elysia";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import authGuard from "../services/authGuard";
import { getServerDir } from "../services/compose";
import { readdir, stat, mkdir, rm, rename, readFile, writeFile } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import { cacheService } from "../services/CacheService";
import { CACHE_TTL, cacheKeys } from "../services/cacheKeys";

const errorResponse = t.Object({
  error: t.String(),
});

const fileInfoSchema = t.Object({
  name: t.String(),
  path: t.String(),
  isDirectory: t.Boolean(),
  size: t.Number(),
  modifiedAt: t.String(),
});

function normalizeRelativePath(path?: string | null): string {
  if (!path || path === "undefined" || path === "null") {
    return "";
  }

  return path;
}

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

function isFileInfo(
  file: Awaited<ReturnType<typeof getFileInfo>> | null
): file is Awaited<ReturnType<typeof getFileInfo>> {
  return file !== null;
}

async function invalidateFileCache(serverId: string) {
  await cacheService.delByPattern(cacheKeys.files.pattern(serverId));
}

function toArchiveFilename(serverName: string) {
  return `${serverName.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-") || "server"}-data.tar.gz`;
}

function toPathArchiveFilename(path: string) {
  const name = basename(path || "data");
  const safeName = name.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-") || "archive";
  return `${safeName}.tar.gz`;
}

const fileRoutes = new Elysia({ prefix: "/servers" })
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
        const relativePath = normalizeRelativePath(query.path);
        const payload = await cacheService.remember(
          cacheKeys.files.list(id, relativePath),
          CACHE_TTL.filesList,
          async () => {
            const dirPath = safePath(id, relativePath);

            if (!existsSync(dirPath)) {
              return { files: [], path: relativePath };
            }

            const entries = await readdir(dirPath);
            const files = await Promise.all(
              entries.map(async (entry) => {
                const fullPath = join(dirPath, entry);
                const entryRelativePath = join(relativePath, entry);
                try {
                  return await getFileInfo(fullPath, entryRelativePath);
                } catch {
                  return null;
                }
              })
            );

            const sorted = files
              .filter(isFileInfo)
              .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
              });

            return { files: sorted, path: relativePath };
          }
        );

        return payload;
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.Optional(t.String()) }),
      response: {
        200: t.Object({
          files: t.Array(fileInfoSchema),
          path: t.String(),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const payload = await cacheService.remember(
          cacheKeys.files.content(id, normalizeRelativePath(query.path)),
          CACHE_TTL.fileContent,
          async () => {
            const normalizedPath = normalizeRelativePath(query.path);
            const filePath = safePath(id, normalizedPath);
            const content = await readFile(filePath, "utf-8");
            return { content, path: normalizedPath };
          }
        );

        return payload;
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.String() }),
      response: {
        200: t.Object({
          content: t.String(),
          path: t.String(),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const filePath = safePath(id, normalizeRelativePath(body.path));
        await writeFile(filePath, body.content, "utf-8");
        await invalidateFileCache(id);
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
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const dirPath = safePath(id, normalizeRelativePath(body.path));
        await mkdir(dirPath, { recursive: true });
        await invalidateFileCache(id);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ path: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const targetPath = safePath(id, normalizeRelativePath(query.path));
        await rm(targetPath, { recursive: true, force: true });
        await invalidateFileCache(id);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ path: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const oldPath = safePath(id, normalizeRelativePath(body.oldPath));
        const newPath = safePath(id, normalizeRelativePath(body.newPath));
        await rename(oldPath, newPath);
        await invalidateFileCache(id);
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
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
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
        const uploadDir = safePath(id, normalizeRelativePath(body.path));
        if (!existsSync(uploadDir)) {
          await mkdir(uploadDir, { recursive: true });
        }

        const file = body.file;
        const filePath = join(uploadDir, file.name);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));
        await invalidateFileCache(id);

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
      response: {
        200: t.Object({
          success: t.Boolean(),
          filename: t.String(),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )

  // ─── Download entire data directory ───────────────────────
  .get(
    "/:id/files/download-all",
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
        const dataDir = safePath(id, "");

        if (!existsSync(dataDir)) {
          set.status = 404;
          return { error: "Server data directory not found" };
        }

        const archiveName = toArchiveFilename(server.name);
        const proc = Bun.spawn(["tar", "-czf", "-", "."], {
          cwd: dataDir,
          stdout: "pipe",
          stderr: "pipe",
        });

        set.headers["content-type"] = "application/gzip";
        set.headers["content-disposition"] = `attachment; filename="${archiveName}"`;

        return new Response(proc.stdout, {
          headers: {
            "content-type": "application/gzip",
            "content-disposition": `attachment; filename="${archiveName}"`,
          },
        });
      } catch (err: any) {
        set.status = 500;
        return { error: err.message };
      }
    },
    {
      params: t.Object({ id: t.String() }),
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
        const normalizedPath = normalizeRelativePath(query.path);
        const filePath = safePath(id, normalizedPath);
        const file = Bun.file(filePath);

        if (!await file.exists()) {
          set.status = 404;
          return { error: "File not found" };
        }

        const targetStats = await stat(filePath);
        if (targetStats.isDirectory()) {
          const archiveName = toPathArchiveFilename(normalizedPath);
          const proc = Bun.spawn(["tar", "-czf", "-", "."], {
            cwd: filePath,
            stdout: "pipe",
            stderr: "pipe",
          });

          set.headers["content-type"] = "application/gzip";
          set.headers["content-disposition"] = `attachment; filename="${archiveName}"`;

          return new Response(proc.stdout, {
            headers: {
              "content-type": "application/gzip",
              "content-disposition": `attachment; filename="${archiveName}"`,
            },
          });
        }

        set.headers["content-disposition"] = `attachment; filename="${basename(normalizedPath)}"`;
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


export default fileRoutes
