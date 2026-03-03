import type { ChangeEvent, DragEvent } from "react";
import { FilePlus2, ImageIcon, RotateCcw, Save, WandSparkles } from "lucide-react";
import SelectDropdown from "@/components/SelectDropdown";
import { cn } from "@/lib/utils";
import type { CustomizablePropertyKey, PropertyField } from "@/components/server-detail/properties-config";

interface PropertiesTabSectionProps {
  propertiesSectionReady: boolean;
  propertiesInitializing: boolean;
  propertiesBootstrapExpired: boolean;
  propertiesBootstrapRemainingMs: number;
  actionLoading: string | null;
  canUndoPropertyChange: boolean;
  onUndoPropertyChange: () => void;
  onSaveProperties: () => void;
  onCreatePropertiesFile: () => void;
  hasUnsavedProperties: boolean;
  hasPendingServerIcon: boolean;
  propertiesSaved: boolean;
  serverPropertiesExists: boolean;
  serverIconUrl: string;
  serverIconDragActive: boolean;
  onServerIconDragActiveChange: (isActive: boolean) => void;
  onServerIconDrop: (event: DragEvent<HTMLLabelElement>) => void | Promise<void>;
  onServerIconUpload: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  pendingServerIconFile: File | null;
  serverIconUploadProgress: number | null;
  propertyFields: PropertyField[];
  properties: Record<string, string>;
  propertyDefaults: Record<string, string>;
  customizablePropertyKeys: Set<CustomizablePropertyKey>;
  propertyFormatDrafts: Record<CustomizablePropertyKey, string>;
  onCustomizablePropertyChange: (key: CustomizablePropertyKey, value: string) => void;
  onPropertyValueChange: (key: string, value: string) => void;
  onOpenCustomizer: (key: CustomizablePropertyKey) => void;
  showAdvancedProperties: boolean;
  onToggleAdvancedProperties: () => void;
  onRawCustomizablePropertySync: (key: CustomizablePropertyKey, rawValue: string) => void;
}

export function PropertiesTabSection({
  propertiesSectionReady,
  propertiesInitializing,
  propertiesBootstrapExpired,
  propertiesBootstrapRemainingMs,
  actionLoading,
  canUndoPropertyChange,
  onUndoPropertyChange,
  onSaveProperties,
  onCreatePropertiesFile,
  hasUnsavedProperties,
  hasPendingServerIcon,
  propertiesSaved,
  serverPropertiesExists,
  serverIconUrl,
  serverIconDragActive,
  onServerIconDragActiveChange,
  onServerIconDrop,
  onServerIconUpload,
  pendingServerIconFile,
  serverIconUploadProgress,
  propertyFields,
  properties,
  propertyDefaults,
  customizablePropertyKeys,
  propertyFormatDrafts,
  onCustomizablePropertyChange,
  onPropertyValueChange,
  onOpenCustomizer,
  showAdvancedProperties,
  onToggleAdvancedProperties,
  onRawCustomizablePropertySync,
}: PropertiesTabSectionProps) {
  const bootstrapSecondsRemaining = Math.ceil(propertiesBootstrapRemainingMs / 1000);
  const showMissingPropertiesState =
    propertiesSectionReady &&
    !propertiesInitializing &&
    !serverPropertiesExists;

  return (
    <div className="card">
      {!propertiesSectionReady || propertiesInitializing ? (
        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-surface-800/80 bg-surface-950/45">
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <div className="max-w-md text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-surface-700 border-t-brand-400" />
              <p className="text-base font-semibold text-surface-100">
                {propertiesInitializing ? "Preparing server.properties" : "Waiting for server startup"}
              </p>
              <p className="mt-2 text-sm leading-6 text-surface-400">
                {propertiesInitializing
                  ? "Minecraft is still generating its initial configuration files. This section will unlock automatically when server.properties is ready."
                  : "The server container is still starting. Server properties will appear after startup completes."}
              </p>
              {propertiesInitializing ? (
                <p className="mt-3 text-xs text-surface-500">
                  Usually this takes less than a minute.
                  {bootstrapSecondsRemaining > 0 ? ` Retrying automatically for about ${bootstrapSecondsRemaining}s more.` : ""}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : showMissingPropertiesState ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-6 py-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/15 text-amber-100">
              <FilePlus2 size={22} />
            </div>
            <h3 className="text-lg font-semibold text-amber-50">
              {propertiesBootstrapExpired
                ? "`server.properties` is missing after startup"
                : "No `server.properties` file found"}
            </h3>
            <p className="mt-3 text-sm leading-6 text-amber-100/90">
              {propertiesBootstrapExpired
                ? "The file looks like it was never generated or has already been removed. Create a fresh default server.properties file to continue managing server settings."
                : "This server does not have a server.properties file yet. Create a recommended default file first, then the full properties editor will appear here."}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={onCreatePropertiesFile}
                disabled={actionLoading !== null}
                className="btn-secondary inline-flex items-center justify-center gap-2 border-amber-500/30 bg-amber-500/15 text-amber-50 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FilePlus2 size={14} />
                Create server.properties
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-surface-100">Server Properties</h3>
              <p className="mt-1 text-sm text-surface-400">
                Manage the most common server settings here, then use the raw editor for advanced values.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onUndoPropertyChange}
                disabled={actionLoading !== null || !canUndoPropertyChange}
                className="btn-secondary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Undo
              </button>
              <button
                onClick={onSaveProperties}
                disabled={actionLoading !== null || (!hasUnsavedProperties && !hasPendingServerIcon)}
                className="btn-primary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save size={14} />
                {propertiesSaved ? "Saved ✓" : "Save"}
              </button>
            </div>
          </div>

          {hasUnsavedProperties && (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              You have unsaved changes in server properties.
            </div>
          )}

          <div className="mb-6 rounded-2xl border border-surface-700/70 bg-surface-900/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Server Icon</h4>
                <p className="mt-1 text-sm text-surface-400">
                  Recommended size: 64x64 PNG.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="flex items-center justify-center">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-950/70 shadow-inner shadow-black/20">
                  <img
                    src={serverIconUrl}
                    alt="Server icon preview"
                    className="h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                      event.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                    onLoad={(event) => {
                      event.currentTarget.style.display = "block";
                      event.currentTarget.nextElementSibling?.classList.add("hidden");
                    }}
                  />
                  <div className="hidden flex-col items-center gap-2 text-surface-500">
                    <div className="flex justify-center">
                      <ImageIcon size={24} />
                    </div>
                    <span className="text-xs">No icon yet</span>
                  </div>
                </div>
              </div>

              <label
                onDragEnter={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onServerIconDragActiveChange(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!serverIconDragActive) onServerIconDragActiveChange(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onServerIconDragActiveChange(false);
                }}
                onDrop={(event) => void onServerIconDrop(event)}
                className={cn(
                  "relative flex min-h-[132px] cursor-pointer flex-col justify-center rounded-2xl border border-dashed px-5 py-5 transition-all",
                  serverIconDragActive
                    ? "border-brand-400/60 bg-brand-500/10"
                    : "border-surface-700/70 bg-surface-950/50 hover:border-brand-500/35 hover:bg-surface-900/70"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10 text-brand-300">
                    <ImageIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-surface-100">
                      {actionLoading === "saveProps" && serverIconUploadProgress !== null
                        ? `Uploading server icon... ${serverIconUploadProgress}%`
                        : pendingServerIconFile
                          ? "Server icon ready to upload on save"
                          : "Choose server-icon.png"}
                    </p>
                    <p className="mt-1 text-sm text-surface-400">
                      Click to choose a PNG file or drag and drop it here. The icon uploads only after you save settings.
                    </p>
                    <p className="mt-3 text-xs text-surface-500">
                      Minecraft reads this file from the server data directory using the exact name `server-icon.png`.
                    </p>
                    {pendingServerIconFile ? (
                      <p className="mt-2 text-xs text-brand-200">
                        Pending icon: {pendingServerIconFile.name}
                      </p>
                    ) : null}
                    {actionLoading === "saveProps" && serverIconUploadProgress !== null ? (
                      <div className="mt-3">
                        <div className="h-2 overflow-hidden rounded-full bg-surface-800">
                          <div
                            className="h-full rounded-full bg-brand-400 transition-[width]"
                            style={{ width: `${serverIconUploadProgress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={onServerIconUpload}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {propertyFields.map((field) => {
              const value = properties[field.key] ?? propertyDefaults[field.key] ?? "";
              const isCustomizableProperty = customizablePropertyKeys.has(field.key as CustomizablePropertyKey);

              return (
                <div key={field.key} className="rounded-2xl border border-surface-700/70 bg-surface-900/45 p-4">
                  <div className="mb-3">
                    <label className="text-sm font-semibold text-surface-200">{field.label}</label>
                    <p className="mt-1 text-sm text-surface-400">{field.description}</p>
                  </div>

                  {field.type === "select" ? (
                    <SelectDropdown
                      options={field.options}
                      value={value}
                      onChange={(nextValue) => onPropertyValueChange(field.key, nextValue)}
                      placeholder={`Select ${field.label}`}
                    />
                  ) : field.type === "boolean" ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={value === "true"}
                      onClick={() => onPropertyValueChange(field.key, value === "true" ? "false" : "true")}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all",
                        value === "true"
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-surface-700/80 bg-surface-950/70"
                      )}
                    >
                      <div>
                        <p
                          className={cn(
                            "text-sm font-medium",
                            value === "true" ? "text-emerald-100" : "text-surface-200"
                          )}
                        >
                          {value === "true" ? "Enabled" : "Disabled"}
                        </p>
                        <p className="mt-1 text-xs text-surface-400">
                          Click to {value === "true" ? "disable" : "enable"} this setting.
                        </p>
                      </div>
                      <span
                        className={cn(
                          "relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full border transition-colors",
                          value === "true"
                            ? "border-emerald-400/40 bg-emerald-500/25"
                            : "border-surface-700 bg-surface-900"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-5 w-5 rounded-full shadow-lg transition-all",
                            value === "true"
                              ? "translate-x-6 bg-emerald-200"
                              : "translate-x-1 bg-surface-300"
                          )}
                        />
                      </span>
                    </button>
                  ) : isCustomizableProperty ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={propertyFormatDrafts[field.key as CustomizablePropertyKey] ?? ""}
                        onChange={(event) => onCustomizablePropertyChange(field.key as CustomizablePropertyKey, event.target.value)}
                        placeholder={field.placeholder}
                        className="input-field w-full"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-800 bg-surface-950/45 px-3 py-3">
                        <div className="min-w-0">
                          <p className="text-xs text-surface-400">
                            {field.key === "motd"
                              ? "Use advanced customize to add Minecraft colors, styles, symbols, and preview."
                              : "Use advanced customize to build a styled prompt without writing JSON yourself."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenCustomizer(field.key as CustomizablePropertyKey)}
                          className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                        >
                          <WandSparkles size={14} />
                          Advanced Customize
                        </button>
                      </div>
                    </div>
                  ) : (
                    <input
                      type={field.type}
                      value={value}
                      min={field.type === "number" ? 0 : undefined}
                      onChange={(event) => onPropertyValueChange(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      className="input-field w-full"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-surface-700/70 bg-surface-900/35">
            <button
              type="button"
              onClick={onToggleAdvancedProperties}
              className="flex w-full items-center justify-between px-4 py-4 text-left"
            >
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Advanced Raw Editor</h4>
                <p className="mt-1 text-sm text-surface-400">
                  Edit the full `server.properties` file for values not covered by the form above.
                </p>
              </div>
              <span className="text-sm text-brand-300">
                {showAdvancedProperties ? "Hide" : "Show"}
              </span>
            </button>

            {showAdvancedProperties && (
              <div className="border-t border-surface-800 px-4 pb-4 pt-2">
                <div className="max-h-[500px] space-y-2 overflow-y-auto pr-2">
                  {Object.entries(properties)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <label className="w-56 flex-shrink-0 truncate font-mono text-xs text-surface-400" title={key}>
                          {key}
                        </label>
                        <input
                          type="text"
                          value={value}
                          onChange={(event) => {
                            onPropertyValueChange(key, event.target.value);
                            if (customizablePropertyKeys.has(key as CustomizablePropertyKey)) {
                              onRawCustomizablePropertySync(key as CustomizablePropertyKey, event.target.value);
                            }
                          }}
                          className="input-field flex-1 py-1.5 font-mono text-sm"
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
