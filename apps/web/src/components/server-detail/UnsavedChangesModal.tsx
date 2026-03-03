interface UnsavedChangesModalProps {
  kind: "tab" | "leave";
  onStay: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesModal({
  kind,
  onStay,
  onDiscard,
}: UnsavedChangesModalProps) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
        <h3 className="text-lg font-semibold text-surface-100">Discard unsaved changes?</h3>
        <p className="mt-2 text-sm leading-6 text-surface-400">
          {kind === "tab"
            ? "You have unsaved changes. Leaving this tab now will discard them."
            : "You have unsaved changes. Leaving this page now will discard them."}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={onStay} className="btn-secondary">
            Stay Here
          </button>
          <button type="button" onClick={onDiscard} className="btn-danger">
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );
}
