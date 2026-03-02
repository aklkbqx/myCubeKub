const API_BASE = "/api";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {} } = options;

    const config: RequestInit = {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, config);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.error || "Request failed");
    }

    return res.json();
  }

  // ─── Auth ────────────────────────────────────────────────
  auth = {
    login: (username: string, password: string) =>
      this.request<{ user: { id: string; username: string } }>("/auth/login", {
        method: "POST",
        body: { username, password },
      }),

    logout: () =>
      this.request<{ success: boolean }>("/auth/logout", { method: "POST" }),

    me: () =>
      this.request<{ user: { id: string; username: string; createdAt: string } }>("/auth/me"),
  };

  // ─── Servers ─────────────────────────────────────────────
  servers = {
    list: () =>
      this.request<{ servers: ServerWithStatus[] }>("/servers"),

    get: (id: string) =>
      this.request<{ server: ServerWithStatus }>(`/servers/${id}`),

    create: (data: CreateServerData) =>
      this.request<{ server: ServerInfo }>("/servers", {
        method: "POST",
        body: data,
      }),

    update: (id: string, data: UpdateServerData) =>
      this.request<{ server: ServerInfo; restartRequired?: boolean }>(`/servers/${id}`, {
        method: "PUT",
        body: data,
      }),

    delete: (id: string) =>
      this.request<{ success: boolean }>(`/servers/${id}`, {
        method: "DELETE",
      }),

    start: (id: string) =>
      this.request<{ success: boolean; status: string }>(`/servers/${id}/start`, {
        method: "POST",
      }),

    stop: (id: string) =>
      this.request<{ success: boolean; status: string }>(`/servers/${id}/stop`, {
        method: "POST",
      }),

    restart: (id: string) =>
      this.request<{ success: boolean; status: string }>(`/servers/${id}/restart`, {
        method: "POST",
      }),

    stats: (id: string) =>
      this.request<{ stats: ServerStats | null; status: string }>(`/servers/${id}/stats`),

    getProperties: (id: string) =>
      this.request<{ properties: Record<string, string> }>(`/servers/${id}/properties`),

    updateProperties: (id: string, properties: Record<string, string>) =>
      this.request<{ success: boolean }>(`/servers/${id}/properties`, {
        method: "PUT",
        body: { properties },
      }),
  };

  // ─── Health ──────────────────────────────────────────────
  config = () =>
    this.request<{ connectionIp: string }>("/config");

  health = () =>
    this.request<{ status: string; timestamp: string }>("/health");

  // ─── Files ──────────────────────────────────────────────
  files = {
    list: (serverId: string, path?: string) =>
      this.request<{ files: FileInfo[]; path: string }>(
        `/servers/${serverId}/files${path ? `?path=${encodeURIComponent(path)}` : ""}`
      ),

    read: (serverId: string, path: string) =>
      this.request<{ content: string; path: string }>(
        `/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`
      ),

    write: (serverId: string, path: string, content: string) =>
      this.request<{ success: boolean }>(`/servers/${serverId}/files/content`, {
        method: "PUT",
        body: { path, content },
      }),

    mkdir: (serverId: string, path: string) =>
      this.request<{ success: boolean }>(`/servers/${serverId}/files/mkdir`, {
        method: "POST",
        body: { path },
      }),

    delete: (serverId: string, path: string) =>
      this.request<{ success: boolean }>(
        `/servers/${serverId}/files?path=${encodeURIComponent(path)}`,
        { method: "DELETE" }
      ),

    rename: (serverId: string, oldPath: string, newPath: string) =>
      this.request<{ success: boolean }>(`/servers/${serverId}/files/rename`, {
        method: "PATCH",
        body: { oldPath, newPath },
      }),

    downloadUrl: (serverId: string, path: string) =>
      `/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`,
  };
}

// ─── Types ─────────────────────────────────────────────────
export interface ServerInfo {
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
}

export interface ServerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
}

export interface ServerWithStatus extends ServerInfo {
  status: "running" | "stopped" | "error" | "not_found";
  stats: ServerStats | null;
}

export interface CreateServerData {
  name: string;
  port: number;
  version?: string;
  type?: string;
  memoryMb?: number;
}

export interface UpdateServerData {
  name?: string;
  port?: number;
  version?: string;
  type?: string;
  memoryMb?: number;
  jvmArgs?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const api = new ApiClient(API_BASE);
