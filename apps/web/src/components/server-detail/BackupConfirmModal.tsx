import type { BackupConfirmState } from "@/components/server-detail/server-detail-types";

interface BackupConfirmModalProps {
  confirmState: Exclude<BackupConfirmState, null>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function BackupConfirmModal({
  confirmState,
  onCancel,
  onConfirm,
}: BackupConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
        <h3 className="text-lg font-semibold text-surface-100">
          {confirmState.kind === "restore" ? "Restore this backup?" : "Delete this backup?"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-surface-400">
          {confirmState.kind === "restore"
            ? `This will replace the current server data with "${confirmState.backup.filename}". If the server is running, it will be stopped and started again.`
            : `This will permanently remove "${confirmState.backup.filename}" from storage.`}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className={confirmState.kind === "restore" ? "btn-primary" : "btn-danger"}
          >
            {confirmState.kind === "restore" ? "Restore Backup" : "Delete Backup"}
          </button>
        </div>
      </div>
    </div>
  );
}
