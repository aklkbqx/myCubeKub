import Docker from "dockerode";
import { existsSync } from "fs";
import { homedir } from "os";

const DOCKER_BINARY_CANDIDATES = [
  process.env.DOCKER_BIN,
  "/usr/local/bin/docker",
  "/opt/homebrew/bin/docker",
  "/Applications/Docker.app/Contents/Resources/bin/docker",
  "docker",
].filter((value): value is string => Boolean(value));

const DOCKER_SOCKET_CANDIDATES = [
  process.env.DOCKER_SOCKET_PATH,
  process.env.DOCKER_HOST?.startsWith("unix://")
    ? process.env.DOCKER_HOST.slice("unix://".length)
    : undefined,
  "/var/run/docker.sock",
  `${homedir()}/.docker/run/docker.sock`,
].filter((value): value is string => Boolean(value));

function resolveDockerBinary(): string {
  for (const candidate of DOCKER_BINARY_CANDIDATES) {
    if (candidate === "docker" || existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Docker CLI not found. Set DOCKER_BIN in apps/api/.env, or make "docker" available in PATH.'
  );
}

function resolveDockerSocketPath(): string {
  for (const candidate of DOCKER_SOCKET_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DOCKER_SOCKET_CANDIDATES[0] || "/var/run/docker.sock";
}

const docker = new Docker({ socketPath: resolveDockerSocketPath() });
const dockerBinary = resolveDockerBinary();

function getSpawnEnv() {
  return {
    ...process.env,
    PATH: [
      process.env.PATH,
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/Applications/Docker.app/Contents/Resources/bin",
    ]
      .filter(Boolean)
      .join(":"),
  };
}

function getDockerCommandError(action: string, stderr: string): Error {
  const detail = stderr.trim();

  if (detail.includes("Executable not found in $PATH")) {
    return new Error(
      `Docker CLI not found for ${action}. Set DOCKER_BIN in apps/api/.env or add docker to PATH.`
    );
  }

  return new Error(`docker ${action} failed: ${detail}`);
}

/**
 * Get container name for a server (convention: mcserver-{serverId})
 */
export function getContainerName(serverId: string): string {
  return `mcserver-${serverId}`;
}

/**
 * Get a Docker container by server ID
 */
export function getContainer(serverId: string) {
  return docker.getContainer(getContainerName(serverId));
}

/**
 * Get container status
 */
export async function getContainerStatus(
  serverId: string
): Promise<"running" | "stopped" | "error" | "not_found"> {
  try {
    const container = getContainer(serverId);
    const info = await container.inspect();
    if (info.State.Running) return "running";
    return "stopped";
  } catch (err: any) {
    if (err.statusCode === 404) return "not_found";
    return "error";
  }
}

/**
 * Get container stats (CPU, memory)
 */
export async function getContainerStats(serverId: string) {
  try {
    const container = getContainer(serverId);
    const stats = await container.stats({ stream: false });

    // Calculate CPU %
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage -
      stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPercent =
      systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

    // Memory
    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 0;
    const memoryPercent =
      memoryLimit > 0 ? (memoryUsage / memoryLimit) * 100 : 0;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage,
      memoryLimit,
      memoryPercent: Math.round(memoryPercent * 100) / 100,
    };
  } catch {
    return null;
  }
}

/**
 * Start a container
 */
export async function startContainer(serverId: string): Promise<void> {
  const container = getContainer(serverId);
  await container.start();
}

/**
 * Stop a container
 */
export async function stopContainer(serverId: string): Promise<void> {
  const container = getContainer(serverId);
  await container.stop();
}

/**
 * Restart a container
 */
export async function restartContainer(serverId: string): Promise<void> {
  const container = getContainer(serverId);
  await container.restart();
}

/**
 * List all running minecraft server containers
 */
export async function listMcContainers() {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: ["mcserver-"] },
  });
  return containers;
}

/**
 * Run docker compose up -d in a server directory
 */
export async function composeUp(serverDir: string): Promise<void> {
  const proc = Bun.spawn([dockerBinary, "compose", "up", "-d"], {
    cwd: serverDir,
    stdout: "pipe",
    stderr: "pipe",
    env: getSpawnEnv(),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw getDockerCommandError("compose up", stderr);
  }
}

/**
 * Run docker compose down in a server directory (removes container)
 */
export async function composeDown(serverDir: string): Promise<void> {
  const proc = Bun.spawn([dockerBinary, "compose", "down", "-v"], {
    cwd: serverDir,
    stdout: "pipe",
    stderr: "pipe",
    env: getSpawnEnv(),
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw getDockerCommandError("compose down", stderr);
  }
}

/**
 * Force remove a container if it exists
 */
export async function removeContainer(serverId: string): Promise<void> {
  try {
    const container = getContainer(serverId);
    try { await container.stop(); } catch { /* already stopped */ }
    await container.remove({ force: true });
  } catch {
    // Container doesn't exist, that's fine
  }
}

export { docker };
