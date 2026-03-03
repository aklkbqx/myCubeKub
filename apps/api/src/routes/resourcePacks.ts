import { Elysia, t } from "elysia";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "../db";
import authGuard from "../services/authGuard";
import { cacheService } from "../services/CacheService";
import { cacheKeys } from "../services/cacheKeys";
import * as composeService from "../services/compose";
import {
  buildMergedResourcePack,
  deleteMergedResourcePackFiles,
  deleteResourcePackImage,
  deleteStoredResourcePackByFilename,
  getPublicResourcePackPath,
  getPublicResourcePackUrl,
  previewMergedResourcePackConflicts,
  readResourcePackManifest,
  saveUploadedResourcePack,
  updateBuiltResourcePackImage,
} from "../services/resourcePacks";

const errorResponse = t.Object({
  error: t.String(),
});

const resourcePackSchema = t.Object({
  id: t.String(),
  name: t.String(),
  originalFilename: t.String(),
  storedFilename: t.String(),
  imageFilename: t.Nullable(t.String()),
  imagePublicPath: t.Nullable(t.String()),
  imageUrl: t.Nullable(t.String()),
  sha1: t.String(),
  sizeBytes: t.Number(),
  createdAt: t.String(),
});

const resourcePackBuildSchema = t.Object({
  id: t.String(),
  name: t.String(),
  generatedFilename: t.String(),
  publicPath: t.String(),
  publicUrl: t.String(),
  imageFilename: t.Nullable(t.String()),
  imagePublicPath: t.Nullable(t.String()),
  imageUrl: t.Nullable(t.String()),
  sha1: t.String(),
  sizeBytes: t.Number(),
  conflictCount: t.Number(),
  packCount: t.Number(),
  createdAt: t.String(),
});

const resourcePackBuildDetailSchema = t.Object({
  build: resourcePackBuildSchema,
  packs: t.Array(resourcePackSchema),
  conflicts: t.Array(t.String()),
});

function serializePack(pack: typeof schema.resourcePacks.$inferSelect) {
  return {
    id: pack.id,
    name: pack.name,
    originalFilename: pack.originalFilename,
    storedFilename: pack.storedFilename,
    imageFilename: pack.imageFilename,
    imagePublicPath: pack.imagePublicPath,
    imageUrl: pack.imagePublicPath ? getPublicResourcePackUrl(pack.imagePublicPath) : null,
    sha1: pack.sha1,
    sizeBytes: pack.sizeBytes,
    createdAt: pack.createdAt.toISOString(),
  };
}

function serializeBuild(
  build: typeof schema.resourcePackBuilds.$inferSelect,
  packCount: number
) {
  return {
    id: build.id,
    name: build.name,
    generatedFilename: build.generatedFilename,
    publicPath: build.publicPath,
    publicUrl: getPublicResourcePackUrl(build.publicPath),
    imageFilename: build.imageFilename,
    imagePublicPath: build.imagePublicPath,
    imageUrl: build.imagePublicPath ? getPublicResourcePackUrl(build.imagePublicPath) : null,
    sha1: build.sha1,
    sizeBytes: build.sizeBytes,
    conflictCount: build.conflictCount,
    packCount,
    createdAt: build.createdAt.toISOString(),
  };
}

async function findServer(serverId: string) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  return server;
}

async function invalidateServerPropertiesCache(serverId: string) {
  await cacheService.delMany([
    cacheKeys.servers.detail(serverId),
    cacheKeys.servers.properties(serverId),
  ]);
}

const resourcePackRoutes = new Elysia({ prefix: "/resource-packs" })
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
    async ({ query, set }) => {
      const server = await findServer(query.serverId);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      const packs = await db
        .select()
        .from(schema.resourcePacks)
        .where(eq(schema.resourcePacks.serverId, query.serverId))
        .orderBy(asc(schema.resourcePacks.createdAt));

      return { packs: packs.map(serializePack) };
    },
    {
      query: t.Object({ serverId: t.String() }),
      response: {
        200: t.Object({ packs: t.Array(resourcePackSchema) }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const [pack] = await db
        .select()
        .from(schema.resourcePacks)
        .where(eq(schema.resourcePacks.id, id))
        .limit(1);

      if (!pack) {
        set.status = 404;
        return { error: "Resource pack not found" };
      }

      const [usage] = await db
        .select()
        .from(schema.resourcePackBuildItems)
        .where(eq(schema.resourcePackBuildItems.packId, id))
        .limit(1);

      if (usage) {
        set.status = 409;
        return { error: "Resource pack is used by an existing merged build. Delete the related build first." };
      }

      try {
        await db.delete(schema.resourcePacks).where(eq(schema.resourcePacks.id, id));
        await deleteResourcePackImage(pack.imageFilename);
        await deleteStoredResourcePackByFilename(pack.storedFilename, pack.filePath);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to delete resource pack" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        409: errorResponse,
        500: errorResponse,
      },
    }
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, set }) => {
      const [pack] = await db
        .update(schema.resourcePacks)
        .set({ name: body.name.trim() })
        .where(eq(schema.resourcePacks.id, id))
        .returning();

      if (!pack) {
        set.status = 404;
        return { error: "Resource pack not found" };
      }

      return { pack: serializePack(pack) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ name: t.String({ minLength: 1 }) }),
      response: {
        200: t.Object({ pack: resourcePackSchema }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
  .get(
    "/builds",
    async ({ query, set }) => {
      const server = await findServer(query.serverId);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      const builds = await db
        .select()
        .from(schema.resourcePackBuilds)
        .where(eq(schema.resourcePackBuilds.serverId, query.serverId))
        .orderBy(asc(schema.resourcePackBuilds.createdAt));

      const items = await db
        .select()
        .from(schema.resourcePackBuildItems);

      const counts = new Map<string, number>();
      for (const item of items) {
        counts.set(item.buildId, (counts.get(item.buildId) || 0) + 1);
      }

      return {
        builds: builds.map((build) => serializeBuild(build, counts.get(build.id) || 0)),
      };
    },
    {
      query: t.Object({ serverId: t.String() }),
      response: {
        200: t.Object({ builds: t.Array(resourcePackBuildSchema) }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
  .patch(
    "/builds/:id",
    async ({ params: { id }, body, set }) => {
      const [build] = await db
        .update(schema.resourcePackBuilds)
        .set({ name: body.name.trim() })
        .where(and(eq(schema.resourcePackBuilds.id, id), eq(schema.resourcePackBuilds.serverId, body.serverId)))
        .returning();

      if (!build) {
        set.status = 404;
        return { error: "Resource pack build not found" };
      }

      const items = await db
        .select()
        .from(schema.resourcePackBuildItems)
        .where(eq(schema.resourcePackBuildItems.buildId, id));

      return { build: serializeBuild(build, items.length) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ serverId: t.String(), name: t.String({ minLength: 1 }) }),
      response: {
        200: t.Object({ build: resourcePackBuildSchema }),
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
  .delete(
    "/builds/:id",
    async ({ params: { id }, query, set }) => {
      const [build] = await db
        .select()
        .from(schema.resourcePackBuilds)
        .where(and(eq(schema.resourcePackBuilds.id, id), eq(schema.resourcePackBuilds.serverId, query.serverId)))
        .limit(1);

      if (!build) {
        set.status = 404;
        return { error: "Resource pack build not found" };
      }

      try {
        await db.delete(schema.resourcePackBuilds).where(eq(schema.resourcePackBuilds.id, id));
        await deleteResourcePackImage(build.imageFilename);
        await deleteMergedResourcePackFiles(build.generatedFilename);
        return { success: true };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to delete resource pack build" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ serverId: t.String() }),
      response: {
        200: t.Object({ success: t.Boolean() }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )
  .get(
    "/builds/:id",
    async ({ params: { id }, query, set }) => {
      const [build] = await db
        .select()
        .from(schema.resourcePackBuilds)
        .where(and(eq(schema.resourcePackBuilds.id, id), eq(schema.resourcePackBuilds.serverId, query.serverId)))
        .limit(1);

      if (!build) {
        set.status = 404;
        return { error: "Resource pack build not found" };
      }

      const items = await db
        .select()
        .from(schema.resourcePackBuildItems)
        .where(eq(schema.resourcePackBuildItems.buildId, id))
        .orderBy(asc(schema.resourcePackBuildItems.sortOrder));

      const packs = items.length > 0
        ? await db
            .select()
            .from(schema.resourcePacks)
            .where(inArray(schema.resourcePacks.id, items.map((item) => item.packId)))
        : [];

      const packById = new Map(packs.map((pack) => [pack.id, pack]));
      const orderedPacks = items
        .map((item) => packById.get(item.packId))
        .filter((pack): pack is typeof packs[number] => Boolean(pack));
      const manifest = await readResourcePackManifest(build.generatedFilename);

      return {
        build: serializeBuild(build, orderedPacks.length),
        packs: orderedPacks.map(serializePack),
        conflicts: manifest?.conflictPaths || [],
      };
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Object({ serverId: t.String() }),
      response: {
        200: resourcePackBuildDetailSchema,
        401: errorResponse,
        404: errorResponse,
      },
    }
  )
  .post(
    "/preview",
    async ({ body, set }) => {
      const server = await findServer(body.serverId);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        const packs = await db
          .select()
          .from(schema.resourcePacks)
          .where(and(
            inArray(schema.resourcePacks.id, body.packIds),
            eq(schema.resourcePacks.serverId, body.serverId)
          ));

        const packById = new Map(packs.map((pack) => [pack.id, pack]));
        const orderedPacks = body.packIds
          .map((packId) => packById.get(packId))
          .filter((pack): pack is typeof packs[number] => Boolean(pack));

        if (orderedPacks.length !== body.packIds.length) {
          set.status = 404;
          return { error: "One or more resource packs were not found" };
        }

        const conflicts = await previewMergedResourcePackConflicts(
          orderedPacks.map((pack) => ({
            id: pack.id,
            name: pack.name,
            storedFilename: pack.storedFilename,
            filePath: pack.filePath,
          }))
        );

        return {
          packs: orderedPacks.map(serializePack),
          conflicts,
        };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to preview merged resource pack" };
      }
    },
    {
      body: t.Object({
        serverId: t.String(),
        packIds: t.Array(t.String(), { minItems: 1 }),
      }),
      response: {
        200: t.Object({
          packs: t.Array(resourcePackSchema),
          conflicts: t.Array(t.String()),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )
  .post(
    "/upload",
    async ({ body, set }) => {
      const server = await findServer(body.serverId);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        const uploaded = await saveUploadedResourcePack(body.file, body.name);

        const [pack] = await db
          .insert(schema.resourcePacks)
          .values({
            ...uploaded,
            serverId: body.serverId,
          })
          .returning();

        return { pack: serializePack(pack) };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to upload resource pack" };
      }
    },
    {
      body: t.Object({
        serverId: t.String(),
        file: t.File(),
        name: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({ pack: resourcePackSchema }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )
  .post(
    "/builds/:id/image",
    async ({ params: { id }, body, set }) => {
      const [build] = await db
        .select()
        .from(schema.resourcePackBuilds)
        .where(eq(schema.resourcePackBuilds.id, id))
        .limit(1);

      if (!build) {
        set.status = 404;
        return { error: "Resource pack build not found" };
      }

      try {
        const items = await db
          .select()
          .from(schema.resourcePackBuildItems)
          .where(eq(schema.resourcePackBuildItems.buildId, id));
        const nextMeta = await updateBuiltResourcePackImage(
          build.id,
          getPublicResourcePackPath(build.generatedFilename),
          body.file
        );
        const [updatedBuild] = await db
          .update(schema.resourcePackBuilds)
          .set({
            imageFilename: nextMeta.imageFilename,
            imagePublicPath: nextMeta.imagePublicPath,
            sha1: nextMeta.sha1,
            sizeBytes: nextMeta.sizeBytes,
          })
          .where(eq(schema.resourcePackBuilds.id, id))
          .returning();

        return { build: serializeBuild(updatedBuild, items.length) };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to update merged resource pack image" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ file: t.File() }),
      response: {
        200: t.Object({ build: resourcePackBuildSchema }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )
  .post(
    "/build",
    async ({ body, set }) => {
      const server = await findServer(body.serverId);
      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        const packs = await db
          .select()
          .from(schema.resourcePacks)
          .where(and(
            inArray(schema.resourcePacks.id, body.packIds),
            eq(schema.resourcePacks.serverId, body.serverId)
          ));

        const packById = new Map(packs.map((pack) => [pack.id, pack]));
        const orderedPacks = body.packIds
          .map((packId) => packById.get(packId))
          .filter((pack): pack is typeof packs[number] => Boolean(pack));

        if (orderedPacks.length !== body.packIds.length) {
          set.status = 404;
          return { error: "One or more resource packs were not found" };
        }

        const buildId = randomUUID();
        const merged = await buildMergedResourcePack({
          buildId,
          name: body.name,
          image: body.image || null,
          packs: orderedPacks.map((pack) => ({
            id: pack.id,
            name: pack.name,
            storedFilename: pack.storedFilename,
            filePath: pack.filePath,
          })),
        });

        const [build] = await db
          .insert(schema.resourcePackBuilds)
          .values({
            id: buildId,
            serverId: body.serverId,
            name: body.name,
            generatedFilename: merged.generatedFilename,
            filePath: merged.filePath,
            publicPath: merged.publicPath,
            imageFilename: merged.imageFilename,
            imagePublicPath: merged.imagePublicPath,
            sha1: merged.sha1,
            sizeBytes: merged.sizeBytes,
            conflictCount: merged.conflictPaths.length,
          })
          .returning();

        if (orderedPacks.length > 0) {
          await db.insert(schema.resourcePackBuildItems).values(
            orderedPacks.map((pack, index) => ({
              buildId,
              packId: pack.id,
              sortOrder: index,
            }))
          );
        }

        return {
          build: serializeBuild(build, orderedPacks.length),
          conflicts: merged.conflictPaths,
        };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to build merged resource pack" };
      }
    },
    {
      body: t.Object({
        serverId: t.String(),
        name: t.String(),
        packIds: t.Array(t.String(), { minItems: 1 }),
        image: t.Optional(t.File()),
      }),
      response: {
        200: t.Object({
          build: resourcePackBuildSchema,
          conflicts: t.Array(t.String()),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  )
  .post(
    "/builds/:id/assign",
    async ({ params: { id }, body, set }) => {
      const [build] = await db
        .select()
        .from(schema.resourcePackBuilds)
        .where(and(eq(schema.resourcePackBuilds.id, id), eq(schema.resourcePackBuilds.serverId, body.serverId)))
        .limit(1);

      if (!build) {
        set.status = 404;
        return { error: "Resource pack build not found" };
      }

      const [server] = await db
        .select()
        .from(schema.servers)
        .where(eq(schema.servers.id, body.serverId))
        .limit(1);

      if (!server) {
        set.status = 404;
        return { error: "Server not found" };
      }

      try {
        const buildItems = await db
          .select()
          .from(schema.resourcePackBuildItems)
          .where(eq(schema.resourcePackBuildItems.buildId, build.id));

        const { properties: currentProperties } = await composeService.readServerProperties(server.id);
        const nextProperties: Record<string, string> = {
          ...currentProperties,
          "resource-pack": getPublicResourcePackUrl(build.publicPath),
          "resource-pack-sha1": build.sha1,
          "require-resource-pack": body.required ? "true" : "false",
        };

        if (body.prompt !== undefined) {
          nextProperties["resource-pack-prompt"] = body.prompt;
        }

        await composeService.writeServerProperties(server.id, nextProperties);
        await invalidateServerPropertiesCache(server.id);

        return {
          success: true,
          serverId: server.id,
          build: serializeBuild(build, buildItems.length),
          properties: {
            "resource-pack": nextProperties["resource-pack"],
            "resource-pack-sha1": nextProperties["resource-pack-sha1"],
            "resource-pack-prompt": nextProperties["resource-pack-prompt"] || "",
            "require-resource-pack": nextProperties["require-resource-pack"],
          },
        };
      } catch (err: any) {
        set.status = 500;
        return { error: err.message || "Failed to assign resource pack build" };
      }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        serverId: t.String(),
        prompt: t.Optional(t.String()),
        required: t.Optional(t.Boolean()),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          serverId: t.String(),
          build: resourcePackBuildSchema,
          properties: t.Object({
            "resource-pack": t.String(),
            "resource-pack-sha1": t.String(),
            "resource-pack-prompt": t.String(),
            "require-resource-pack": t.String(),
          }),
        }),
        401: errorResponse,
        404: errorResponse,
        500: errorResponse,
      },
    }
  );

export default resourcePackRoutes;
