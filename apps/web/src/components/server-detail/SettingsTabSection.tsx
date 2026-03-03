import { RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import SelectDropdown from "@/components/SelectDropdown";
import { ServerBackupsSection } from "@/components/server-detail/ServerBackupsSection";
import type { BackupInfo } from "@/lib/api";

interface SettingsTabSectionProps {
  settingsError: string;
  restartNotice: string;
  hasUnsavedSettings: boolean;
  settings: {
    name?: string;
    type?: string;
    version?: string;
    port?: number;
    memoryMb?: number;
    autoBackupEnabled?: boolean;
    autoBackupIntervalHours?: number;
    autoBackupRetentionCount?: number;
  };
  lastAutoBackupAt: string | null;
  updateSettingsField: <K extends keyof SettingsTabSectionProps["settings"]>(key: K, value: NonNullable<SettingsTabSectionProps["settings"][K]>) => void;
  serverTypeOptions: Array<{ value: string; label: string }>;
  serverVersionOptions: Array<{ value: string; label: string }>;
  isDuplicatePort: boolean;
  memoryMinMb: number;
  memoryMaxMb: number;
  memoryStepMb: number;
  formatMemoryGb: (value: number) => string;
  actionLoading: string | null;
  canUndoSettingsChange: boolean;
  onUndoSettingsChange: () => void;
  onSaveSettings: () => void;
  hasPendingServerIcon: boolean;
  settingsSaved: boolean;
  backupsLoaded: boolean;
  backups: BackupInfo[];
  backupNotice: string;
  getBackupDownloadUrl: (backupId: string) => string;
  onCreateBackup: () => void;
  onRequestRestoreBackup: (backup: BackupInfo) => void;
  onRequestDeleteBackup: (backup: BackupInfo) => void;
  onOpenDangerConfirm: (kind: "delete" | "recreate") => void;
}

export function SettingsTabSection({
  settingsError,
  restartNotice,
  hasUnsavedSettings,
  settings,
  lastAutoBackupAt,
  updateSettingsField,
  serverTypeOptions,
  serverVersionOptions,
  isDuplicatePort,
  memoryMinMb,
  memoryMaxMb,
  memoryStepMb,
  formatMemoryGb,
  actionLoading,
  canUndoSettingsChange,
  onUndoSettingsChange,
  onSaveSettings,
  hasPendingServerIcon,
  settingsSaved,
  backupsLoaded,
  backups,
  backupNotice,
  getBackupDownloadUrl,
  onCreateBackup,
  onRequestRestoreBackup,
  onRequestDeleteBackup,
  onOpenDangerConfirm,
}: SettingsTabSectionProps) {
  return (
    <>
      <div className="card">
        <h3 className="mb-4 text-lg font-semibold text-surface-100">Server Settings</h3>
        <div className="space-y-4">
          {settingsError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {settingsError}
            </div>
          )}
          {restartNotice && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {restartNotice}
            </div>
          )}
          {hasUnsavedSettings && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              You have unsaved changes in server settings.
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-300">Name</label>
            <input
              type="text"
              value={settings.name || ""}
              onChange={(event) => updateSettingsField("name", event.target.value)}
              className="input-field w-full"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-300">Type</label>
              <SelectDropdown
                options={serverTypeOptions}
                value={settings.type || "vanilla"}
                onChange={(value) => updateSettingsField("type", value)}
                placeholder="Select server type"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-300">Version</label>
              <SelectDropdown
                options={serverVersionOptions}
                value={settings.version || "latest"}
                onChange={(value) => updateSettingsField("version", value)}
                placeholder="Select version"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-300">Port</label>
              <input
                type="number"
                value={settings.port || 25565}
                onChange={(event) => updateSettingsField("port", Number(event.target.value))}
                min={1024}
                max={65535}
                className="input-field w-full"
              />
              {isDuplicatePort && (
                <p className="mt-1.5 text-sm text-red-400">
                  Port {settings.port} is already in use. Duplicate ports are not allowed.
                </p>
              )}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-medium text-surface-300">Memory</label>
                <span className="text-sm font-semibold text-brand-300">
                  {formatMemoryGb(settings.memoryMb || memoryMinMb)}
                </span>
              </div>
              <input
                type="range"
                value={settings.memoryMb || memoryMinMb}
                onChange={(event) => updateSettingsField("memoryMb", Number(event.target.value))}
                min={memoryMinMb}
                max={memoryMaxMb}
                step={memoryStepMb}
                className="memory-slider w-full"
              />
              <div className="mt-1 flex justify-between text-xs text-surface-500">
                <span>{formatMemoryGb(memoryMinMb)}</span>
                <span>{formatMemoryGb(memoryMaxMb)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onUndoSettingsChange}
                disabled={actionLoading !== null || !canUndoSettingsChange}
                className="btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Undo
              </button>
              <button
                onClick={onSaveSettings}
                disabled={actionLoading !== null || isDuplicatePort || (!hasUnsavedSettings && !hasPendingServerIcon)}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={14} />
                {settingsSaved ? "Saved ✓" : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <ServerBackupsSection
          backupsLoaded={backupsLoaded}
          backups={backups}
          backupNotice={backupNotice}
          getBackupDownloadUrl={getBackupDownloadUrl}
          actionLoading={actionLoading}
          autoBackupEnabled={settings.autoBackupEnabled ?? false}
          autoBackupIntervalHours={settings.autoBackupIntervalHours ?? 24}
          lastAutoBackupAt={lastAutoBackupAt}
          onAutoBackupEnabledChange={(value) => updateSettingsField("autoBackupEnabled", value)}
          onAutoBackupIntervalHoursChange={(value) => updateSettingsField("autoBackupIntervalHours", value)}
          onCreateBackup={onCreateBackup}
          onRequestRestore={onRequestRestoreBackup}
          onRequestDelete={onRequestDeleteBackup}
        />
      </div>

      <div className="card mt-6 border-red-500/20">
        <h3 className="mb-2 text-lg font-semibold text-red-400">Danger Zone</h3>
        <p className="mb-4 text-sm text-surface-400">
          Recreate will destroy the current container and server files, then build a fresh server using the same name and settings.
          Delete removes the record entirely.
        </p>
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4">
          <p className="mb-3 text-sm text-amber-100">
            Recreate keeps this server entry and configuration, but resets the runtime data to a fresh server.
          </p>

          <button
            onClick={() => onOpenDangerConfirm("recreate")}
            className="btn-secondary flex items-center gap-2 border-amber-500/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
          >
            <RefreshCw size={14} /> Recreate Server
          </button>
        </div>

        <p className="mb-4 text-sm text-surface-400">
          Deleting a server will stop the Minecraft server, remove all files, and delete the database record.
          This action cannot be undone.
        </p>

        <button
          onClick={() => onOpenDangerConfirm("delete")}
          className="btn-danger flex items-center gap-2"
        >
          <Trash2 size={14} /> Delete Server
        </button>
      </div>
    </>
  );
}
