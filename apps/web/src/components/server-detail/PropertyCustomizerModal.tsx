import type { MutableRefObject, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomizablePropertyKey } from "@/components/server-detail/properties-config";

type MinecraftStyleToken = {
  code: string;
  name: string;
};

type MinecraftColorToken = {
  code: string;
  name: string;
  hex: string;
};

type MinecraftSymbolToken = {
  label: string;
  value: string;
};

type PreviewBackgroundPreset = {
  id: string;
  label: string;
  className: string;
};

interface PropertyCustomizerModalProps {
  activePropertyCustomizer: CustomizablePropertyKey;
  draftValue: string;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onInsertToken: (token: string) => void;
  onClearAll: () => void;
  propertyTextareaRefs: MutableRefObject<Record<CustomizablePropertyKey, HTMLTextAreaElement | null>>;
  styleTokens: readonly MinecraftStyleToken[];
  colorTokens: readonly MinecraftColorToken[];
  symbolTokens: readonly MinecraftSymbolToken[];
  previewBackgroundPresets: readonly PreviewBackgroundPreset[];
  propertyPreviewBackground: string;
  onPreviewBackgroundChange: (backgroundId: string) => void;
  previewContent: ReactNode;
}

export function PropertyCustomizerModal({
  activePropertyCustomizer,
  draftValue,
  onClose,
  onDraftChange,
  onInsertToken,
  onClearAll,
  propertyTextareaRefs,
  styleTokens,
  colorTokens,
  symbolTokens,
  previewBackgroundPresets,
  propertyPreviewBackground,
  onPreviewBackgroundChange,
  previewContent,
}: PropertyCustomizerModalProps) {
  return (
    <div className="fixed inset-0 z-[72] overflow-y-auto bg-surface-950/80 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
      <div className="mx-auto flex min-h-full w-full max-w-4xl items-start sm:items-center">
        <div className="w-full overflow-hidden rounded-3xl border border-surface-700/70 bg-surface-900 shadow-2xl shadow-black/40">
          <div className="flex items-start justify-between gap-4 border-b border-surface-800 px-4 py-4 sm:px-6">
            <div>
              <h3 className="text-base font-semibold text-surface-100 sm:text-lg">
                {activePropertyCustomizer === "motd" ? "Customize Server MOTD" : "Customize Resource Pack Prompt"}
              </h3>
              <p className="mt-1 max-w-2xl text-xs text-surface-400 sm:text-sm">
                Pick Minecraft colors, styles, symbols, and preview the formatted text before saving.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-icon h-10 w-10 flex-shrink-0 border border-surface-700/70 bg-surface-950/70 text-surface-300 hover:text-surface-50"
              aria-label="Close customizer"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(100vh-10rem)] sm:px-6 sm:py-6">
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:gap-6">
              <div className="space-y-4">
                <textarea
                  ref={(node) => {
                    propertyTextareaRefs.current[activePropertyCustomizer] = node;
                  }}
                  value={draftValue}
                  rows={activePropertyCustomizer === "motd" ? 4 : 6}
                  onChange={(event) => onDraftChange(event.target.value)}
                  className="input-field min-h-[140px] w-full resize-y font-mono text-sm sm:min-h-[150px]"
                />

                <div className="rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Quick Actions</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {styleTokens
                      .filter((styleToken) => styleToken.code !== "r")
                      .map((styleToken) => (
                        <button
                          key={styleToken.code}
                          type="button"
                          onClick={() => onInsertToken(`\u00A7${styleToken.code}`)}
                          className="inline-flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2 text-xs font-medium text-surface-100 transition-colors hover:border-brand-500/35"
                        >
                          {styleToken.name}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => onInsertToken("\u00A7r")}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2 text-xs font-medium text-surface-100 transition-colors hover:border-brand-500/35"
                    >
                      Reset Style
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsertToken("\n")}
                      className="inline-flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2 text-xs font-medium text-surface-100 transition-colors hover:border-brand-500/35"
                    >
                      New Line
                    </button>
                    <button
                      type="button"
                      onClick={onClearAll}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-200 transition-colors hover:border-red-400/35"
                    >
                      Clear All
                    </button>
                  </div>

                  <p className="mt-5 text-[11px] uppercase tracking-[0.18em] text-surface-500">Colors</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {colorTokens.map((color) => (
                      <button
                        key={color.code}
                        type="button"
                        onClick={() => onInsertToken(`\u00A7${color.code}`)}
                        className="group relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-surface-700/70 bg-surface-900/70 transition-colors hover:border-brand-500/35 focus-visible:border-brand-500/35"
                        aria-label={`Use ${color.name}`}
                      >
                        <span className="h-5 w-5 rounded-full border border-black/20" style={{ backgroundColor: color.hex }} />
                        <span className="pointer-events-none absolute -top-10 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-surface-700/80 bg-surface-950/95 px-2 py-1 text-[11px] font-medium text-surface-100 shadow-lg group-hover:block group-focus-visible:block">
                          {color.name}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-surface-500">Symbols</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {symbolTokens.map((symbol) => (
                      <button
                        key={`${activePropertyCustomizer}-${symbol.label}`}
                        type="button"
                        onClick={() => onInsertToken(symbol.value)}
                        className="inline-flex items-center gap-2 rounded-lg border border-surface-700/70 bg-surface-900/70 px-3 py-2 text-xs font-medium text-surface-100 transition-colors hover:border-brand-500/35"
                      >
                        <span>{symbol.value}</span>
                        {symbol.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-surface-800 bg-surface-950/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-surface-500">Live Preview</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewBackgroundPresets.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onPreviewBackgroundChange(preset.id)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                          propertyPreviewBackground === preset.id
                            ? "border-brand-400/50 bg-brand-500/15 text-brand-100"
                            : "border-surface-700/70 bg-surface-900/70 text-surface-300 hover:border-brand-500/35"
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className={cn(
                      "mt-3 min-h-[120px] rounded-xl border border-surface-800 px-4 py-3 text-sm leading-6 text-white",
                      previewBackgroundPresets.find((preset) => preset.id === propertyPreviewBackground)?.className || "bg-black/70"
                    )}
                  >
                    {previewContent}
                  </div>
                  <p className="mt-3 text-xs text-surface-500">
                    {activePropertyCustomizer === "motd"
                      ? "This editor saves Minecraft formatting codes into server.properties automatically."
                      : "This editor converts your styled text into Minecraft chat-component JSON automatically when saving the prompt."}
                  </p>
                </div>

                <div className="sticky bottom-0 flex justify-end gap-3 border-t border-surface-800 bg-surface-900/95 pt-4 backdrop-blur sm:static sm:border-t-0 sm:bg-transparent sm:pt-0">
                  <button type="button" onClick={onClose} className="btn-secondary">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
