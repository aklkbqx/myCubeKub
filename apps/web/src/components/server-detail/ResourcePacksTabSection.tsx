import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from "react";
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
import type { ResourcePackBuildDetail, ResourcePackBuildInfo } from "@/lib/api";
import type { AvailableResourcePack } from "@/components/server-detail/server-detail-types";
import { cn, formatBytes } from "@/lib/utils";

interface ResourcePackThumbnailProps {
  src?: string | null;
  alt: string;
  sizeClassName?: string;
  iconSize?: number;
}

function ResourcePackThumbnail({
  src,
  alt,
  sizeClassName = "h-full w-full object-cover",
  iconSize = 22,
}: ResourcePackThumbnailProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-surface-500">
        <ImageIcon size={iconSize} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={sizeClassName}
      onError={() => setFailed(true)}
    />
  );
}

interface IconTooltipProps {
  label: string;
  children: ReactNode;
}

function IconTooltip({ label, children }: IconTooltipProps) {
  return (
    <span className="group/icon-tooltip relative inline-flex w-full sm:w-auto">
      {children}
      <span className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-surface-700/80 bg-surface-950/95 px-2 py-1 text-[11px] font-medium text-surface-100 shadow-lg sm:group-hover/icon-tooltip:block sm:group-focus-within/icon-tooltip:block">
        {label}
      </span>
    </span>
  );
}

function packActionButtonClassName(tone: "default" | "danger" = "default") {
  return cn(
    "inline-flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl border text-center transition-colors sm:btn-icon sm:h-9 sm:min-h-0 sm:w-9 sm:flex-row sm:gap-0",
    tone === "danger"
      ? "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/20"
      : "border-surface-700/70 bg-surface-900/70 text-surface-300 hover:text-surface-100"
  );
}

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
  selectedBuildId: string | null;
  selectedBuildDetail: ResourcePackBuildDetail | null;
  orderedAvailablePacks: AvailableResourcePack[];
  orderedLibraryPacks: AvailableResourcePack[];
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
  handlePackPointerMove: (packId: string, clientY: number, rectTop: number, rectHeight: number) => void;
  togglePackSelection: (packId: string) => void;
  handleRenamePack: (pack: AvailableResourcePack) => void | Promise<void>;
  startEditingPack: (pack: AvailableResourcePack) => void;
  cancelEditingPack: () => void;
  setDeletePackConfirm: (pack: AvailableResourcePack) => void;
  movePackInLibrary: (packId: string, direction: "up" | "down") => void;
  buildName: string;
  setBuildName: (value: string) => void;
  buildDescription: string;
  setBuildDescription: (value: string) => void;
  serverName: string;
  buildImagePreviewUrl: string | null;
  buildImageFile: File | null;
  openDraftBuildImagePicker: () => void;
  clearDraftBuildImage: () => void;
  handleBuildMergedPack: () => void | Promise<void>;
  previewPackNames: string[];
  previewConflicts: string[];
  selectBuild: (buildId: string) => void | Promise<void>;
  clearSelectedBuild: () => void;
  resourcePackBuilds: ResourcePackBuildInfo[];
  editingBuildId: string | null;
  editingBuildName: string;
  setEditingBuildName: (value: string) => void;
  editingBuildDescription: string;
  setEditingBuildDescription: (value: string) => void;
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
  selectedBuildId,
  selectedBuildDetail,
  orderedAvailablePacks,
  orderedLibraryPacks,
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
  handlePackPointerMove,
  togglePackSelection,
  handleRenamePack,
  startEditingPack,
  cancelEditingPack,
  setDeletePackConfirm,
  movePackInLibrary,
  buildName,
  setBuildName,
  buildDescription,
  setBuildDescription,
  serverName,
  buildImagePreviewUrl,
  buildImageFile,
  openDraftBuildImagePicker,
  clearDraftBuildImage,
  handleBuildMergedPack,
  previewPackNames,
  previewConflicts,
  selectBuild,
  clearSelectedBuild,
  resourcePackBuilds,
  editingBuildId,
  editingBuildName,
  setEditingBuildName,
  editingBuildDescription,
  setEditingBuildDescription,
  handleRenameBuild,
  startEditingBuild,
  cancelEditingBuild,
  openBuildImagePicker,
  handleAssignBuild,
  setDeleteBuildConfirm,
}: ResourcePacksTabSectionProps) {
  const builderPanelRef = useRef<HTMLDivElement | null>(null);
  const packCardRefs = useRef(new Map<string, HTMLDivElement>());
  const previousPackPositionsRef = useRef(new Map<string, DOMRect>());
  const previousPackOrderRef = useRef<string[]>([]);
  const isBuildSelected = Boolean(selectedBuildDetail);
  const selectedBuild = selectedBuildDetail?.build ?? null;
  const selectedBuildPacks = Array.isArray(selectedBuildDetail?.packs) ? selectedBuildDetail.packs : [];
  const activeConflictPreview = Array.isArray(selectedBuildDetail?.conflicts) ? selectedBuildDetail.conflicts : previewConflicts;
  const activePackPreviewNames = selectedBuildPacks.length > 0 ? selectedBuildPacks.map((pack) => pack.name) : previewPackNames;

  useLayoutEffect(() => {
    const currentOrder = orderedAvailablePacks.map((pack) => pack.id);
    const previousOrder = previousPackOrderRef.current;
    const orderChanged =
      previousOrder.length === currentOrder.length &&
      previousOrder.some((id, index) => currentOrder[index] !== id);

    if (orderChanged) {
      orderedAvailablePacks.forEach((pack) => {
        const node = packCardRefs.current.get(pack.id);
        const previousRect = previousPackPositionsRef.current.get(pack.id);
        if (!node || !previousRect) return;

        const nextRect = node.getBoundingClientRect();
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;

        if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
          return;
        }

        node.animate(
          [
            {
              transform: `translate(${deltaX}px, ${deltaY}px) scale(0.985)`,
            },
            {
              transform: "translate(0px, 0px) scale(1)",
            },
          ],
          {
            duration: 220,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          }
        );
      });
    }

    const nextPositions = new Map<string, DOMRect>();
    orderedAvailablePacks.forEach((pack) => {
      const node = packCardRefs.current.get(pack.id);
      if (node) {
        nextPositions.set(pack.id, node.getBoundingClientRect());
      }
    });
    previousPackPositionsRef.current = nextPositions;
    previousPackOrderRef.current = currentOrder;
  }, [orderedAvailablePacks]);

  useEffect(() => {
    if (!selectedBuildId || !builderPanelRef.current) return;

    builderPanelRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [selectedBuildId]);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div
        ref={builderPanelRef}
        className={cn("card relative overflow-hidden transition-all duration-200", resourcePackDragActive && "scale-[1.005] border-brand-500/40")}
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
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={() => void fetchResourcePackData()}
              disabled={actionLoading !== null}
              className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openResourcePackPicker}
              disabled={actionLoading !== null}
              className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm"
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

        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] xl:gap-6">
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">
                  {isBuildSelected ? "Selected Build Packs" : "Available Packs"}
                </h4>
                <p className="mt-1 text-xs text-surface-500">
                  {isBuildSelected
                    ? `Showing packs used in "${selectedBuild?.name}".`
                    : "These packs are used for the next merged build draft."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-500">{orderedAvailablePacks.length} total</span>
                {isBuildSelected && (
                  <button
                    type="button"
                    onClick={clearSelectedBuild}
                    disabled={actionLoading !== null}
                    className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 px-3 text-sm"
                  >
                    <X size={14} />
                    Close Selection
                  </button>
                )}
              </div>
            </div>
            {!isBuildSelected && selectedPackIds.length > 0 && (
              <div className="rounded-2xl border border-brand-500/15 bg-surface-900/65 px-3 py-3 text-xs text-surface-300 shadow-lg shadow-black/10 sm:px-4">
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
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      onClick={() => void handleDeleteSelectedPacks()}
                      disabled={actionLoading !== null}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200"
                    >
                      <Trash2 size={12} />
                      {actionLoading === "deletePack" ? "Deleting..." : "Delete selected"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPackIds([])}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-surface-700/70 bg-surface-900/70 px-2.5 py-1.5 text-surface-400 transition-colors hover:text-surface-200 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
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
                  {isBuildSelected ? "This build has no linked source packs." : "Add resource packs to start building."}
                </div>
              ) : (
                orderedAvailablePacks.map((pack, index) => {
                  const isSelected = !isBuildSelected && selectedPackIds.includes(pack.id);
                  const isEditing = editingPackId === pack.id;
                  const canMoveUp = !isBuildSelected && index > 0;
                  const canMoveDown = !isBuildSelected && index < orderedAvailablePacks.length - 1;
                  const draggedIndex = !isBuildSelected && draggedPackId ? orderedAvailablePacks.findIndex((item) => item.id === draggedPackId) : -1;
                  const isDragTarget = !isBuildSelected && dragOverPackId === pack.id && draggedPackId !== pack.id;
                  const dropDirection = isDragTarget && draggedIndex !== -1 && draggedIndex < index ? "down" : "up";

                  return (
                    <div
                      key={pack.id}
                      ref={(node) => {
                        if (node) {
                          packCardRefs.current.set(pack.id, node);
                        } else {
                          packCardRefs.current.delete(pack.id);
                        }
                      }}
                      onPointerDown={isBuildSelected ? undefined : () => handlePackPointerDown(pack.id)}
                      onPointerEnter={isBuildSelected ? undefined : () => handlePackPointerEnter(pack.id)}
                      onPointerMove={isBuildSelected ? undefined : (event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        handlePackPointerMove(pack.id, event.clientY, rect.top, rect.height);
                      }}
                      className={cn(
                        "relative rounded-2xl border px-3 py-3 transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out will-change-transform sm:px-4 sm:py-4",
                        !isBuildSelected && draggedPackId ? "select-none" : "",
                        !isBuildSelected && draggedPackId === pack.id && "z-10 scale-[0.985] border-brand-400/35 bg-brand-500/8 shadow-[0_18px_45px_rgba(34,197,94,0.18)] cursor-grabbing",
                        !isBuildSelected && draggedPackId !== pack.id && "cursor-grab",
                        isSelected ? "border-red-500/30 bg-red-500/10" : "border-surface-700/70 bg-surface-900/40",
                        isDragTarget && "border-brand-400/40 bg-brand-500/10 shadow-[0_12px_30px_rgba(34,197,94,0.14)]",
                        isDragTarget && dropDirection === "up" && "-translate-y-2",
                        isDragTarget && dropDirection === "down" && "translate-y-2"
                      )}
                    >
                      {isDragTarget && (
                        <div
                          className={cn(
                            "absolute left-3 right-3 h-0.5 rounded-full bg-brand-300 shadow-[0_0_12px_rgba(74,222,128,0.45)] sm:left-4 sm:right-4",
                            dropDirection === "up" ? "top-1.5" : "bottom-1.5"
                          )}
                        />
                      )}
                      <div className="flex items-start gap-3">
                        {!isBuildSelected && (
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
                        )}
                        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-950/80 sm:h-20 sm:w-20 sm:rounded-2xl">
                          <ResourcePackThumbnail
                            src={pack.kind === "pending" ? pack.imagePreviewUrl : pack.imageUrl}
                            alt={pack.kind === "pending" ? `${pack.name} pack image preview` : `${pack.name} cover`}
                          />
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
                              <p className="line-clamp-2 break-words text-sm font-medium text-surface-100 sm:truncate sm:text-base">{pack.name}</p>
                            )}
                            <span className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-brand-200">
                              Layer {index + 1}
                            </span>
                            {isBuildSelected && (
                              <span className="rounded-full border border-surface-700/70 bg-surface-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-surface-300">
                                From Selected Build
                              </span>
                            )}
                            {isSelected && (
                              <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-red-200">
                                Selected For Delete
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-surface-500">{pack.originalFilename}</p>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-surface-400 sm:gap-3 sm:text-xs">
                            <span>{formatBytes(pack.sizeBytes)}</span>
                            {pack.kind === "stored" && <span className="font-mono">{pack.sha1.slice(0, 12)}...</span>}
                            <span>
                              {pack.kind === "pending"
                                ? pack.imagePreviewUrl ? "Preview ready" : "No pack image"
                                : pack.imageUrl ? "Pack image found" : "No pack image"}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-surface-500 sm:mt-3 sm:text-xs">
                            {isBuildSelected
                              ? "This pack belongs to the selected merged build. Close selection to manage the full library again."
                              : isSelected
                              ? "This pack is selected for bulk delete only."
                              : "Drag to reorder and manage this source pack. Its image is read from the pack itself."}
                          </p>
                        </div>
                      </div>
                      {!isBuildSelected && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:flex sm:flex-wrap">
                        <IconTooltip label={isEditing ? "Save name" : "Rename pack"}>
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
                            className={packActionButtonClassName()}
                            aria-label={isEditing ? "Save name" : "Rename pack"}
                          >
                            {isEditing ? <Save size={14} /> : <Pencil size={14} />}
                            <span className="text-[11px] leading-none sm:hidden">{isEditing ? "Save" : "Rename"}</span>
                          </button>
                        </IconTooltip>
                        {isEditing && (
                          <IconTooltip label="Cancel rename">
                            <button
                              type="button"
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                              event.stopPropagation();
                              cancelEditingPack();
                            }}
                            disabled={actionLoading !== null}
                            className={packActionButtonClassName()}
                            aria-label="Cancel rename"
                          >
                            <X size={14} />
                            <span className="text-[11px] leading-none sm:hidden">Cancel</span>
                          </button>
                        </IconTooltip>
                        )}
                        <IconTooltip label="Delete pack">
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeletePackConfirm(pack);
                            }}
                            disabled={actionLoading !== null}
                            className={packActionButtonClassName("danger")}
                            aria-label="Delete pack"
                          >
                            <Trash2 size={14} />
                            <span className="text-[11px] leading-none sm:hidden">Delete</span>
                          </button>
                        </IconTooltip>
                        <IconTooltip label="Move up">
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              movePackInLibrary(pack.id, "up");
                            }}
                            disabled={!canMoveUp}
                            className={cn(packActionButtonClassName(), "disabled:cursor-not-allowed disabled:opacity-40")}
                            aria-label="Move up"
                          >
                            <ChevronUp size={16} />
                            <span className="text-[11px] leading-none sm:hidden">Up</span>
                          </button>
                        </IconTooltip>
                        <IconTooltip label="Move down">
                          <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              movePackInLibrary(pack.id, "down");
                            }}
                            disabled={!canMoveDown}
                            className={cn(packActionButtonClassName(), "disabled:cursor-not-allowed disabled:opacity-40")}
                            aria-label="Move down"
                          >
                            <ChevronDown size={16} />
                            <span className="text-[11px] leading-none sm:hidden">Down</span>
                          </button>
                        </IconTooltip>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="self-start rounded-2xl border border-surface-700/70 bg-surface-900/35 p-4 sm:p-5">
            {selectedBuild ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Merged Resource Pack Builder</h4>
                    <p className="mt-1 text-sm text-surface-400">
                      Selected build is loaded here for editing. Close selection to return to a blank builder for a new merged pack.
                    </p>
                  </div>
                  {selectedBuild.assignedToServer && (
                    <span className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-brand-200">
                      Assigned To Server
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-surface-300">Build Name</label>
                    <input
                      type="text"
                      value={editingBuildId === selectedBuild.id ? editingBuildName : selectedBuild.name}
                      onChange={(event) => setEditingBuildName(event.target.value)}
                      disabled={editingBuildId !== selectedBuild.id}
                      className="input-field w-full disabled:opacity-70"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-surface-300">Build Description</label>
                    <textarea
                      value={editingBuildId === selectedBuild.id ? editingBuildDescription : (selectedBuild.description ?? "")}
                      onChange={(event) => setEditingBuildDescription(event.target.value)}
                      disabled={editingBuildId !== selectedBuild.id}
                      rows={3}
                      className="input-field w-full resize-y py-3 disabled:opacity-70"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-surface-300">Merged Pack Image</label>
                    <div className="flex flex-col gap-3 rounded-2xl border border-surface-700/70 bg-surface-950/40 p-3 sm:flex-row sm:items-start">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-950/80 sm:h-20 sm:w-20 sm:rounded-2xl">
                        <ResourcePackThumbnail
                          src={selectedBuild.imageUrl}
                          alt={`${selectedBuild.name} merged pack image`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-surface-300">
                          {selectedBuild.imageUrl ? "This image is stored on the merged pack and can be replaced here." : "No image is stored on this build yet."}
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => openBuildImagePicker(selectedBuild.id)}
                            disabled={actionLoading !== null}
                            className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                          >
                            <ImageIcon size={14} />
                            {actionLoading === "updatePackImage" ? "Updating..." : "Edit Image"}
                          </button>
                          <a
                            href={selectedBuild.publicUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                          >
                            <Link2 size={14} />
                            Open Link
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-surface-400 sm:grid-cols-2">
                    <div className="rounded-xl border border-surface-800/80 bg-surface-950/45 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Public Link</p>
                      <p className="mt-1 break-all font-mono text-brand-200">{selectedBuild.publicUrl}</p>
                    </div>
                    <div className="rounded-xl border border-surface-800/80 bg-surface-950/45 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Build Info</p>
                      <p className="mt-1">Size: {formatBytes(selectedBuild.sizeBytes)}</p>
                      <p className="mt-1 break-all font-mono">SHA1: {selectedBuild.sha1}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void handleAssignBuild(selectedBuild.id)}
                      disabled={actionLoading !== null}
                      className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                    >
                      {actionLoading === "assignPack" ? "Assigning..." : selectedBuild.assignedToServer ? "Reassign To Server" : "Assign To Server"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (editingBuildId === selectedBuild.id) {
                          void handleRenameBuild(selectedBuild);
                          return;
                        }
                        startEditingBuild(selectedBuild);
                      }}
                      disabled={actionLoading !== null}
                      className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                    >
                      {editingBuildId === selectedBuild.id ? <Save size={14} /> : <Pencil size={14} />}
                      {editingBuildId === selectedBuild.id ? "Save Changes" : "Edit Details"}
                    </button>
                    {editingBuildId === selectedBuild.id && (
                      <button
                        type="button"
                        onClick={cancelEditingBuild}
                        disabled={actionLoading !== null}
                        className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteBuildConfirm(selectedBuild)}
                      disabled={actionLoading !== null}
                      className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 border-red-500/20 bg-red-500/10 text-sm text-red-200 hover:bg-red-500/20"
                    >
                      <Trash2 size={14} />
                      {actionLoading === "deleteBuild" ? "Deleting..." : "Delete Build"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Build Pack</h4>
                <p className="mt-1 text-sm text-surface-400">
                  All available packs are merged from top to bottom. Lower packs override earlier ones when they contain the same file path.
                </p>
                <p className="mt-2 text-xs text-surface-500">
                  {orderedLibraryPacks.length > 0
                    ? `${orderedLibraryPacks.length} pack${orderedLibraryPacks.length > 1 ? "s are" : " is"} ready to build`
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
                    <label className="mb-1.5 block text-sm font-medium text-surface-300">Build Description</label>
                    <textarea
                      value={buildDescription}
                      onChange={(event) => setBuildDescription(event.target.value)}
                      placeholder="Optional description for this merged build"
                      rows={3}
                      className="input-field w-full resize-y py-3"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-surface-300">Merged Pack Image</label>
                    <div className="flex flex-col gap-3 rounded-2xl border border-surface-700/70 bg-surface-950/40 p-3 sm:flex-row sm:items-start">
                      <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-950/80 sm:h-20 sm:w-20 sm:rounded-2xl">
                        <ResourcePackThumbnail
                          src={buildImagePreviewUrl}
                          alt="Merged pack image preview"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-surface-300">
                          {buildImageFile
                            ? "Custom image selected for the next merged pack build."
                            : "Use the merged result image by default, or choose a custom image for the next build."}
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                          <button
                            type="button"
                            onClick={openDraftBuildImagePicker}
                            disabled={actionLoading !== null}
                            className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
                          >
                            <ImageIcon size={14} />
                            {buildImageFile ? "Change Build Image" : "Set Build Image"}
                          </button>
                          {buildImageFile && (
                            <button
                              type="button"
                              onClick={clearDraftBuildImage}
                              disabled={actionLoading !== null}
                              className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-sm"
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
                    disabled={orderedLibraryPacks.length === 0 || actionLoading !== null}
                    className="btn-primary flex w-full items-center justify-center gap-2"
                  >
                    <WandSparkles size={15} />
                    {actionLoading === "buildPack" ? "Building..." : "Build Merged Pack"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {(activePackPreviewNames.length > 0 || activeConflictPreview.length > 0) && (
          <div className="mt-6 rounded-2xl border border-surface-700/70 bg-surface-900/35 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-surface-300">Merge Preview</h4>
                <p className="mt-1 break-words text-sm text-surface-400">
                  Build order: {activePackPreviewNames.join(" > ") || "Selected packs"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  activeConflictPreview.length > 0
                    ? "border border-amber-500/25 bg-amber-500/10 text-amber-200"
                    : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                )}
              >
                {activeConflictPreview.length > 0
                  ? `${activeConflictPreview.length} override${activeConflictPreview.length > 1 ? "s" : ""}`
                  : "No file overrides"}
              </span>
            </div>

            {activeConflictPreview.length > 0 && (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-surface-800 bg-surface-950/60 p-3">
                <div className="space-y-2">
                  {activeConflictPreview.map((conflictPath) => (
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
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-surface-100">Built Packs</h3>
            <p className="mt-1 text-sm text-surface-400">
              Merged outputs ready to preview, assign, edit, or remove.
            </p>
          </div>
          <span className="rounded-full border border-surface-700/70 bg-surface-950/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-surface-400">
            {resourcePackBuilds.length} total
          </span>
        </div>

        <div className="space-y-3">
          {resourcePackBuilds.length === 0 ? (
            <div className="rounded-2xl border border-surface-700/70 bg-surface-900/40 px-4 py-8 text-center text-sm text-surface-500">
              No merged resource pack builds yet.
            </div>
          ) : (
            resourcePackBuilds.map((build) => (
              <div
                key={build.id}
                onClick={() => {
                  void selectBuild(build.id);
                }}
                className={cn(
                  "rounded-2xl border bg-surface-900/40 p-3 transition-[border-color,box-shadow,transform,background-color] duration-200 sm:p-4",
                  actionLoading === null && "cursor-pointer hover:-translate-y-0.5 hover:border-cyan-400/30 hover:bg-surface-900/60",
                  selectedBuildId === build.id
                    ? "border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.35),0_20px_50px_rgba(8,145,178,0.18)]"
                    : build.assignedToServer
                      ? "border-brand-500/25 shadow-[0_0_0_1px_rgba(34,197,94,0.08)]"
                      : "border-surface-700/70"
                )}
              >
                <div className="flex flex-col gap-4">
                  <div className="min-w-0 flex flex-1 items-start gap-3 sm:gap-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-surface-700/70 bg-surface-950/80 sm:h-20 sm:w-20 sm:rounded-2xl">
                      <ResourcePackThumbnail
                        src={build.imageUrl}
                        alt={`${build.name} merged pack image`}
                        iconSize={22}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="line-clamp-2 break-words text-sm font-semibold text-surface-100 sm:text-base">
                          {build.name}
                        </h4>
                        <span className="rounded-full border border-surface-700/70 bg-surface-950/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-surface-400">
                          {build.packCount} packs
                        </span>
                        {selectedBuildId === build.id && (
                          <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                            Selected For Edit
                          </span>
                        )}
                        {build.assignedToServer && (
                          <span className="rounded-full border border-brand-500/25 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-brand-200">
                            Active on server
                          </span>
                        )}
                        {build.conflictCount > 0 && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
                            {build.conflictCount} overrides
                          </span>
                        )}
                      </div>

                      {build.description ? (
                        <p className="mt-2 text-sm text-surface-300">{build.description}</p>
                      ) : null}

                      <div className="mt-3 grid gap-2 text-xs text-surface-400 sm:grid-cols-2">
                        <div className="rounded-xl border border-surface-800/80 bg-surface-950/45 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Public Link</p>
                          <p className="mt-1 break-all font-mono text-brand-200">{build.publicUrl}</p>
                        </div>
                        <div className="rounded-xl border border-surface-800/80 bg-surface-950/45 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-surface-500">Build Info</p>
                          <p className="mt-1">Size: {formatBytes(build.sizeBytes)}</p>
                          <p className="mt-1 break-all font-mono">SHA1: {build.sha1}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-surface-800/80 pt-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-surface-500">
                        {selectedBuildId === build.id
                          ? "Selected now. Edit image and details in the builder above."
                          : "Click this card to load it into the builder above."}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleAssignBuild(build.id);
                          }}
                          disabled={actionLoading !== null}
                          className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 px-5 text-sm sm:min-w-[220px]"
                        >
                          {actionLoading === "assignPack" ? "Assigning..." : build.assignedToServer ? "Reassign To Server" : "Assign To Server"}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteBuildConfirm(build);
                          }}
                          disabled={actionLoading !== null}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-red-500/20 bg-red-500/8 px-4 text-sm font-medium text-red-200 transition-all duration-200 hover:border-red-400/30 hover:bg-red-500/14 disabled:opacity-60"
                        >
                          <Trash2 size={14} />
                          {actionLoading === "deleteBuild" ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
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
