import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

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
  const proc = Bun.spawn(["docker", "compose", "up", "-d"], {
    cwd: serverDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`docker compose up failed: ${stderr}`);
  }
}

/**
 * Run docker compose down in a server directory (removes container)
 */
export async function composeDown(serverDir: string): Promise<void> {
  const proc = Bun.spawn(["docker", "compose", "down", "-v"], {
    cwd: serverDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`docker compose down failed: ${stderr}`);
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
