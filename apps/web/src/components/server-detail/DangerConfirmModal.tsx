import { cn } from "@/lib/utils";
import type { DangerConfirmState } from "@/components/server-detail/server-detail-types";

interface DangerConfirmModalProps {
  dangerConfirm: Exclude<DangerConfirmState, null>;
  serverName: string;
  deleteConfirmText: string;
  recreateConfirmText: string;
  setDeleteConfirmText: (value: string) => void;
  setRecreateConfirmText: (value: string) => void;
  onCancel: () => void;
  onConfirmDelete: () => void | Promise<void>;
  onConfirmRecreate: () => void | Promise<void>;
  actionLoading: string | null;
}

export function DangerConfirmModal({
  dangerConfirm,
  serverName,
  deleteConfirmText,
  recreateConfirmText,
  setDeleteConfirmText,
  setRecreateConfirmText,
  onCancel,
  onConfirmDelete,
  onConfirmRecreate,
  actionLoading,
}: DangerConfirmModalProps) {
  const isDelete = dangerConfirm === "delete";
  const confirmValue = isDelete ? deleteConfirmText : recreateConfirmText;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
        <h3 className={cn("text-lg font-semibold", isDelete ? "text-red-300" : "text-amber-200")}>
          {isDelete ? "Delete server?" : "Recreate server?"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-surface-400">
          {isDelete
            ? "This will stop the server, remove all server files, and delete the database record."
            : "This will reset the runtime data and rebuild the server using the same name and settings."}
        </p>
        <p className="mt-4 text-sm text-surface-300">
          Type <span className={cn("font-mono", isDelete ? "text-red-400" : "text-amber-300")}>{serverName}</span> to continue:
        </p>
        <input
          type="text"
          value={confirmValue}
          onChange={(event) => {
            if (isDelete) {
              setDeleteConfirmText(event.target.value);
              return;
            }
            setRecreateConfirmText(event.target.value);
          }}
          placeholder={serverName}
          className="input-field mt-3 w-full"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onCancel();
            }
            if (event.key === "Enter") {
              if (isDelete) {
                void onConfirmDelete();
                return;
              }
              void onConfirmRecreate();
            }
          }}
        />
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (isDelete) {
                void onConfirmDelete();
                return;
              }
              void onConfirmRecreate();
            }}
            disabled={actionLoading !== null || confirmValue !== serverName}
            className={cn(
              isDelete
                ? "btn-danger"
                : "btn-secondary border-amber-500/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
              "disabled:opacity-50"
            )}
          >
            {isDelete
              ? actionLoading === "delete"
                ? "Deleting..."
                : "Confirm Delete"
              : actionLoading === "recreate"
                ? "Recreating..."
                : "Confirm Recreate"}
          </button>
        </div>
      </div>
    </div>
  );
}
