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
  const isAssignedBuild = confirmState.kind === "deleteBuild" && confirmState.build.assignedToServer;
  const confirmLabel = isAssignedBuild ? "Delete And Unassign" : "Confirm";

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
              ? confirmState.build.assignedToServer
                ? `This will remove "${confirmState.build.name}", its public download link, and unassign it from this server by clearing the current resource-pack settings.`
                : `This will remove "${confirmState.build.name}" and its public download link.`
              : `This will remove "${confirmState.pack.name}".`}
        </p>
        {isAssignedBuild && (
          <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            This build is currently assigned to this server. If you continue, the current resource-pack assignment will also be removed from `server.properties`.
          </div>
        )}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={() => void onConfirm()} className="btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
