import type { ResourcePackBuildInfo, ResourcePackInfo } from "@/lib/api";
import type { BackupInfo } from "@/lib/api";

export type PendingResourcePack = {
  id: string;
  name: string;
  originalFilename: string;
  sizeBytes: number;
  file: File;
  imagePreviewUrl: string | null;
  kind: "pending";
};

export type AvailableResourcePack = (ResourcePackInfo & { kind: "stored" }) | PendingResourcePack;

export type ResourcePackConfirmState =
  | { kind: "deleteSelectedPacks"; packIds: string[] }
  | { kind: "deletePack"; pack: AvailableResourcePack }
  | { kind: "deleteBuild"; build: ResourcePackBuildInfo };

export type DangerConfirmState = "delete" | "recreate" | null;

export type BackupConfirmState =
  | { kind: "restore"; backup: BackupInfo }
  | { kind: "delete"; backup: BackupInfo }
  | null;

export type ServerDetailTab = "settings" | "properties" | "resourcePacks" | "files" | "console";

export type UnsavedChangesState =
  | { kind: "tab"; nextTab: ServerDetailTab }
  | { kind: "leave" }
  | null;
