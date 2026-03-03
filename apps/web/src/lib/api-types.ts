export interface ServerInfo {
  id: string;
  name: string;
  directoryPath: string;
  port: number;
  version: string;
  type: string;
  memoryMb: number;
  statusCache: string | null;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  autoBackupRetentionCount: number;
  lastAutoBackupAt: string | null;
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
  autoBackupEnabled?: boolean;
  autoBackupIntervalHours?: number;
  autoBackupRetentionCount?: number;
}

export interface BackupInfo {
  id: string;
  serverId: string;
  filename: string;
  filePath: string;
  sizeBytes: number | null;
  createdAt: string;
  isAuto: boolean | null;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
}

export interface ResourcePackInfo {
  id: string;
  name: string;
  originalFilename: string;
  storedFilename: string;
  imageFilename: string | null;
  imagePublicPath: string | null;
  imageUrl: string | null;
  sha1: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ResourcePackBuildInfo {
  id: string;
  name: string;
  generatedFilename: string;
  publicPath: string;
  publicUrl: string;
  imageFilename: string | null;
  imagePublicPath: string | null;
  imageUrl: string | null;
  sha1: string;
  sizeBytes: number;
  conflictCount: number;
  packCount: number;
  createdAt: string;
}

export interface ResourcePackBuildDetail {
  build: ResourcePackBuildInfo;
  packs: ResourcePackInfo[];
  conflicts: string[];
}

export interface ConsoleCommandMessage {
  type: "command";
  command: string;
}

export interface ConsoleLogMessage {
  type: "log";
  data: string;
  timestamp: string;
}

export interface ConsoleErrorMessage {
  type: "error";
  data: string;
}

export interface ConsoleInfoMessage {
  type: "info";
  data: string;
}

export interface ConsoleCommandResultMessage {
  type: "command_result";
  command: string;
  data: string;
  timestamp: string;
}

export type ConsoleEvent =
  | ConsoleLogMessage
  | ConsoleErrorMessage
  | ConsoleInfoMessage
  | ConsoleCommandResultMessage;
