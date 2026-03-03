import { mkdir, rm, stat, access } from "fs/promises";
import { constants as fsConstants } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { asc, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import * as composeService from "./compose";
import * as dockerService from "./docker";

const SERVICE_DIR = fileURLToPath(new URL(".", import.meta.url));
const API_ROOT_DIR = resolve(SERVICE_DIR, "../..");
const BACKUPS_DIR = resolve(API_ROOT_DIR, process.env.BACKUPS_DIR || "./backups");
const AUTO_BACKUP_SWEEP_MS = 60_000;
const AUTO_BACKUP_RETENTION_LIMIT = 5;

let schedulerStarted = false;
let sweepInFlight = false;

type SerializedBackup = {
  id: string;
  serverId: string;
  filename: string;
  filePath: string;
  sizeBytes: number | null;
  createdAt: string;
  isAuto: boolean | null;
};

function serializeBackup(backup: typeof schema.backups.$inferSelect): SerializedBackup {
  return {
    ...backup,
    createdAt: backup.createdAt.toISOString(),
  };
}

function getServerBackupDir(serverId: string) {
  return join(BACKUPS_DIR, serverId);
}

function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function ensureBackupDirectory(serverId: string) {
  const backupDir = getServerBackupDir(serverId);
  await mkdir(backupDir, { recursive: true });
  return backupDir;
}

async function runTar(args: string[]) {
  const proc = Bun.spawn(["tar", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(stderr.trim() || "tar command failed");
  }
}

async function assertBackupFileExists(filePath: string) {
  await access(filePath, fsConstants.F_OK);
}

async function pruneAutoBackups(serverId: string) {
  const backups = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.serverId, serverId))
    .orderBy(desc(schema.backups.createdAt));

  const autoBackups = backups.filter((backup) => backup.isAuto);
  const backupsToDelete = autoBackups.slice(AUTO_BACKUP_RETENTION_LIMIT);

  for (const backup of backupsToDelete) {
    await rm(backup.filePath, { force: true }).catch(() => undefined);
    await db.delete(schema.backups).where(eq(schema.backups.id, backup.id));
  }
}

export async function listBackups(serverId: string) {
  const backups = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.serverId, serverId))
    .orderBy(desc(schema.backups.createdAt));

  return backups.map(serializeBackup);
}

export async function createBackup(serverId: string, isAuto = false) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw new Error("Server not found");
  }

  const backupDir = await ensureBackupDirectory(serverId);
  const filename = `${formatBackupTimestamp()}-${isAuto ? "auto" : "manual"}-${server.name.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.tar.gz`;
  const filePath = join(backupDir, filename);
  const serverDir = composeService.getServerDir(serverId);

  await runTar(["-czf", filePath, "-C", serverDir, "data"]);

  const archiveStat = await stat(filePath);
  const [backup] = await db
    .insert(schema.backups)
    .values({
      serverId,
      filename,
      filePath,
      sizeBytes: archiveStat.size,
      isAuto,
    })
    .returning();

  if (isAuto) {
    await db
      .update(schema.servers)
      .set({
        lastAutoBackupAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.servers.id, serverId));

    await pruneAutoBackups(serverId);
  }

  return serializeBackup(backup);
}

export async function deleteBackup(backupId: string) {
  const [backup] = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.id, backupId))
    .limit(1);

  if (!backup) {
    throw new Error("Backup not found");
  }

  await rm(backup.filePath, { force: true }).catch(() => undefined);
  await db.delete(schema.backups).where(eq(schema.backups.id, backupId));

  return backup;
}

export async function deleteBackupsForServer(serverId: string) {
  const backups = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.serverId, serverId));

  for (const backup of backups) {
    await rm(backup.filePath, { force: true }).catch(() => undefined);
  }

  await rm(getServerBackupDir(serverId), { recursive: true, force: true }).catch(() => undefined);
  await db.delete(schema.backups).where(eq(schema.backups.serverId, serverId));

  return backups.length;
}

export async function getBackupById(backupId: string) {
  const [backup] = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.id, backupId))
    .limit(1);

  return backup ?? null;
}

export async function assertBackupReadable(filePath: string) {
  await assertBackupFileExists(filePath);
}

export async function restoreBackup(serverId: string, backupId: string) {
  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  if (!server) {
    throw new Error("Server not found");
  }

  const [backup] = await db
    .select()
    .from(schema.backups)
    .where(eq(schema.backups.id, backupId))
    .limit(1);

  if (!backup || backup.serverId !== serverId) {
    throw new Error("Backup not found");
  }

  await assertBackupFileExists(backup.filePath);

  const currentStatus = await dockerService.getContainerStatus(serverId);
  const wasRunning = currentStatus === "running";
  const serverDir = composeService.getServerDir(serverId);
  const dataDir = join(serverDir, "data");

  if (wasRunning) {
    await dockerService.stopContainer(serverId);
  }

  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });
  await runTar(["-xzf", backup.filePath, "-C", serverDir]);

  if (wasRunning) {
    await dockerService.startContainer(serverId);
  }

  await db
    .update(schema.servers)
    .set({
      statusCache: wasRunning ? "running" : "stopped",
      updatedAt: new Date(),
    })
    .where(eq(schema.servers.id, serverId));

  return {
    backup: serializeBackup(backup),
    serverStatus: wasRunning ? "running" : "stopped",
  };
}

async function runAutoBackupSweep() {
  if (sweepInFlight) return;
  sweepInFlight = true;

  try {
    const servers = await db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.autoBackupEnabled, true))
      .orderBy(asc(schema.servers.createdAt));

    const now = Date.now();
    for (const server of servers) {
      const intervalMs = Math.max(1, server.autoBackupIntervalHours) * 60 * 60 * 1000;
      const lastBackupAt = server.lastAutoBackupAt?.getTime() ?? 0;
      if (lastBackupAt !== 0 && now - lastBackupAt < intervalMs) {
        continue;
      }

      try {
        await createBackup(server.id, true);
      } catch (err) {
        console.error(`[auto-backup] Failed for server ${server.id}:`, err);
      }
    }
  } finally {
    sweepInFlight = false;
  }
}

export function startAutoBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  void runAutoBackupSweep();
  setInterval(() => {
    void runAutoBackupSweep();
  }, AUTO_BACKUP_SWEEP_MS);
}

export { BACKUPS_DIR };
