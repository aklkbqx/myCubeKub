import { mkdir, readdir, copyFile, stat, rm, writeFile, readFile } from "fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_FILE_BASE_URL } from "../utils";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const SERVICE_DIR = fileURLToPath(new URL(".", import.meta.url));
const API_ROOT_DIR = resolve(SERVICE_DIR, "../..");
const STORAGE_ROOT_DIR = resolve(API_ROOT_DIR, "storage", "resource-packs");
const SOURCE_PACKS_DIR = join(STORAGE_ROOT_DIR, "sources");
const BUILDS_WORK_DIR = join(STORAGE_ROOT_DIR, "build-work");
const PUBLIC_PACKS_DIR = resolve(API_ROOT_DIR, "public", "resource-packs");

interface MergeSourcePack {
  id: string;
  name: string;
  storedFilename?: string;
  filePath: string;
}

interface MergeBuildOptions {
  buildId: string;
  name: string;
  packs: MergeSourcePack[];
  image?: File | null;
}

interface MergeBuildResult {
  generatedFilename: string;
  filePath: string;
  publicPath: string;
  publicUrl: string;
  imageFilename: string | null;
  imagePublicPath: string | null;
  sha1: string;
  sizeBytes: number;
  conflictPaths: string[];
}

interface ResourcePackManifest {
  name: string;
  generatedFilename: string;
  publicPath: string;
  sha1: string;
  sizeBytes: number;
  packs: Array<{ id: string; name: string }>;
  conflictPaths: string[];
}

const BUILD_IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/png": ".png",
};

function slugifyName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "resource-pack";
}

async function ensureDirectories() {
  await Promise.all([
    mkdir(SOURCE_PACKS_DIR, { recursive: true }),
    mkdir(BUILDS_WORK_DIR, { recursive: true }),
    mkdir(PUBLIC_PACKS_DIR, { recursive: true }),
  ]);
}

async function hashFile(filePath: string) {
  const arrayBuffer = await Bun.file(filePath).arrayBuffer();
  return createHash("sha1").update(Buffer.from(arrayBuffer)).digest("hex");
}

async function copyDirectoryRecursive(
  sourceDir: string,
  destinationDir: string,
  conflicts: Set<string>,
  relativePrefix = ""
) {
  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const relativePath = relativePrefix ? join(relativePrefix, entry.name) : entry.name;
    const destinationPath = join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, destinationPath, conflicts, relativePath);
      continue;
    }

    if (existsSync(destinationPath)) {
      conflicts.add(relativePath);
    }

    await mkdir(join(destinationPath, ".."), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

async function resolvePackRoot(extractedDir: string): Promise<string> {
  if (existsSync(join(extractedDir, "pack.mcmeta"))) {
    return extractedDir;
  }

  const entries = await readdir(extractedDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());

  if (directories.length === 1) {
    const nestedRoot = join(extractedDir, directories[0].name);
    if (existsSync(join(nestedRoot, "pack.mcmeta"))) {
      return nestedRoot;
    }
  }

  return extractedDir;
}

async function unzipToDirectory(zipPath: string, targetDir: string) {
  await mkdir(targetDir, { recursive: true });

  const proc = Bun.spawn(["unzip", "-oq", zipPath, "-d", targetDir], {
    stdout: "ignore",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || `Failed to unzip archive: ${basename(zipPath)}`);
  }
}

function resolveSourcePackArchivePath(
  pack: Pick<MergeSourcePack, "name" | "filePath" | "storedFilename">,
  options: { requireExists?: boolean } = {}
) {
  const candidates = [
    pack.storedFilename ? join(SOURCE_PACKS_DIR, pack.storedFilename) : null,
    pack.filePath,
  ].filter((value): value is string => Boolean(value));

  if (!options.requireExists) {
    if (candidates[0]) {
      return candidates[0];
    }

    throw new Error(`Resource pack archive path is missing for "${pack.name}"`);
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Resource pack archive not found for "${pack.name}". Expected one of: ${candidates.join(", ")}`
  );
}

async function zipDirectory(sourceDir: string, outputPath: string) {
  const proc = Bun.spawn(["zip", "-qr", outputPath, "."], {
    cwd: sourceDir,
    stdout: "ignore",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || "Failed to create merged resource pack");
  }
}

async function extractArchiveToDirectory(zipPath: string, targetDir: string) {
  await unzipToDirectory(zipPath, targetDir);
  return resolvePackRoot(targetDir);
}

async function syncPackImageFromDirectory(sourceDir: string, imageFilename: string) {
  const sourcePath = join(sourceDir, "pack.png");
  if (!existsSync(sourcePath)) {
    await deleteResourcePackImage(imageFilename);
    return {
      imageFilename: null,
      imagePublicPath: null,
    };
  }

  const targetPath = join(PUBLIC_PACKS_DIR, imageFilename);
  await copyFile(sourcePath, targetPath);

  return {
    imageFilename,
    imagePublicPath: `/public/resource-packs/${imageFilename}`,
  };
}

async function writeBuildImageToDirectory(targetDir: string, image: File) {
  if (!BUILD_IMAGE_EXTENSION_BY_MIME_TYPE[image.type]) {
    throw new Error("Only PNG images are supported");
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  await writeFile(join(targetDir, "pack.png"), buffer);
}

async function extractPackImageFromArchive(zipPath: string, imageFilename: string) {
  const workId = randomUUID();
  const workDir = join(BUILDS_WORK_DIR, `image-${workId}`);

  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  try {
    const packRoot = await extractArchiveToDirectory(zipPath, workDir);
    return await syncPackImageFromDirectory(packRoot, imageFilename);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function collectConflictPaths(packs: MergeSourcePack[]) {
  const previewId = randomUUID();
  const workDir = join(BUILDS_WORK_DIR, `preview-${previewId}`);
  const extractedRoot = join(workDir, "sources");
  const mergedRoot = join(workDir, "merged");
  const conflicts = new Set<string>();

  await rm(workDir, { recursive: true, force: true });
  await mkdir(extractedRoot, { recursive: true });
  await mkdir(mergedRoot, { recursive: true });

  try {
    for (let index = 0; index < packs.length; index += 1) {
      const pack = packs[index];
      const extractDir = join(extractedRoot, `${index + 1}-${slugifyName(pack.name)}`);
      await unzipToDirectory(resolveSourcePackArchivePath(pack, { requireExists: true }), extractDir);
      const packRoot = await resolvePackRoot(extractDir);
      await copyDirectoryRecursive(packRoot, mergedRoot, conflicts);
    }

    return [...conflicts].sort();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function saveUploadedResourcePack(file: File, name?: string) {
  await ensureDirectories();

  const extension = extname(file.name).toLowerCase();
  if (extension !== ".zip") {
    throw new Error("Only .zip resource packs are supported");
  }

  const id = randomUUID();
  const safeBaseName = slugifyName(name?.trim() || file.name.replace(/\.zip$/i, ""));
  const storedFilename = `${id}-${safeBaseName}.zip`;
  const filePath = join(SOURCE_PACKS_DIR, storedFilename);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  const image = await extractPackImageFromArchive(filePath, `${id}-cover.png`);

  const sha1 = createHash("sha1").update(buffer).digest("hex");

  return {
    id,
    name: name?.trim() || file.name.replace(/\.zip$/i, ""),
    originalFilename: file.name,
    storedFilename,
    filePath,
    ...image,
    sha1,
    sizeBytes: buffer.byteLength,
  };
}

export async function saveBuildResourcePackImage(buildId: string, image: File) {
  await ensureDirectories();

  const extension = BUILD_IMAGE_EXTENSION_BY_MIME_TYPE[image.type];
  if (!extension) {
    throw new Error("Only PNG images are supported");
  }

  const storedFilename = `${buildId}-cover${extension}`;
  const filePath = join(PUBLIC_PACKS_DIR, storedFilename);

  const arrayBuffer = await image.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  return {
    imageFilename: storedFilename,
    imagePublicPath: `/public/resource-packs/${storedFilename}`,
  };
}

export async function deleteResourcePackImage(imageFilename?: string | null) {
  if (!imageFilename) {
    return;
  }

  await rm(join(PUBLIC_PACKS_DIR, imageFilename), { force: true });
}

export async function buildMergedResourcePack(options: MergeBuildOptions): Promise<MergeBuildResult> {
  await ensureDirectories();

  if (options.packs.length === 0) {
    throw new Error("At least one resource pack is required to build");
  }

  const workDir = join(BUILDS_WORK_DIR, options.buildId);
  const extractedRoot = join(workDir, "sources");
  const mergedRoot = join(workDir, "merged");
  const conflicts = new Set<string>();

  await rm(workDir, { recursive: true, force: true });
  await mkdir(extractedRoot, { recursive: true });
  await mkdir(mergedRoot, { recursive: true });

  try {
    for (let index = 0; index < options.packs.length; index += 1) {
      const pack = options.packs[index];
      const extractDir = join(extractedRoot, `${index + 1}-${slugifyName(pack.name)}`);
      await unzipToDirectory(resolveSourcePackArchivePath(pack, { requireExists: true }), extractDir);
      const packRoot = await resolvePackRoot(extractDir);
      await copyDirectoryRecursive(packRoot, mergedRoot, conflicts);
    }

    if (!existsSync(join(mergedRoot, "pack.mcmeta"))) {
      throw new Error("Merged output is missing pack.mcmeta. Check uploaded resource packs.");
    }

    if (options.image) {
      await writeBuildImageToDirectory(mergedRoot, options.image);
    }

    const generatedFilename = `${options.buildId}-${slugifyName(options.name)}.zip`;
    const filePath = join(PUBLIC_PACKS_DIR, generatedFilename);
    const image = await syncPackImageFromDirectory(mergedRoot, `${options.buildId}-cover.png`);
    await zipDirectory(mergedRoot, filePath);

    const fileStats = await stat(filePath);
    const sha1 = await hashFile(filePath);
    const publicPath = `/public/resource-packs/${generatedFilename}`;
    const manifestPath = join(PUBLIC_PACKS_DIR, `${generatedFilename}.json`);
    const manifest: ResourcePackManifest = {
      name: options.name,
      generatedFilename,
      publicPath,
      sha1,
      sizeBytes: fileStats.size,
      packs: options.packs.map((pack) => ({ id: pack.id, name: pack.name })),
      conflictPaths: [...conflicts].sort(),
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    return {
      generatedFilename,
      filePath,
      publicPath,
      publicUrl: `${PUBLIC_FILE_BASE_URL}${publicPath}`,
      imageFilename: image.imageFilename,
      imagePublicPath: image.imagePublicPath,
      sha1,
      sizeBytes: fileStats.size,
      conflictPaths: [...conflicts].sort(),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function previewMergedResourcePackConflicts(packs: MergeSourcePack[]) {
  await ensureDirectories();
  if (packs.length === 0) {
    return [];
  }

  return collectConflictPaths(packs);
}

export async function readResourcePackManifest(generatedFilename: string): Promise<ResourcePackManifest | null> {
  const manifestPath = join(PUBLIC_PACKS_DIR, `${generatedFilename}.json`);

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as ResourcePackManifest;
  } catch {
    return null;
  }
}

export async function deleteStoredResourcePackByFilename(storedFilename: string, filePath?: string) {
  const resolvedPath = resolveSourcePackArchivePath({
    name: storedFilename,
    storedFilename,
    filePath: filePath || "",
  });

  await rm(resolvedPath, { force: true });
}

export async function replaceBuildPackImage(buildArchivePath: string, image: File) {
  await ensureDirectories();

  if (!BUILD_IMAGE_EXTENSION_BY_MIME_TYPE[image.type]) {
    throw new Error("Only PNG images are supported");
  }

  const workId = randomUUID();
  const workDir = join(BUILDS_WORK_DIR, `build-image-${workId}`);
  const mergedRoot = join(workDir, "merged");

  await rm(workDir, { recursive: true, force: true });
  await mkdir(mergedRoot, { recursive: true });

  try {
    await unzipToDirectory(buildArchivePath, mergedRoot);
    const buffer = Buffer.from(await image.arrayBuffer());
    await writeFile(join(mergedRoot, "pack.png"), buffer);
    await zipDirectory(mergedRoot, buildArchivePath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

export async function updateBuiltResourcePackImage(buildId: string, buildArchivePath: string, image: File) {
  await replaceBuildPackImage(buildArchivePath, image);
  const imageMeta = await saveBuildResourcePackImage(buildId, image);
  const fileStats = await stat(buildArchivePath);
  const sha1 = await hashFile(buildArchivePath);

  return {
    ...imageMeta,
    sha1,
    sizeBytes: fileStats.size,
  };
}

export async function deleteMergedResourcePackFiles(generatedFilename: string) {
  const archivePath = join(PUBLIC_PACKS_DIR, generatedFilename);
  const manifestPath = join(PUBLIC_PACKS_DIR, `${generatedFilename}.json`);

  await Promise.all([
    rm(archivePath, { force: true }),
    rm(manifestPath, { force: true }),
  ]);
}

export async function deleteResourcePackDataForServer(serverId: string) {
  const [packs, builds] = await Promise.all([
    db
      .select()
      .from(schema.resourcePacks)
      .where(eq(schema.resourcePacks.serverId, serverId)),
    db
      .select()
      .from(schema.resourcePackBuilds)
      .where(eq(schema.resourcePackBuilds.serverId, serverId)),
  ]);

  for (const pack of packs) {
    await deleteResourcePackImage(pack.imageFilename);
    await deleteStoredResourcePackByFilename(pack.storedFilename, pack.filePath);
  }

  for (const build of builds) {
    await deleteResourcePackImage(build.imageFilename);
    await deleteMergedResourcePackFiles(build.generatedFilename);
  }

  await db.delete(schema.resourcePackBuilds).where(eq(schema.resourcePackBuilds.serverId, serverId));
  await db.delete(schema.resourcePacks).where(eq(schema.resourcePacks.serverId, serverId));

  return {
    packCount: packs.length,
    buildCount: builds.length,
  };
}

export function getPublicResourcePackPath(filename: string) {
  return join(PUBLIC_PACKS_DIR, filename);
}

export function getPublicResourcePackUrl(publicPath: string) {
  return `${PUBLIC_FILE_BASE_URL}${publicPath}`;
}
