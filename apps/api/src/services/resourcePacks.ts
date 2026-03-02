import { mkdir, readdir, copyFile, stat, rm, writeFile, readFile } from "fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_FILE_BASE_URL } from "../utils";

const SERVICE_DIR = fileURLToPath(new URL(".", import.meta.url));
const API_ROOT_DIR = resolve(SERVICE_DIR, "../..");
const STORAGE_ROOT_DIR = resolve(API_ROOT_DIR, "storage", "resource-packs");
const SOURCE_PACKS_DIR = join(STORAGE_ROOT_DIR, "sources");
const BUILDS_WORK_DIR = join(STORAGE_ROOT_DIR, "build-work");
const PUBLIC_PACKS_DIR = resolve(API_ROOT_DIR, "public", "resource-packs");

interface MergeSourcePack {
  id: string;
  name: string;
  filePath: string;
}

interface MergeBuildOptions {
  buildId: string;
  name: string;
  packs: MergeSourcePack[];
}

interface MergeBuildResult {
  generatedFilename: string;
  filePath: string;
  publicPath: string;
  publicUrl: string;
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
      await unzipToDirectory(pack.filePath, extractDir);
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

  const sha1 = createHash("sha1").update(buffer).digest("hex");

  return {
    id,
    name: name?.trim() || file.name.replace(/\.zip$/i, ""),
    originalFilename: file.name,
    storedFilename,
    filePath,
    sha1,
    sizeBytes: buffer.byteLength,
  };
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
      await unzipToDirectory(pack.filePath, extractDir);
      const packRoot = await resolvePackRoot(extractDir);
      await copyDirectoryRecursive(packRoot, mergedRoot, conflicts);
    }

    if (!existsSync(join(mergedRoot, "pack.mcmeta"))) {
      throw new Error("Merged output is missing pack.mcmeta. Check uploaded resource packs.");
    }

    const generatedFilename = `${options.buildId}-${slugifyName(options.name)}.zip`;
    const filePath = join(PUBLIC_PACKS_DIR, generatedFilename);
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

export async function deleteStoredResourcePack(filePath: string) {
  await rm(filePath, { force: true });
}

export async function deleteMergedResourcePackFiles(generatedFilename: string) {
  const archivePath = join(PUBLIC_PACKS_DIR, generatedFilename);
  const manifestPath = join(PUBLIC_PACKS_DIR, `${generatedFilename}.json`);

  await Promise.all([
    rm(archivePath, { force: true }),
    rm(manifestPath, { force: true }),
  ]);
}

export function getPublicResourcePackPath(filename: string) {
  return join(PUBLIC_PACKS_DIR, filename);
}

export function getPublicResourcePackUrl(publicPath: string) {
  return `${PUBLIC_FILE_BASE_URL}${publicPath}`;
}
