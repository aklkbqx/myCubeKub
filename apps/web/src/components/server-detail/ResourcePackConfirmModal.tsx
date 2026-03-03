import type { ResourcePackConfirmState } from "@/components/server-detail/server-detail-types";

interface ResourcePackConfirmModalProps {
  confirmState: ResourcePackConfirmState;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ResourcePackConfirmModal({
  confirmState,
  onCancel,
  onConfirm,
}: ResourcePackConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
        <h3 className="text-lg font-semibold text-surface-100">
          {confirmState.kind === "deleteSelectedPacks"
            ? "Delete selected packs?"
            : confirmState.kind === "deleteBuild"
              ? "Delete merged build?"
              : "Delete resource pack?"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-surface-400">
          {confirmState.kind === "deleteSelectedPacks"
            ? `This will remove ${confirmState.packIds.length} selected resource pack${confirmState.packIds.length > 1 ? "s" : ""}.`
            : confirmState.kind === "deleteBuild"
              ? `This will remove "${confirmState.build.name}" and its public download link.`
              : `This will remove "${confirmState.pack.name}".`}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void onConfirm()} className="btn-danger">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
