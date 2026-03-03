import { edenTreaty } from "@elysiajs/eden";
import type { App } from "@mycubekub/api-contract";
import type {
  ConsoleEvent,
  ConsoleCommandMessage,
  BackupInfo,
  CreateServerData,
  FileInfo,
  ResourcePackBuildDetail,
  ResourcePackBuildInfo,
  ResourcePackInfo,
  ServerInfo,
  ServerStats,
  ServerWithStatus,
  UpdateServerData,
} from "./api-types";

const API_BASE = "/api";
const treaty = edenTreaty<App>(API_BASE, {
  $fetch: {
    credentials: "include",
  },
});

class ApiClient {
  private normalizeOptionalPath(path?: string) {
    if (!path || path === "undefined" || path === "null") {
      return undefined;
    }

    return path;
  }

  private optionalPathQuery(path?: string) {
    const normalizedPath = this.normalizeOptionalPath(path);
    return normalizedPath ? { path: normalizedPath } : {};
  }

  private async unwrap<T>(
    request: Promise<{
      data: unknown;
      error: { status: number; value: unknown } | null;
      status: number;
    }>
  ): Promise<T> {
    const { data, error, status } = await request;

    if (error) {
      const message =
        typeof error.value === "object" &&
          error.value !== null &&
          "error" in error.value &&
          typeof error.value.error === "string"
          ? error.value.error
          : "Request failed";

      throw new ApiError(status, message);
    }

    return data as T;
  }

  private async requestJson<T>(input: string, init?: RequestInit): Promise<T> {
    const response = await fetch(input, {
      credentials: "include",
      ...init,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Request failed";

      throw new ApiError(response.status, message);
    }

    return payload as T;
  }

  private async uploadFormDataWithProgress<T>(
    input: string,
    formData: FormData,
    onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", input, true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;

        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };

      xhr.onerror = () => reject(new ApiError(0, "Upload failed"));

      xhr.onload = () => {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;

        if (xhr.status < 200 || xhr.status >= 300) {
          const message =
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Request failed";

          reject(new ApiError(xhr.status, message));
          return;
        }

        resolve(payload as T);
      };

      xhr.send(formData);
    });
  }

  // ─── Auth ────────────────────────────────────────────────
  auth = {
    login: (username: string, password: string): Promise<{ user: { id: string; username: string } }> =>
      this.unwrap<{ user: { id: string; username: string } }>(
        treaty.auth.login.post({ username, password })
      ),

    logout: (): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(treaty.auth.logout.post({})),

    me: (): Promise<{ user: { id: string; username: string; createdAt: string } }> =>
      this.unwrap<{ user: { id: string; username: string; createdAt: string } }>(
        treaty.auth.me.get({})
      ),
  };

  // ─── Servers ─────────────────────────────────────────────
  servers = {
    list: (): Promise<{ servers: ServerWithStatus[] }> =>
      this.unwrap<{ servers: ServerWithStatus[] }>(treaty.servers.get({})),

    get: (id: string): Promise<{ server: ServerWithStatus }> =>
      this.unwrap<{ server: ServerWithStatus }>(treaty.servers[id].get({})),

    create: (data: CreateServerData): Promise<{ server: ServerInfo }> =>
      this.unwrap<{ server: ServerInfo }>(treaty.servers.post(data)),

    update: (id: string, data: UpdateServerData): Promise<{ server: ServerInfo; restartRequired?: boolean }> =>
      this.unwrap<{ server: ServerInfo; restartRequired?: boolean }>(treaty.servers[id].put(data)),

    delete: (id: string): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(treaty.servers[id].delete({})),

    start: (id: string): Promise<{ success: boolean; status: string }> =>
      this.unwrap<{ success: boolean; status: string }>(treaty.servers[id].start.post({})),

    stop: (id: string): Promise<{ success: boolean; status: string }> =>
      this.unwrap<{ success: boolean; status: string }>(treaty.servers[id].stop.post({})),

    restart: (id: string): Promise<{ success: boolean; status: string }> =>
      this.unwrap<{ success: boolean; status: string }>(treaty.servers[id].restart.post({})),

    recreate: (id: string): Promise<{ success: boolean; status: string; server: ServerInfo }> =>
      this.unwrap<{ success: boolean; status: string; server: ServerInfo }>(
        treaty.servers[id].recreate.post({})
      ),

    stats: (id: string): Promise<{ stats: ServerStats | null; status: string }> =>
      this.unwrap<{ stats: ServerStats | null; status: string }>(treaty.servers[id].stats.get({})),

    getProperties: (id: string): Promise<{ properties: Record<string, string>; exists: boolean }> =>
      this.unwrap<{ properties: Record<string, string>; exists: boolean }>(treaty.servers[id].properties.get({})),

    updateProperties: (id: string, properties: Record<string, string>): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(treaty.servers[id].properties.put({ properties })),

    createProperties: (id: string): Promise<{ success: boolean; properties: Record<string, string>; exists: boolean }> =>
      this.requestJson<{ success: boolean; properties: Record<string, string>; exists: boolean }>(
        `${API_BASE}/servers/${encodeURIComponent(id)}/properties/create`,
        { method: "POST" }
      ),

    listBackups: (id: string): Promise<{ backups: BackupInfo[] }> =>
      this.requestJson<{ backups: BackupInfo[] }>(`${API_BASE}/servers/${encodeURIComponent(id)}/backups`),

    createBackup: (id: string): Promise<{ backup: BackupInfo }> =>
      this.requestJson<{ backup: BackupInfo }>(`${API_BASE}/servers/${encodeURIComponent(id)}/backups`, {
        method: "POST",
      }),

    restoreBackup: (id: string, backupId: string): Promise<{ success: boolean; backup: BackupInfo; status: string }> =>
      this.requestJson<{ success: boolean; backup: BackupInfo; status: string }>(
        `${API_BASE}/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(backupId)}/restore`,
        { method: "POST" }
      ),

    deleteBackup: (id: string, backupId: string): Promise<{ success: boolean }> =>
      this.requestJson<{ success: boolean }>(
        `${API_BASE}/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(backupId)}`,
        { method: "DELETE" }
      ),

    downloadBackupUrl: (id: string, backupId: string) =>
      `${API_BASE}/servers/${encodeURIComponent(id)}/backups/${encodeURIComponent(backupId)}/download`,
  };

  // ─── Health ──────────────────────────────────────────────
  config = (): Promise<{ connectionIp: string }> =>
    this.unwrap<{ connectionIp: string }>(treaty.config.get({}));

  health = (): Promise<{ status: string; timestamp: string }> =>
    this.unwrap<{ status: string; timestamp: string }>(treaty.health.get({}));

  // ─── Files ──────────────────────────────────────────────
  files = {
    list: (serverId: string, path?: string): Promise<{ files: FileInfo[]; path: string }> =>
      this.unwrap<{ files: FileInfo[]; path: string }>(
        treaty.servers[serverId].files.get({ $query: this.optionalPathQuery(path) })
      ),

    read: (serverId: string, path: string): Promise<{ content: string; path: string }> =>
      this.unwrap<{ content: string; path: string }>(
        treaty.servers[serverId].files.content.get({ $query: { path } })
      ),

    write: (serverId: string, path: string, content: string): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(
        treaty.servers[serverId].files.content.put({ path, content })
      ),

    mkdir: (serverId: string, path: string): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(treaty.servers[serverId].files.mkdir.post({ path })),

    delete: (serverId: string, path: string): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(
        treaty.servers[serverId].files.delete({ $query: { path } })
      ),

    rename: (serverId: string, oldPath: string, newPath: string): Promise<{ success: boolean }> =>
      this.unwrap<{ success: boolean }>(
        treaty.servers[serverId].files.rename.patch({ oldPath, newPath })
      ),

    upload: (
      serverId: string,
      file: File,
      path?: string,
      onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
    ): Promise<{ success: boolean; filename: string }> => {
      if (onProgress) {
        const formData = new FormData();
        formData.append("file", file);
        if (path) {
          formData.append("path", path);
        }

        return this.uploadFormDataWithProgress<{ success: boolean; filename: string }>(
          `${API_BASE}/servers/${encodeURIComponent(serverId)}/files/upload`,
          formData,
          onProgress
        );
      }

      return this.unwrap<{ success: boolean; filename: string }>(
        treaty.servers[serverId].files.upload.post({
          file,
          ...this.optionalPathQuery(path),
        })
      );
    },

    downloadAllUrl: (serverId: string) =>
      `/api/servers/${serverId}/files/download-all`,

    downloadUrl: (serverId: string, path: string) =>
      `/api/servers/${serverId}/files/download?path=${encodeURIComponent(path)}`,
  };

  console = {
    connect: (serverId: string) => treaty.servers[serverId].console.subscribe(),
  };

  resourcePacks = {
    list: (serverId: string): Promise<{ packs: ResourcePackInfo[] }> =>
      this.requestJson<{ packs: ResourcePackInfo[] }>(`${API_BASE}/resource-packs?serverId=${encodeURIComponent(serverId)}`),

    listBuilds: (serverId: string): Promise<{ builds: ResourcePackBuildInfo[] }> =>
      this.requestJson<{ builds: ResourcePackBuildInfo[] }>(`${API_BASE}/resource-packs/builds?serverId=${encodeURIComponent(serverId)}`),

    getBuild: (serverId: string, buildId: string): Promise<ResourcePackBuildDetail> =>
      this.requestJson<ResourcePackBuildDetail>(`${API_BASE}/resource-packs/builds/${buildId}?serverId=${encodeURIComponent(serverId)}`),

    upload: (
      serverId: string,
      file: File,
      name?: string,
      onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
    ): Promise<{ pack: ResourcePackInfo }> => {
      const formData = new FormData();
      formData.append("serverId", serverId);
      formData.append("file", file);
      if (name) {
        formData.append("name", name);
      }

      return this.uploadFormDataWithProgress<{ pack: ResourcePackInfo }>(
        `${API_BASE}/resource-packs/upload`,
        formData,
        onProgress
      );
    },

    updateBuildImage: (buildId: string, file: File): Promise<{ build: ResourcePackBuildInfo }> => {
      const formData = new FormData();
      formData.append("file", file);

      return this.uploadFormDataWithProgress<{ build: ResourcePackBuildInfo }>(
        `${API_BASE}/resource-packs/builds/${buildId}/image`,
        formData
      );
    },

    delete: (packId: string): Promise<{ success: boolean }> =>
      this.requestJson<{ success: boolean }>(`${API_BASE}/resource-packs/${packId}`, {
        method: "DELETE",
      }),

    rename: (packId: string, name: string): Promise<{ pack: ResourcePackInfo }> =>
      this.requestJson<{ pack: ResourcePackInfo }>(`${API_BASE}/resource-packs/${packId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),

    build: (
      serverId: string,
      name: string,
      packIds: string[],
      image?: File
    ): Promise<{ build: ResourcePackBuildInfo; conflicts: string[] }> => {
      const formData = new FormData();
      formData.append("serverId", serverId);
      formData.append("name", name);
      packIds.forEach((packId) => formData.append("packIds", packId));
      if (image) {
        formData.append("image", image);
      }

      return this.uploadFormDataWithProgress<{ build: ResourcePackBuildInfo; conflicts: string[] }>(
        `${API_BASE}/resource-packs/build`,
        formData
      );
    },

    preview: (serverId: string, packIds: string[]): Promise<{ packs: ResourcePackInfo[]; conflicts: string[] }> =>
      this.requestJson<{ packs: ResourcePackInfo[]; conflicts: string[] }>(`${API_BASE}/resource-packs/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, packIds }),
      }),

    assignToServer: (
      buildId: string,
      serverId: string,
      options?: { prompt?: string; required?: boolean }
    ): Promise<{
      success: boolean;
      serverId: string;
      build: ResourcePackBuildInfo;
      properties: Record<string, string>;
    }> =>
      this.requestJson<{
        success: boolean;
        serverId: string;
        build: ResourcePackBuildInfo;
        properties: Record<string, string>;
      }>(`${API_BASE}/resource-packs/builds/${buildId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId,
          ...(options?.prompt !== undefined ? { prompt: options.prompt } : {}),
          ...(options?.required !== undefined ? { required: options.required } : {}),
        }),
      }),

    deleteBuild: (serverId: string, buildId: string): Promise<{ success: boolean }> =>
      this.requestJson<{ success: boolean }>(`${API_BASE}/resource-packs/builds/${buildId}?serverId=${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      }),

    renameBuild: (serverId: string, buildId: string, name: string): Promise<{ build: ResourcePackBuildInfo }> =>
      this.requestJson<{ build: ResourcePackBuildInfo }>(`${API_BASE}/resource-packs/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, name }),
      }),
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const api = new ApiClient();
export type {
  BackupInfo,
  ConsoleEvent,
  ConsoleCommandMessage,
  CreateServerData,
  FileInfo,
  ResourcePackBuildDetail,
  ResourcePackBuildInfo,
  ResourcePackInfo,
  ServerInfo,
  ServerStats,
  ServerWithStatus,
  UpdateServerData,
} from "./api-types";
