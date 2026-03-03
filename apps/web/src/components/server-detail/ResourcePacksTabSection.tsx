import type { ChangeEvent, DragEvent, RefObject } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Link2,
  Pencil,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import type { ResourcePackBuildInfo } from "@/lib/api";
import type { AvailableResourcePack } from "@/components/server-detail/server-detail-types";
import { cn, formatBytes } from "@/lib/utils";

interface ResourcePacksTabSectionProps {
  resourcePackDragActive: boolean;
  onResourcePackDragEnter: (event: DragEvent<HTMLElement>) => void;
  onResourcePackDragOver: (event: DragEvent<HTMLElement>) => void;
  onResourcePackDragLeave: (event: DragEvent<HTMLElement>) => void;
  onResourcePackDrop: (event: DragEvent<HTMLElement>) => void;
  fetchResourcePackData: () => void | Promise<void>;
  actionLoading: string | null;
  openResourcePackPicker: () => void;
  resourcePackInputRef: RefObject<HTMLInputElement | null>;
  handleUploadResourcePack: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  resourcePackImageInputRef: RefObject<HTMLInputElement | null>;
  handleBuildImageSelected: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  resourcePackNotice: string;
  resourcePackProgress: { label: string; percent: number } | null;
  orderedAvailablePacks: AvailableResourcePack[];
  selectedPackIds: string[];
  toggleSelectAllPacks: () => void;
  allAvailablePacksSelected: boolean;
  handleDeleteSelectedPacks: () => void | Promise<void>;
  setSelectedPackIds: (ids: string[]) => void;
  editingPackId: string | null;
  editingPackName: string;
  setEditingPackName: (value: string) => void;
  draggedPackId: string | null;
  dragOverPackId: string | null;
  handlePackPointerDown: (packId: string) => void;
  handlePackPointerEnter: (packId: string) => void;
  togglePackSelection: (packId: string) => void;
  handleRenamePack: (pack: AvailableResourcePack) => void | Promise<void>;
  startEditingPack: (pack: AvailableResourcePack) => void;
  cancelEditingPack: () => void;
  setDeletePackConfirm: (pack: AvailableResourcePack) => void;
  movePackInLibrary: (packId: string, direction: "up" | "down") => void;
  buildName: string;
  setBuildName: (value: string) => void;
  serverName: string;
  buildImagePreviewUrl: string | null;
  buildImageFile: File | null;
  openDraftBuildImagePicker: () => void;
  clearDraftBuildImage: () => void;
  handleBuildMergedPack: () => void | Promise<void>;
  previewPackNames: string[];
  previewConflicts: string[];
  resourcePackBuilds: ResourcePackBuildInfo[];
  editingBuildId: string | null;
  editingBuildName: string;
  setEditingBuildName: (value: string) => void;
  handleRenameBuild: (build: ResourcePackBuildInfo) => void | Promise<void>;
  startEditingBuild: (build: ResourcePackBuildInfo) => void;
  cancelEditingBuild: () => void;
  openBuildImagePicker: (buildId: string) => void;
  handleAssignBuild: (buildId: string) => void | Promise<void>;
  setDeleteBuildConfirm: (build: ResourcePackBuildInfo) => void;
}

export function ResourcePacksTabSection({
  resourcePackDragActive,
  onResourcePackDragEnter,
  onResourcePackDragOver,
  onResourcePackDragLeave,
  onResourcePackDrop,
  fetchResourcePackData,
  actionLoading,
  openResourcePackPicker,
  resourcePackInputRef,
  handleUploadResourcePack,
  resourcePackImageInputRef,
  handleBuildImageSelected,
  resourcePackNotice,
  resourcePackProgress,
  orderedAvailablePacks,
  selectedPackIds,
  toggleSelectAllPacks,
  allAvailablePacksSelected,
  handleDeleteSelectedPacks,
  setSelectedPackIds,
  editingPackId,
  editingPackName,
  setEditingPackName,
  draggedPackId,
  dragOverPackId,
  handlePackPointerDown,
  handlePackPointerEnter,
  togglePackSelection,
  handleRenamePack,
  startEditingPack,
  cancelEditingPack,
  setDeletePackConfirm,
  movePackInLibrary,
  buildName,
  setBuildName,
  serverName,
  buildImagePreviewUrl,
  buildImageFile,
  openDraftBuildImagePicker,
  clearDraftBuildImage,
  handleBuildMergedPack,
  previewPackNames,
  previewConflicts,
  resourcePackBuilds,
  editingBuildId,
  editingBuildName,
  setEditingBuildName,
  handleRenameBuild,
  startEditingBuild,
  cancelEditingBuild,
  openBuildImagePicker,
  handleAssignBuild,
  setDeleteBuildConfirm,
}: ResourcePacksTabSectionProps) {
  return (
    <div className="space-y-6">
      <div
        className={cn("card relative transition-all duration-200", resourcePackDragActive && "scale-[1.01] border-brand-500/40")}
        onDragEnter={onResourcePackDragEnter}
        onDragOver={onResourcePackDragOver}
        onDragLeave={onResourcePackDragLeave}
        onDrop={onResourcePackDrop}
      >
        {resourcePackDragActive && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[inherit] border border-dashed border-brand-400/50 bg-brand-500/10 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15 text-brand-200">
                <Upload size={24} />
              </div>
              <p className="text-sm font-semibold text-brand-100">Drop resource packs here</p>
              <p className="mt-1 text-xs text-brand-200/85">Only `.zip` files are supported</p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-surface-100">Merged Resource Pack Builder</h3>
            <p className="mt-1 text-sm text-surface-400">
              Upload multiple packs, set the merge order, build one public download, then assign it to this server.
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-brand-300/80">
              Drag and drop `.zip` packs anywhere in this panel
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => void fetchResourcePackData()}
              disabled={actionLoading !== null}
              className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openResourcePackPicker}
              disabled={actionLoading !== null}
              className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
            >
              <Upload size={14} />
              {actionLoading === "uploadPack" ? "Uploading..." : "Upload Packs"}
            </button>
            <input
              ref={resourcePackInputRef}
              type="file"
              accept=".zip,application/zip"
              multiple
              className="sr-only"
              onChange={handleUploadResourcePack}
            />
            <input
              ref={resourcePackImageInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                void handleBuildImageSelected(event);
              }}
            />
          </div>
        </div>

        {resourcePackNotice && (
          <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {resourcePackNotice}
          </div>
        )}

        {resourcePackProgress && (
          <div className="mt-4 rounded-xl border border-brand-500/25 bg-brand-500/10 px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm text-brand-100">
              <span>{resourcePackProgress.label}</span>
              <span>{resourcePackProgress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-surface-950/70">
              <div
                className="h-full rounded-full bg-brand-400 transition-all"
                style={{ width: `${resourcePackProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Available Packs</h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-500">{orderedAvailablePacks.length} total</span>
              </div>
            </div>
            {selectedPackIds.length > 0 && (
              <div className="rounded-2xl border border-brand-500/15 bg-surface-900/65 px-4 py-3 text-xs text-surface-300 shadow-lg shadow-black/10">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Select all packs"
                      onClick={toggleSelectAllPacks}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border transition-colors",
                        allAvailablePacksSelected
                          ? "border-brand-400 bg-brand-500/20 text-brand-200"
                          : "border-surface-700 bg-surface-900/70 text-transparent hover:border-brand-500/40"
                      )}
                    >
                      <Check size={12} />
                    </button>
                    <span className="inline-flex items-center gap-2">
                      <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-brand-300">
                        Selection
                      </span>
                      {selectedPackIds.length} pack{selectedPackIds.length > 1 ? "s" : ""} selected
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteSelectedPacks()}
                      disabled={actionLoading !== null}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200"
                    >
                      <Trash2 size={12} />
                      {actionLoading === "deletePack" ? "Deleting..." : "Delete selected"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPackIds([])}
                      className="text-surface-500 transition-colors hover:text-surface-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {orderedAvailablePacks.length === 0 ? (
                <div className="rounded-2xl border border-surface-700/70 bg-surface-900/40 px-4 py-8 text-center text-sm text-surface-500">
                  Add resource packs to start building.
                </div>
              ) : (
                orderedAvailablePacks.map((pack, index) => {
                  const isSelected = selectedPackIds.includes(pack.id);
                  const isEditing = editingPackId === pack.id;
                  const canMoveUp = index > 0;
                  const canMoveDown = index < orderedAvailablePacks.length - 1;
                  const draggedIndex = draggedPackId ? orderedAvailablePacks.findIndex((item) => item.id === draggedPackId) : -1;
                  const isDragTarget = dragOverPackId === pack.id && draggedPackId !== pack.id;
                  const dropDirection = isDragTarget && draggedIndex !== -1 && draggedIndex < index ? "down" : "up";

                  return (
                    <div
                      key={pack.id}
                      onPointerDown={() => handlePackPointerDown(pack.id)}
                      onPointerEnter={() => handlePackPointerEnter(pack.id)}
                      className={cn(
                        "relative rounded-2xl border px-4 py-4 transition-all duration-200 ease-out",
                        draggedPackId ? "select-none" : "",
                        draggedPackId === pack.id && "scale-[0.985] border-brand-400/35 bg-brand-500/8 shadow-none cursor-grabbing",
                        draggedPackId !== pack.id && "cursor-grab",
                        isSelected ? "border-red-500/30 bg-red-500/10" : "border-surface-700/70 bg-surface-900/40",
                        isDragTarget && "border-cyan-400/40 bg-cyan-500/10",
                        isDragTarget && dropDirection === "up" && "-translate-y-1",
                        isDragTarget && dropDirection === "down" && "translate-y-1"
                      )}
                    >
                      {isDragTarget && (
                        <div
                          className={cn(
                            "absolute left-4 right-4 h-0.5 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.5)]",
                            dropDirection === "up" ? "top-1.5" : "bottom-1.5"
                          )}
                        />
                      )}
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          aria-label={isSelected ? "Unselect for delete" : "Select for delete"}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            togglePackSelection(pack.id);
                          }}
                          className={cn(
                            "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-colors",
                            isSelected
                              ? "border-brand-400 bg-brand-500/20 text-brand-200"
                              : "border-surface-700 bg-surface-900/70 text-transparent hover:border-brand-500/40"
                          )}
                        >
                          <Check size={12} />
                        </button>
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-950/80">
                          {pack.kind === "pending" && pack.imagePreviewUrl ? (
                            <img src={pack.imagePreviewUrl} alt={`${pack.name} pack image preview`} className="h-full w-full object-cover" />
                          ) : pack.kind === "stored" && pack.imageUrl ? (
                            <img src={pack.imageUrl} alt={`${pack.name} cover`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-surface-500">
                              <ImageIcon size={22} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingPackName}
                                autoFocus
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => setEditingPackName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleRenamePack(pack);
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEditingPack();
                                  }
                                }}
                                className="input-field h-9 min-w-0 w-full max-w-full flex-1 py-1.5 text-sm sm:min-w-[220px]"
                              />
                            ) : (
                              <p className="truncate font-medium text-surface-100">{pack.name}</p>
                            )}
                            <span className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-brand-200">
                              Layer {index + 1}
                            </span>
                            {isSelected && (
                              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-red-200">
                                Selected For Delete
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-surface-500">{pack.originalFilename}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-surface-400 sm:gap-3">
                            <span>{formatBytes(pack.sizeBytes)}</span>
                            {pack.kind === "stored" && <span className="font-mono">{pack.sha1.slice(0, 12)}...</span>}
                            <span>
                              {pack.kind === "pending"
                                ? pack.imagePreviewUrl ? "Preview ready" : "No pack image"
                                : pack.imageUrl ? "Pack image found" : "No pack image"}
                            </span>
                          </div>
                          <p className="mt-3 text-xs text-surface-500">
                            {isSelected
                              ? "This pack is selected for bulk delete only."
                              : "Drag to reorder and manage this source pack. Its image is read from the pack itself."}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isEditing) {
                              void handleRenamePack(pack);
                              return;
                            }
                            startEditingPack(pack);
                          }}
                          disabled={actionLoading !== null}
                          className="btn-icon h-9 w-full border border-surface-700/70 bg-surface-900/70 text-surface-300 hover:text-surface-100 sm:w-9"
                          title={isEditing ? "Save name" : "Rename pack"}
                          aria-label={isEditing ? "Save name" : "Rename pack"}
                        >
                          {isEditing ? <Save size={14} /> : <Pencil size={14} />}
                        </button>
                        {isEditing && (
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              cancelEditingPack();
                            }}
                            disabled={actionLoading !== null}
                            className="btn-icon h-9 w-full border border-surface-700/70 bg-surface-900/70 text-surface-300 hover:text-surface-100 sm:w-9"
                            title="Cancel rename"
                            aria-label="Cancel rename"
                          >
                            <X size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeletePackConfirm(pack);
                          }}
                          disabled={actionLoading !== null}
                          className="btn-icon h-9 w-full border border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/20 sm:w-9"
                          title="Delete pack"
                          aria-label="Delete pack"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            movePackInLibrary(pack.id, "up");
                          }}
                          disabled={!canMoveUp}
                          className="btn-icon h-9 w-full border border-surface-700/70 bg-surface-900/70 text-surface-300 hover:text-surface-100 disabled:cursor-not-allowed disabled:opacity-40 sm:w-9"
                          title="Move up"
                          aria-label="Move up"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            movePackInLibrary(pack.id, "down");
                          }}
                          disabled={!canMoveDown}
                          className="btn-icon h-9 w-full border border-surface-700/70 bg-surface-900/70 text-surface-300 hover:text-surface-100 disabled:cursor-not-allowed disabled:opacity-40 sm:w-9"
                          title="Move down"
                          aria-label="Move down"
                        >
                          <ChevronDown size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="self-start rounded-2xl border border-surface-700/70 bg-surface-900/35 p-4">
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Build Pack</h4>
            <p className="mt-1 text-sm text-surface-400">
              All available packs are merged from top to bottom. Lower packs override earlier ones when they contain the same file path.
            </p>
            <p className="mt-2 text-xs text-surface-500">
              {orderedAvailablePacks.length > 0
                ? `${orderedAvailablePacks.length} pack${orderedAvailablePacks.length > 1 ? "s are" : " is"} ready to build`
                : "No packs uploaded yet."}
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-surface-300">Build Name</label>
                <input
                  type="text"
                  value={buildName}
                  onChange={(event) => setBuildName(event.target.value)}
                  placeholder={`${serverName}-resource-pack`}
                  className="input-field w-full"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-surface-300">Merged Pack Image</label>
                <div className="flex items-start gap-3 rounded-2xl border border-surface-700/70 bg-surface-950/40 p-3">
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-950/80">
                    {buildImagePreviewUrl ? (
                      <img src={buildImagePreviewUrl} alt="Merged pack image preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-surface-500">
                        <ImageIcon size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-surface-300">
                      {buildImageFile
                        ? "Custom image selected for the next merged pack build."
                        : "Use the merged result image by default, or choose a custom image for the next build."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={openDraftBuildImagePicker}
                        disabled={actionLoading !== null}
                        className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                      >
                        <ImageIcon size={14} />
                        {buildImageFile ? "Change Build Image" : "Set Build Image"}
                      </button>
                      {buildImageFile && (
                        <button
                          type="button"
                          onClick={clearDraftBuildImage}
                          disabled={actionLoading !== null}
                          className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                        >
                          <X size={14} />
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-xs text-surface-500">
                Configure prompt, require-resource-pack, and other server properties in the Properties tab.
              </p>

              <button
                type="button"
                onClick={() => void handleBuildMergedPack()}
                disabled={orderedAvailablePacks.length === 0 || actionLoading !== null}
                className="btn-primary flex w-full items-center justify-center gap-2"
              >
                <WandSparkles size={15} />
                {actionLoading === "buildPack" ? "Building..." : "Build Merged Pack"}
              </button>
            </div>
          </div>
        </div>

        {(previewPackNames.length > 0 || previewConflicts.length > 0) && (
          <div className="mt-6 rounded-2xl border border-surface-700/70 bg-surface-900/35 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Merge Preview</h4>
                <p className="mt-1 break-words text-sm text-surface-400">
                  Build order: {previewPackNames.join(" > ") || "Selected packs"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  previewConflicts.length > 0
                    ? "border border-amber-500/25 bg-amber-500/10 text-amber-200"
                    : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                )}
              >
                {previewConflicts.length > 0
                  ? `${previewConflicts.length} override${previewConflicts.length > 1 ? "s" : ""}`
                  : "No file overrides"}
              </span>
            </div>

            {previewConflicts.length > 0 && (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-surface-800 bg-surface-950/60 p-3">
                <div className="space-y-2">
                  {previewConflicts.map((conflictPath) => (
                    <div key={conflictPath} className="font-mono text-xs text-surface-300">
                      {conflictPath}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-surface-100">Built Packs</h3>
            <p className="mt-1 text-sm text-surface-400">
              Each build gives you one public link. Assign the build you want this server to use.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {resourcePackBuilds.length === 0 ? (
            <div className="rounded-2xl border border-surface-700/70 bg-surface-900/40 px-4 py-8 text-center text-sm text-surface-500">
              No merged resource pack builds yet.
            </div>
          ) : (
            resourcePackBuilds.map((build) => (
              <div key={build.id} className="rounded-2xl border border-surface-700/70 bg-surface-900/40 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex flex-1 items-start gap-4">
                    <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-surface-700/70 bg-surface-950/80">
                      {build.imageUrl ? (
                        <img src={build.imageUrl} alt={`${build.name} merged pack image`} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-surface-500">
                          <ImageIcon size={24} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {editingBuildId === build.id ? (
                          <input
                            type="text"
                            value={editingBuildName}
                            autoFocus
                            onChange={(event) => setEditingBuildName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleRenameBuild(build);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEditingBuild();
                              }
                            }}
                            className="input-field h-9 min-w-0 w-full max-w-full flex-1 py-1.5 text-sm sm:min-w-[220px]"
                          />
                        ) : (
                          <p className="truncate font-medium text-surface-100">{build.name}</p>
                        )}
                        <span className="rounded-full border border-surface-700/70 bg-surface-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-surface-400">
                          {build.packCount} packs
                        </span>
                        {build.conflictCount > 0 && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                            {build.conflictCount} overrides
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-col gap-1 text-sm text-surface-400">
                        <p className="break-all font-mono text-xs text-brand-200">{build.publicUrl}</p>
                        <p>{build.imageUrl ? "Merged image is set and can be replaced." : "No merged image found in this build yet."}</p>
                        <p>
                          Size: {formatBytes(build.sizeBytes)} · SHA1: <span className="font-mono">{build.sha1}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <button
                      type="button"
                      onClick={() => openBuildImagePicker(build.id)}
                      disabled={actionLoading !== null}
                      className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                    >
                      <ImageIcon size={14} />
                      {actionLoading === "updatePackImage" ? "Updating Image..." : "Edit Build Image"}
                    </button>
                    <a
                      href={build.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                    >
                      <Link2 size={14} />
                      Open Link
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleAssignBuild(build.id)}
                      disabled={actionLoading !== null}
                      className="btn-primary inline-flex items-center justify-center gap-2 text-sm"
                    >
                      {actionLoading === "assignPack" ? "Assigning..." : "Assign To This Server"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingBuildId === build.id) {
                          void handleRenameBuild(build);
                          return;
                        }
                        startEditingBuild(build);
                      }}
                      disabled={actionLoading !== null}
                      className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                    >
                      {editingBuildId === build.id ? <Save size={14} /> : <Pencil size={14} />}
                      {actionLoading === "renameBuild"
                        ? "Renaming..."
                        : editingBuildId === build.id
                          ? "Save"
                          : "Rename"}
                    </button>
                    {editingBuildId === build.id && (
                      <button
                        type="button"
                        onClick={cancelEditingBuild}
                        disabled={actionLoading !== null}
                        className="btn-secondary inline-flex items-center justify-center gap-2 text-sm"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteBuildConfirm(build)}
                      disabled={actionLoading !== null}
                      className="btn-secondary inline-flex items-center justify-center gap-2 border-red-500/20 bg-red-500/10 text-sm text-red-200 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                      {actionLoading === "deleteBuild" ? "Deleting..." : "Delete Build"}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
