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
const CHUNK_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const CHUNK_UPLOAD_THRESHOLD_BYTES = 90 * 1024 * 1024;
const treaty = edenTreaty<App>(API_BASE, {
  $fetch: {
    credentials: "include",
  },
});

class ApiClient {
  private extractErrorMessage(payload: unknown, fallback = "Request failed") {
    if (payload && typeof payload === "object") {
      if ("error" in payload && typeof (payload as { error?: unknown }).error === "string") {
        return (payload as { error: string }).error;
      }
      if ("message" in payload && typeof (payload as { message?: unknown }).message === "string") {
        return (payload as { message: string }).message;
      }
    }
    return fallback;
  }

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
      const message = this.extractErrorMessage(error.value);

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
      const message = this.extractErrorMessage(payload);

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

      xhr.onerror = () => {
        reject(new ApiError(xhr.status || 0, "Network error during upload"));
      };
      xhr.onabort = () => reject(new ApiError(499, "Upload canceled"));

      xhr.onload = () => {
        let payload: unknown = null;
        try {
          payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          payload = null;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          const message = this.extractErrorMessage(
            payload,
            xhr.statusText?.trim() || `Upload failed (${xhr.status})`
          );

          reject(new ApiError(xhr.status, message));
          return;
        }

        if (payload === null && !xhr.responseText) {
          reject(new ApiError(xhr.status, "Upload succeeded but response body was empty"));
          return;
        }

        resolve(payload as T);
      };

      try {
        xhr.send(formData);
      } catch (err: any) {
        reject(new ApiError(0, err?.message || "Failed to start upload request"));
      }
    });
  }

  private uploadFileWithProgress<T>(
    input: string,
    file: Blob,
    headers?: Record<string, string>,
    onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
  ): { promise: Promise<T>; cancel: () => void } {
    let xhr: XMLHttpRequest | null = null;
    const promise = new Promise<T>((resolve, reject) => {
      const request = new XMLHttpRequest();
      xhr = request;
      request.open("PUT", input, true);
      request.withCredentials = true;

      Object.entries(headers || {}).forEach(([key, value]) => {
        request.setRequestHeader(key, value);
      });

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;

        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      };

      request.onerror = () => reject(new ApiError(request.status || 0, "Network error during upload"));
      request.onabort = () => reject(new ApiError(499, "Upload canceled"));

      request.onload = () => {
        let payload: unknown = null;
        try {
          payload = request.responseText ? JSON.parse(request.responseText) : null;
        } catch {
          payload = null;
        }

        if (request.status < 200 || request.status >= 300) {
          const message = this.extractErrorMessage(
            payload,
            request.statusText?.trim() || `Upload failed (${request.status})`
          );

          reject(new ApiError(request.status, message));
          return;
        }

        if (payload === null && !request.responseText) {
          reject(new ApiError(request.status, "Upload succeeded but response body was empty"));
          return;
        }

        resolve(payload as T);
      };

      try {
        request.send(file);
      } catch (err: any) {
        reject(new ApiError(0, err?.message || "Failed to start upload request"));
      }
    });

    return {
      promise,
      cancel: () => {
        if (!xhr) return;
        try {
          xhr.abort();
        } catch {
          // Ignore abort errors on completed requests.
        }
      },
    };
  }

  private createUploadId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

    uploadCancelable: (
      serverId: string,
      file: File,
      path?: string,
      onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
    ): { promise: Promise<{ success: boolean; filename: string }>; cancel: () => void } => {
      const searchParams = new URLSearchParams();
      const normalizedPath = this.normalizeOptionalPath(path);
      if (normalizedPath) {
        searchParams.set("path", normalizedPath);
      }

      const uploadUrl = `${API_BASE}/servers/${encodeURIComponent(serverId)}/files/upload-stream${searchParams.size ? `?${searchParams.toString()}` : ""}`;
      const baseHeaders = {
        "X-File-Name": encodeURIComponent(file.name),
      };
      const uploadId = file.size > CHUNK_UPLOAD_THRESHOLD_BYTES ? this.createUploadId() : "";

      let activeCancel: (() => void) | null = null;
      let canceled = false;
      let cleanupTriggered = false;

      const cleanupChunkSession = async () => {
        if (!uploadId || cleanupTriggered) return;
        cleanupTriggered = true;

        const cleanupParams = new URLSearchParams();
        cleanupParams.set("uploadId", uploadId);
        cleanupParams.set("fileName", encodeURIComponent(file.name));
        if (normalizedPath) {
          cleanupParams.set("path", normalizedPath);
        }

        try {
          await this.requestJson<{ success: boolean }>(
            `${API_BASE}/servers/${encodeURIComponent(serverId)}/files/upload-stream?${cleanupParams.toString()}`,
            { method: "DELETE" }
          );
        } catch {
          // Ignore cleanup errors after cancellation.
        }
      };

      const promise = (async () => {
        if (!uploadId) {
          const request = this.uploadFileWithProgress<{ success: boolean; filename: string }>(
            uploadUrl,
            file,
            {
              ...baseHeaders,
              "Content-Type": file.type || "application/octet-stream",
            },
            onProgress
          );

          activeCancel = request.cancel;
          try {
            return await request.promise;
          } catch (err) {
            if (canceled) {
              throw new ApiError(499, "Upload canceled");
            }
            throw err;
          } finally {
            activeCancel = null;
          }
        }

        const totalSize = file.size;
        const totalChunks = Math.ceil(totalSize / CHUNK_UPLOAD_SIZE_BYTES);
        let uploadedBytes = 0;
        let lastResponse: { success: boolean; filename: string } | null = null;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
          if (canceled) {
            await cleanupChunkSession();
            throw new ApiError(499, "Upload canceled");
          }

          const start = chunkIndex * CHUNK_UPLOAD_SIZE_BYTES;
          const end = Math.min(start + CHUNK_UPLOAD_SIZE_BYTES, totalSize);
          const chunk = file.slice(start, end);
          const request = this.uploadFileWithProgress<{ success: boolean; filename: string }>(
            uploadUrl,
            chunk,
            {
              ...baseHeaders,
              "Content-Type": "application/octet-stream",
              "X-Upload-Id": uploadId,
              "X-Chunk-Index": String(chunkIndex),
              "X-Chunk-Total": String(totalChunks),
            },
            onProgress
              ? (progress) => {
                const loaded = Math.min(uploadedBytes + progress.loaded, totalSize);
                onProgress({
                  loaded,
                  total: totalSize,
                  percent: Math.round((loaded / totalSize) * 100),
                });
              }
              : undefined
          );

          activeCancel = request.cancel;
          try {
            lastResponse = await request.promise;
          } catch (err) {
            if (canceled) {
              await cleanupChunkSession();
              throw new ApiError(499, "Upload canceled");
            }
            throw err;
          } finally {
            activeCancel = null;
          }

          uploadedBytes = end;
          if (onProgress) {
            onProgress({
              loaded: uploadedBytes,
              total: totalSize,
              percent: Math.round((uploadedBytes / totalSize) * 100),
            });
          }
        }

        if (!lastResponse) {
          throw new ApiError(0, "Upload failed");
        }
        return lastResponse;
      })();

      return {
        promise,
        cancel: () => {
          canceled = true;
          activeCancel?.();
          void cleanupChunkSession();
        },
      };
    },

    upload: (
      serverId: string,
      file: File,
      path?: string,
      onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
    ): Promise<{ success: boolean; filename: string }> => {
      return this.files.uploadCancelable(serverId, file, path, onProgress).promise;
    },

    uploadArchive: (
      serverId: string,
      archive: Blob,
      path?: string,
      onProgress?: (progress: { loaded: number; total: number; percent: number }) => void
    ): Promise<{ success: boolean; extractedFiles: number }> => {
      const formData = new FormData();
      formData.append(
        "file",
        archive instanceof File ? archive : new File([archive], `folder-${Date.now()}.zip`, { type: "application/zip" })
      );

      const normalizedPath = this.normalizeOptionalPath(path);
      if (normalizedPath) {
        formData.append("path", normalizedPath);
      }

      return this.uploadFormDataWithProgress<{ success: boolean; extractedFiles: number }>(
        `${API_BASE}/servers/${encodeURIComponent(serverId)}/files/upload-archive`,
        formData,
        onProgress
      );
    },

    downloadAllUrl: (serverId: string) =>
      `/api/servers/${serverId}/files/download-all`,

    downloadSelectedUrl: (serverId: string) =>
      `/api/servers/${serverId}/files/download-selected`,

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
      description?: string,
      image?: File
    ): Promise<{ build: ResourcePackBuildInfo; conflicts: string[] }> => {
      const formData = new FormData();
      formData.append("serverId", serverId);
      formData.append("name", name);
      if (description?.trim()) {
        formData.append("description", description.trim());
      }
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

    deleteBuild: (serverId: string, buildId: string): Promise<{ success: boolean; removedFromServer: boolean }> =>
      this.requestJson<{ success: boolean; removedFromServer: boolean }>(`${API_BASE}/resource-packs/builds/${buildId}?serverId=${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      }),

    renameBuild: (serverId: string, buildId: string, name: string, description?: string): Promise<{ build: ResourcePackBuildInfo }> =>
      this.requestJson<{ build: ResourcePackBuildInfo }>(`${API_BASE}/resource-packs/builds/${buildId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, name, description }),
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
