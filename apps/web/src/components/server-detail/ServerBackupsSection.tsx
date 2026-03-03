import { Archive, Download, HardDriveDownload, LoaderCircle, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import type { BackupInfo } from "@/lib/api";

function formatBackupSize(sizeBytes: number | null) {
  if (!sizeBytes || sizeBytes <= 0) {
    return "Unknown size";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatBackupDate(value: string) {
  return new Date(value).toLocaleString();
}

interface ServerBackupsSectionProps {
  backupsLoaded: boolean;
  backups: BackupInfo[];
  backupNotice: string;
  getBackupDownloadUrl: (backupId: string) => string;
  actionLoading: string | null;
  autoBackupEnabled: boolean;
  autoBackupIntervalHours: number;
  lastAutoBackupAt: string | null;
  onAutoBackupEnabledChange: (value: boolean) => void;
  onAutoBackupIntervalHoursChange: (value: number) => void;
  onCreateBackup: () => void;
  onRequestRestore: (backup: BackupInfo) => void;
  onRequestDelete: (backup: BackupInfo) => void;
}

export function ServerBackupsSection({
  backupsLoaded,
  backups,
  backupNotice,
  getBackupDownloadUrl,
  actionLoading,
  autoBackupEnabled,
  autoBackupIntervalHours,
  lastAutoBackupAt,
  onAutoBackupEnabledChange,
  onAutoBackupIntervalHoursChange,
  onCreateBackup,
  onRequestRestore,
  onRequestDelete,
}: ServerBackupsSectionProps) {
  const handleIntervalChange = (rawValue: string) => {
    const parsedValue = Number(rawValue);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onAutoBackupIntervalHoursChange(Math.min(168, Math.max(1, parsedValue)));
  };

  return (
    <div className="card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-surface-100">Backups</h3>
          <p className="mt-1 text-sm text-surface-400">
            Create manual snapshots, configure automatic backups, and restore server data when needed.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateBackup}
          disabled={actionLoading !== null}
          className="btn-secondary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <HardDriveDownload size={14} />
          Create Manual Backup
        </button>
      </div>

      {backupNotice && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {backupNotice}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <div className="rounded-2xl border border-surface-700/70 bg-surface-900/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-surface-400">
                Auto Backup
              </h4>
              <p className="mt-2 text-sm leading-6 text-surface-400">
                Scheduler runs on the backend with a fixed retention limit of 5 automatic backups. When a new one is created, the oldest auto backup is removed.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-3">
              <span className={`text-sm font-medium ${autoBackupEnabled ? "text-emerald-300" : "text-surface-400"}`}>
                {autoBackupEnabled ? "Enabled" : "Disabled"}
              </span>
              <span className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  checked={autoBackupEnabled}
                  onChange={(event) => onAutoBackupEnabledChange(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-surface-700 transition peer-checked:bg-emerald-500/70" />
                <span className="absolute left-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </span>
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-300">Interval (hours)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={autoBackupIntervalHours}
                onChange={(event) => handleIntervalChange(event.target.value)}
                className="input-field w-full"
              />
              <p className="mt-1.5 text-xs text-surface-500">Runs every 1 to 168 hours.</p>
            </div>
            <div className="rounded-xl border border-surface-700/60 bg-surface-950/60 px-4 py-3">
              <p className="text-sm font-medium text-surface-200">Auto backup retention</p>
              <p className="mt-2 text-2xl font-semibold text-brand-300">5 files</p>
              <p className="mt-1.5 text-xs text-surface-500">Oldest auto backup is deleted when a new one is created.</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-surface-700/60 bg-surface-950/60 px-4 py-3 text-sm text-surface-300">
            <div className="flex items-center gap-2 text-surface-200">
              <Archive size={14} />
              <span>Last automatic backup</span>
            </div>
            <p className="mt-2 text-sm text-surface-400">
              {lastAutoBackupAt ? formatBackupDate(lastAutoBackupAt) : "No automatic backup has been created yet."}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-700/70 bg-surface-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-surface-400">
                Available Backups
              </h4>
              <p className="mt-2 text-sm text-surface-400">
                Manual and automatic archives are stored here.
              </p>
            </div>
            <span className="rounded-full border border-surface-700/70 bg-surface-800/80 px-3 py-1 text-xs font-semibold text-surface-300">
              {backups.length} total
            </span>
          </div>

          {!backupsLoaded ? (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-surface-700/60 bg-surface-950/60 px-4 py-4 text-sm text-surface-300">
              <LoaderCircle size={16} className="animate-spin" />
              Loading backup history...
            </div>
          ) : backups.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-surface-700/70 bg-surface-950/40 px-4 py-6 text-sm text-surface-400">
              No backups yet. Create a manual backup or enable automatic backups to start collecting restore points.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="rounded-xl border border-surface-700/70 bg-surface-950/55 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-surface-100">
                          {backup.filename}
                        </p>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                          backup.isAuto
                            ? "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
                            : "border border-amber-500/30 bg-amber-500/10 text-amber-100"
                        }`}>
                          {backup.isAuto ? "Auto" : "Manual"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-surface-400">
                        Created {formatBackupDate(backup.createdAt)}
                      </p>
                      <p className="mt-1 text-xs text-surface-500">
                        {formatBackupSize(backup.sizeBytes)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={getBackupDownloadUrl(backup.id)}
                        className="btn-secondary flex items-center gap-2"
                      >
                        <Download size={14} />
                        Download
                      </a>
                      <button
                        type="button"
                        onClick={() => onRequestRestore(backup)}
                        disabled={actionLoading !== null}
                        className="btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw size={14} />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDelete(backup)}
                        disabled={actionLoading !== null}
                        className="btn-danger flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {backups.length > 0 && (
            <p className="mt-4 flex items-center gap-2 text-xs text-surface-500">
              <RotateCcw size={12} />
              Restoring a backup replaces the current server data with the selected archive.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
