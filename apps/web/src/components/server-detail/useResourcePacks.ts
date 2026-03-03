import { type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type ResourcePackBuildDetail, type ResourcePackBuildInfo, type ResourcePackInfo } from "@/lib/api";
import { extractPackImagePreviewFromZip, resizeResourcePackImage } from "@/components/server-detail/resource-pack-utils";
import type { AvailableResourcePack, PendingResourcePack, ResourcePackConfirmState } from "@/components/server-detail/server-detail-types";

type UseResourcePacksOptions = {
  serverId?: string;
  serverName?: string;
  serverStatus?: string;
  activeTab: string;
  fetchProperties: () => Promise<void>;
  setActionError: Dispatch<SetStateAction<string>>;
  setActionLoading: Dispatch<SetStateAction<string | null>>;
  setRestartNotice: Dispatch<SetStateAction<string>>;
};

export function useResourcePacks({
  serverId,
  serverName,
  serverStatus,
  activeTab,
  fetchProperties,
  setActionError,
  setActionLoading,
  setRestartNotice,
}: UseResourcePacksOptions) {
  const normalizeBuildDetail = useCallback((detail: ResourcePackBuildDetail): ResourcePackBuildDetail => ({
    build: detail.build,
    packs: Array.isArray(detail.packs) ? detail.packs : [],
    conflicts: Array.isArray(detail.conflicts) ? detail.conflicts : [],
  }), []);

  const [resourcePacks, setResourcePacks] = useState<ResourcePackInfo[]>([]);
  const [resourcePackBuilds, setResourcePackBuilds] = useState<ResourcePackBuildInfo[]>([]);
  const [resourcePacksLoaded, setResourcePacksLoaded] = useState(false);
  const [pendingResourcePacks, setPendingResourcePacks] = useState<PendingResourcePack[]>([]);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editingPackName, setEditingPackName] = useState("");
  const [editingBuildId, setEditingBuildId] = useState<string | null>(null);
  const [editingBuildName, setEditingBuildName] = useState("");
  const [editingBuildDescription, setEditingBuildDescription] = useState("");
  const [selectedBuildId, setSelectedBuildId] = useState<string | null>(null);
  const [selectedBuildDetail, setSelectedBuildDetail] = useState<ResourcePackBuildDetail | null>(null);
  const [packOrderIds, setPackOrderIds] = useState<string[]>([]);
  const [buildName, setBuildName] = useState("");
  const [buildDescription, setBuildDescription] = useState("");
  const [buildImageFile, setBuildImageFile] = useState<File | null>(null);
  const [buildImagePreviewUrl, setBuildImagePreviewUrl] = useState<string | null>(null);
  const [previewConflicts, setPreviewConflicts] = useState<string[]>([]);
  const [previewPackNames, setPreviewPackNames] = useState<string[]>([]);
  const [resourcePackNotice, setResourcePackNotice] = useState("");
  const [resourcePackProgress, setResourcePackProgress] = useState<{ label: string; percent: number } | null>(null);
  const [resourcePackConfirm, setResourcePackConfirm] = useState<ResourcePackConfirmState | null>(null);
  const [resourcePackDragActive, setResourcePackDragActive] = useState(false);
  const [draggedPackId, setDraggedPackId] = useState<string | null>(null);
  const [dragOverPackId, setDragOverPackId] = useState<string | null>(null);

  const resourcePackInputRef = useRef<HTMLInputElement | null>(null);
  const resourcePackImageInputRef = useRef<HTMLInputElement | null>(null);
  const buildImageTargetRef = useRef<string | null>(null);
  const resourcePackDragDepthRef = useRef(0);
  const pendingPackPreviewUrlsRef = useRef(new Set<string>());
  const buildImagePreviewUrlRef = useRef<string | null>(null);

  const revokePendingPackPreview = useCallback((previewUrl: string | null) => {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    pendingPackPreviewUrlsRef.current.delete(previewUrl);
  }, []);

  const clearBuildDraft = useCallback(() => {
    setBuildName("");
    setBuildDescription("");
    setPreviewConflicts([]);
    setPreviewPackNames([]);
  }, []);

  const refreshSelectedBuildDetail = useCallback(async (buildId: string | null) => {
    if (!serverId || !buildId) {
      setSelectedBuildDetail(null);
      return null;
    }

    const detail = normalizeBuildDetail(await api.resourcePacks.getBuild(serverId, buildId));
    setSelectedBuildDetail(detail);
    return detail;
  }, [normalizeBuildDetail, serverId]);

  const fetchResourcePackData = useCallback(async () => {
    if (!serverId) return;
    setResourcePacksLoaded(false);
    try {
      const [{ packs }, { builds }] = await Promise.all([
        api.resourcePacks.list(serverId),
        api.resourcePacks.listBuilds(serverId),
      ]);
      setResourcePacks(packs);
      setResourcePackBuilds(builds);
      if (selectedBuildId) {
        if (builds.some((build) => build.id === selectedBuildId)) {
          await refreshSelectedBuildDetail(selectedBuildId);
        } else {
          setSelectedBuildId(null);
          setSelectedBuildDetail(null);
        }
      }
    } catch (err: any) {
      setResourcePacks([]);
      setResourcePackBuilds([]);
      setSelectedBuildDetail(null);
      setActionError(err.message || "Failed to load resource pack library");
    } finally {
      setResourcePacksLoaded(true);
    }
  }, [refreshSelectedBuildDetail, selectedBuildId, serverId, setActionError]);

  const queueResourcePackFiles = useCallback(async (fileList: FileList | File[]) => {
    const uploadableFiles = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".zip"));
    if (uploadableFiles.length === 0) {
      throw new Error("Only .zip resource packs are supported");
    }

    const pendingItems = await Promise.all(
      uploadableFiles.map(async (file) => {
        let imagePreviewUrl: string | null = null;

        try {
          imagePreviewUrl = await extractPackImagePreviewFromZip(file);
          if (imagePreviewUrl) {
            pendingPackPreviewUrlsRef.current.add(imagePreviewUrl);
          }
        } catch {
          imagePreviewUrl = null;
        }

        return {
          id: `pending:${crypto.randomUUID()}`,
          name: file.name.replace(/\.zip$/i, ""),
          originalFilename: file.name,
          sizeBytes: file.size,
          file,
          imagePreviewUrl,
          kind: "pending" as const,
        };
      })
    );

    setActionError("");
    setResourcePackNotice("");
    setPendingResourcePacks((current) => [...current, ...pendingItems]);
    setPackOrderIds((current) => [...current, ...pendingItems.map((item) => item.id)]);
    setResourcePackNotice(
      `${uploadableFiles.length} resource pack${uploadableFiles.length > 1 ? "s added." : " added."}`
    );
  }, [setActionError]);

  const handleUploadResourcePack = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    const selectedFiles = Array.from(files);
    event.target.value = "";

    try {
      await queueResourcePackFiles(selectedFiles);
    } catch (err: any) {
      setActionError(err.message || "Failed to read resource pack files");
    }
  }, [queueResourcePackFiles, setActionError]);

  const openResourcePackPicker = useCallback((actionLoading: string | null) => {
    const input = resourcePackInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input || actionLoading !== null) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }, []);

  const handleResourcePackDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resourcePackDragDepthRef.current += 1;
    setResourcePackDragActive(true);
  }, []);

  const handleResourcePackDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setResourcePackDragActive(true);
  }, []);

  const handleResourcePackDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resourcePackDragDepthRef.current = Math.max(0, resourcePackDragDepthRef.current - 1);
    if (resourcePackDragDepthRef.current === 0) {
      setResourcePackDragActive(false);
    }
  }, []);

  const handleResourcePackDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resourcePackDragDepthRef.current = 0;
    setResourcePackDragActive(false);

    const files = event.dataTransfer.files;
    if (!files?.length) return;

    try {
      await queueResourcePackFiles(files);
    } catch (err: any) {
      setActionError(err.message || "Failed to read resource pack files");
    }
  }, [queueResourcePackFiles, setActionError]);

  const openBuildImagePicker = useCallback((buildId: string, actionLoading: string | null) => {
    const input = resourcePackImageInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input || actionLoading !== null) return;

    buildImageTargetRef.current = buildId;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }, []);

  const openDraftBuildImagePicker = useCallback((actionLoading: string | null) => {
    const input = resourcePackImageInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!input || actionLoading !== null) return;

    buildImageTargetRef.current = "__draft__";
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }, []);

  const replaceDraftBuildImagePreview = useCallback((file: File) => {
    if (buildImagePreviewUrlRef.current) {
      URL.revokeObjectURL(buildImagePreviewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    buildImagePreviewUrlRef.current = nextPreviewUrl;
    setBuildImageFile(file);
    setBuildImagePreviewUrl(nextPreviewUrl);
  }, []);

  const clearDraftBuildImage = useCallback(() => {
    if (buildImagePreviewUrlRef.current) {
      URL.revokeObjectURL(buildImagePreviewUrlRef.current);
      buildImagePreviewUrlRef.current = null;
    }

    setBuildImageFile(null);
    setBuildImagePreviewUrl(null);
  }, []);

  const applyPreparedBuildImage = useCallback(async (file: File, targetBuildId: string) => {
    if (targetBuildId === "__draft__") {
      replaceDraftBuildImagePreview(file);
      setResourcePackNotice("Build image updated. It will be used for the next merged pack.");
      return;
    }

    setActionLoading("updatePackImage");
    try {
      const { build } = await api.resourcePacks.updateBuildImage(targetBuildId, file);
      setResourcePackBuilds((current) => current.map((item) => (item.id === build.id ? build : item)));
      if (selectedBuildId === build.id) {
        await refreshSelectedBuildDetail(build.id);
      }
      setResourcePackNotice(`Updated merged pack image for "${build.name}".`);
    } finally {
      setActionLoading(null);
    }
  }, [refreshSelectedBuildDetail, replaceDraftBuildImagePreview, selectedBuildId, setActionLoading]);

  const consumeBuildImageSelectionTarget = useCallback(() => {
    const targetBuildId = buildImageTargetRef.current;
    buildImageTargetRef.current = null;
    return targetBuildId;
  }, []);

  const handleBuildImageSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const targetBuildId = consumeBuildImageSelectionTarget();
    event.target.value = "";

    if (!file || !targetBuildId) return;

    setActionError("");
    setResourcePackNotice("");

    try {
      const resizedImage = await resizeResourcePackImage(file);
      await applyPreparedBuildImage(resizedImage, targetBuildId);
    } catch (err: any) {
      setActionError(err.message || "Failed to update merged resource pack image");
    }
  }, [applyPreparedBuildImage, consumeBuildImageSelectionTarget, setActionError]);

  const togglePackSelection = useCallback((packId: string) => {
    setPreviewConflicts([]);
    setPreviewPackNames([]);
    setSelectedPackIds((current) => (
      current.includes(packId)
        ? current.filter((id) => id !== packId)
        : [...current, packId]
    ));
  }, []);

  const movePackInLibrary = useCallback((packId: string, direction: "up" | "down") => {
    setPreviewConflicts([]);
    setPreviewPackNames([]);
    setPackOrderIds((current) => {
      const index = current.indexOf(packId);
      if (index === -1) return current;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }, []);

  const movePackToPosition = useCallback((packId: string, targetPackId: string) => {
    if (packId === targetPackId) return;

    setPreviewConflicts([]);
    setPreviewPackNames([]);
    setPackOrderIds((current) => {
      const sourceIndex = current.indexOf(packId);
      const targetIndex = current.indexOf(targetPackId);
      if (sourceIndex === -1 || targetIndex === -1) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const movePackNearTarget = useCallback((packId: string, targetPackId: string, placement: "before" | "after") => {
    if (packId === targetPackId) return;

    setPreviewConflicts([]);
    setPreviewPackNames([]);
    setPackOrderIds((current) => {
      const sourceIndex = current.indexOf(packId);
      const targetIndex = current.indexOf(targetPackId);
      if (sourceIndex === -1 || targetIndex === -1) return current;

      const next = [...current];
      const [moved] = next.splice(sourceIndex, 1);
      const adjustedTargetIndex = next.indexOf(targetPackId);
      if (adjustedTargetIndex === -1) return current;

      next.splice(placement === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1, 0, moved);
      return next;
    });
  }, []);

  const handlePackPointerDown = useCallback((packId: string) => {
    setDraggedPackId(packId);
    setDragOverPackId(packId);
  }, []);

  const handlePackPointerEnter = useCallback((packId: string) => {
    setDragOverPackId(packId);
    setDraggedPackId((currentDraggedPackId) => {
      if (!currentDraggedPackId || currentDraggedPackId === packId) {
        return currentDraggedPackId;
      }

      movePackToPosition(currentDraggedPackId, packId);
      return currentDraggedPackId;
    });
  }, [movePackToPosition]);

  const handlePackPointerMove = useCallback((
    packId: string,
    clientY: number,
    rectTop: number,
    rectHeight: number
  ) => {
    if (!rectHeight) return;

    setDragOverPackId(packId);
    setDraggedPackId((currentDraggedPackId) => {
      if (!currentDraggedPackId || currentDraggedPackId === packId) {
        return currentDraggedPackId;
      }

      const pointerOffset = clientY - rectTop;
      const activationBand = Math.max(10, rectHeight * 0.60);

      if (pointerOffset <= activationBand) {
        movePackNearTarget(currentDraggedPackId, packId, "before");
      } else if (pointerOffset >= rectHeight - activationBand) {
        movePackNearTarget(currentDraggedPackId, packId, "after");
      }

      return currentDraggedPackId;
    });
  }, [movePackNearTarget]);

  const handlePackPointerRelease = useCallback(() => {
    setDraggedPackId(null);
    setDragOverPackId(null);
  }, []);

  const executeDeleteSelectedPacks = useCallback(async (packIds: string[]) => {
    const storedPacksToDelete = resourcePacks.filter((pack) => packIds.includes(pack.id));
    const pendingPacksToDelete = pendingResourcePacks.filter((pack) => packIds.includes(pack.id));
    const totalToDelete = storedPacksToDelete.length + pendingPacksToDelete.length;
    if (totalToDelete === 0) return;

    setActionError("");
    setResourcePackNotice("");
    setActionLoading("deletePack");
    try {
      const deletedStoredPackIds: string[] = [];
      const lockedPackNames: string[] = [];

      for (const pack of storedPacksToDelete) {
        try {
          await api.resourcePacks.delete(pack.id);
          deletedStoredPackIds.push(pack.id);
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            lockedPackNames.push(pack.name);
            continue;
          }

          throw err;
        }
      }

      const removablePackIds = new Set([
        ...deletedStoredPackIds,
        ...pendingPacksToDelete.map((pack) => pack.id),
      ]);

      pendingPacksToDelete.forEach((pack) => revokePendingPackPreview(pack.imagePreviewUrl));
      setPendingResourcePacks((current) => current.filter((pack) => !removablePackIds.has(pack.id)));
      setSelectedPackIds((current) => current.filter((selectedId) => !removablePackIds.has(selectedId)));
      setPackOrderIds((current) => current.filter((currentId) => !removablePackIds.has(currentId)));
      setPreviewConflicts([]);
      setPreviewPackNames([]);
      setSelectedBuildId(null);
      setSelectedBuildDetail(null);
      await fetchResourcePackData();

      const deletedCount = removablePackIds.size;
      if (deletedCount > 0 && lockedPackNames.length === 0) {
        setResourcePackNotice(`Deleted ${deletedCount} resource pack${deletedCount > 1 ? "s" : ""}.`);
        return;
      }

      if (deletedCount > 0) {
        setResourcePackNotice(
          `Deleted ${deletedCount} resource pack${deletedCount > 1 ? "s" : ""}. ${lockedPackNames.length} still in use by existing build${lockedPackNames.length > 1 ? "s" : ""}.`
        );
        setActionError(`Delete blocked for: ${lockedPackNames.join(", ")}. Delete the related merged build first.`);
        return;
      }

      setActionError(`Delete blocked for: ${lockedPackNames.join(", ")}. Delete the related merged build first.`);
    } catch (err: any) {
      setActionError(err.message || "Failed to delete selected resource packs");
    } finally {
      setActionLoading(null);
    }
  }, [fetchResourcePackData, pendingResourcePacks, resourcePacks, revokePendingPackPreview, setActionError, setActionLoading]);

  const handleDeleteSelectedPacks = useCallback(async () => {
    if (selectedPackIds.length === 0) return;
    setResourcePackConfirm({
      kind: "deleteSelectedPacks",
      packIds: [...selectedPackIds],
    });
  }, [selectedPackIds]);

  const executeDeletePack = useCallback(async (pack: AvailableResourcePack) => {
    setActionError("");
    setResourcePackNotice("");
    setActionLoading("deletePack");
    try {
      if (pack.kind === "stored") {
        await api.resourcePacks.delete(pack.id);
        await fetchResourcePackData();
      } else {
        revokePendingPackPreview(pack.imagePreviewUrl);
        setPendingResourcePacks((current) => current.filter((item) => item.id !== pack.id));
      }
      setSelectedPackIds((current) => current.filter((id) => id !== pack.id));
      setPackOrderIds((current) => current.filter((id) => id !== pack.id));
      setPreviewConflicts([]);
      setPreviewPackNames([]);
      setSelectedBuildId(null);
      setSelectedBuildDetail(null);
      setResourcePackNotice(
        pack.kind === "stored"
          ? `Deleted resource pack "${pack.name}".`
          : `Removed resource pack "${pack.name}".`
      );
    } catch (err: any) {
      setActionError(err.message || "Failed to delete resource pack");
    } finally {
      setActionLoading(null);
    }
  }, [fetchResourcePackData, revokePendingPackPreview, setActionError, setActionLoading]);

  const executeDeleteBuild = useCallback(async (build: ResourcePackBuildInfo) => {
    if (!serverId) return;

    setActionError("");
    setResourcePackNotice("");
    setActionLoading("deleteBuild");
    try {
      const { removedFromServer } = await api.resourcePacks.deleteBuild(serverId, build.id);
      if (selectedBuildId === build.id) {
        setSelectedBuildId(null);
        setSelectedBuildDetail(null);
        setEditingBuildId(null);
        setEditingBuildName("");
        setEditingBuildDescription("");
      }
      await fetchResourcePackData();
      setResourcePackNotice(
        removedFromServer
          ? `Deleted merged build "${build.name}" and removed it from this server.`
          : `Deleted merged build "${build.name}".`
      );
      if (removedFromServer) {
        await fetchProperties();
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to delete merged resource pack");
    } finally {
      setActionLoading(null);
    }
  }, [fetchProperties, fetchResourcePackData, selectedBuildId, serverId, setActionError, setActionLoading]);

  const handleConfirmResourcePackAction = useCallback(async () => {
    if (!resourcePackConfirm) return;

    const confirmState = resourcePackConfirm;
    setResourcePackConfirm(null);

    if (confirmState.kind === "deletePack") {
      await executeDeletePack(confirmState.pack);
      return;
    }

    if (confirmState.kind === "deleteBuild") {
      await executeDeleteBuild(confirmState.build);
      return;
    }

    await executeDeleteSelectedPacks(confirmState.packIds);
  }, [executeDeleteBuild, executeDeletePack, executeDeleteSelectedPacks, resourcePackConfirm]);

  const startEditingPack = useCallback((pack: AvailableResourcePack) => {
    setEditingPackId(pack.id);
    setEditingPackName(pack.name);
  }, []);

  const cancelEditingPack = useCallback(() => {
    setEditingPackId(null);
    setEditingPackName("");
  }, []);

  const handleRenamePack = useCallback(async (pack: AvailableResourcePack) => {
    const nextName = editingPackName.trim();
    if (!nextName) return;
    if (nextName === pack.name) {
      cancelEditingPack();
      return;
    }

    setActionError("");
    setActionLoading("renamePack");
    try {
      if (pack.kind === "stored") {
        await api.resourcePacks.rename(pack.id, nextName);
        await fetchResourcePackData();
      } else {
        setPendingResourcePacks((current) =>
          current.map((item) => item.id === pack.id ? { ...item, name: nextName } : item)
        );
      }
      cancelEditingPack();
    } catch (err: any) {
      setActionError(err.message || "Failed to rename resource pack");
    } finally {
      setActionLoading(null);
    }
  }, [cancelEditingPack, editingPackName, fetchResourcePackData, setActionError, setActionLoading]);

  const startEditingBuild = useCallback((build: ResourcePackBuildInfo) => {
    setEditingBuildId(build.id);
    setEditingBuildName(build.name);
    setEditingBuildDescription(build.description || "");
  }, []);

  const cancelEditingBuild = useCallback(() => {
    setEditingBuildId(null);
    setEditingBuildName("");
    setEditingBuildDescription("");
  }, []);

  const handleRenameBuild = useCallback(async (build: ResourcePackBuildInfo) => {
    if (!serverId) return;

    const nextName = editingBuildName.trim();
    const nextDescription = editingBuildDescription.trim();
    if (!nextName) return;
    if (nextName === build.name && nextDescription === (build.description || "")) {
      cancelEditingBuild();
      return;
    }

    setActionError("");
    setActionLoading("renameBuild");
    try {
      await api.resourcePacks.renameBuild(serverId, build.id, nextName, nextDescription);
      await fetchResourcePackData();
      if (selectedBuildId === build.id) {
        await refreshSelectedBuildDetail(build.id);
      }
      cancelEditingBuild();
    } catch (err: any) {
      setActionError(err.message || "Failed to rename merged build");
    } finally {
      setActionLoading(null);
    }
  }, [cancelEditingBuild, editingBuildDescription, editingBuildName, fetchResourcePackData, refreshSelectedBuildDetail, selectedBuildId, serverId, setActionError, setActionLoading]);

  const handleAssignBuild = useCallback(async (buildId: string) => {
    if (!serverId) return;

    setActionError("");
    setActionLoading("assignPack");
    try {
      const { build } = await api.resourcePacks.assignToServer(buildId, serverId, {});
      await fetchResourcePackData();
      if (selectedBuildId === buildId) {
        await refreshSelectedBuildDetail(buildId);
      }
      setResourcePackNotice(`Assigned merged pack "${build.name}" to this server.`);
      if (serverStatus === "running") {
        setRestartNotice("Resource pack assignment changed. Restart the server to apply the updated pack settings to the running server.");
      }
    } catch (err: any) {
      setActionError(err.message || "Failed to assign merged resource pack");
    } finally {
      setActionLoading(null);
    }
  }, [fetchResourcePackData, refreshSelectedBuildDetail, selectedBuildId, serverId, serverStatus, setActionError, setActionLoading, setRestartNotice]);

  const availableResourcePackEntries: Array<readonly [string, AvailableResourcePack]> = [
    ...resourcePacks.map((pack) => [pack.id, { ...pack, kind: "stored" as const }] as const),
    ...pendingResourcePacks.map((pack) => [pack.id, pack] as const),
  ];
  const availableResourcePackById = new Map<string, AvailableResourcePack>(availableResourcePackEntries);
  const orderedLibraryPacks = packOrderIds
    .map((packId) => availableResourcePackById.get(packId))
    .filter((pack): pack is AvailableResourcePack => Boolean(pack));
  const orderedPendingResourcePacks = orderedLibraryPacks.filter(
    (pack): pack is PendingResourcePack => pack.kind === "pending"
  );
  const selectedBuildPacks: AvailableResourcePack[] = selectedBuildDetail
    ? selectedBuildDetail.packs.map((pack) => ({ ...pack, kind: "stored" as const }))
    : [];
  const orderedAvailablePacks = selectedBuildDetail ? selectedBuildPacks : orderedLibraryPacks;
  const orderedResourcePackIds = orderedLibraryPacks.map((pack) => pack.id);
  const allAvailablePacksSelected = !selectedBuildDetail
    && orderedLibraryPacks.length > 0
    && selectedPackIds.length === orderedLibraryPacks.length;

  const toggleSelectAllPacks = useCallback(() => {
    if (selectedBuildDetail) return;
    setSelectedPackIds((current) =>
      current.length === orderedLibraryPacks.length ? [] : orderedLibraryPacks.map((pack) => pack.id)
    );
  }, [orderedLibraryPacks, selectedBuildDetail]);

  const handleBuildMergedPack = useCallback(async () => {
    if (!serverId || !serverName) return;

    if (orderedResourcePackIds.length === 0) {
      setActionError("Upload at least one resource pack before building.");
      return;
    }

    setActionError("");
    setActionLoading("buildPack");
    try {
      const uploadedPendingPacks: ResourcePackInfo[] = [];

      if (orderedPendingResourcePacks.length > 0) {
        for (const [index, pack] of orderedPendingResourcePacks.entries()) {
          const uploadWeight = orderedPendingResourcePacks.length + 1;
          const uploadStart = (index / uploadWeight) * 100;
          const uploadSpan = 100 / uploadWeight;

          const { pack: uploadedPack } = await api.resourcePacks.upload(
            serverId,
            pack.file,
            pack.name,
            ({ percent }) => {
              setResourcePackProgress({
                label: `Uploading ${index + 1}/${orderedPendingResourcePacks.length}: ${pack.originalFilename}`,
                percent: Math.min(99, Math.round(uploadStart + (percent / 100) * uploadSpan)),
              });
            }
          );
          uploadedPendingPacks.push(uploadedPack);
        }
      }

      const uploadedPackByPendingId = new Map(
        orderedPendingResourcePacks.map((pack, index) => [pack.id, uploadedPendingPacks[index]])
      );

      orderedPendingResourcePacks.forEach((pack) => revokePendingPackPreview(pack.imagePreviewUrl));
      const name = buildName.trim() || `${serverName}-resource-pack`;
      const description = buildDescription.trim();
      setResourcePackProgress({
        label: "Building merged resource pack",
        percent: orderedPendingResourcePacks.length > 0 ? 99 : 50,
      });

      const buildPackIds = orderedLibraryPacks.map((pack) =>
        pack.kind === "stored" ? pack.id : uploadedPackByPendingId.get(pack.id)!.id
      );

      const { build, conflicts } = await api.resourcePacks.build(
        serverId,
        name,
        buildPackIds,
        description,
        buildImageFile || undefined
      );
      setBuildName(build.name);
      setBuildDescription(build.description || "");
      clearDraftBuildImage();
      setPreviewConflicts(conflicts);
      setPreviewPackNames(orderedLibraryPacks.map((pack) => pack.name));
      setPendingResourcePacks((current) => current.filter((pack) => !orderedPendingResourcePacks.some((pending) => pending.id === pack.id)));
      await fetchResourcePackData();
      await fetchProperties();
      setResourcePackProgress({
        label: "Build complete",
        percent: 100,
      });
      window.setTimeout(() => setResourcePackProgress(null), 1200);
    } catch (err: any) {
      setResourcePackProgress(null);
      setActionError(err.message || "Failed to build merged resource pack");
    } finally {
      setActionLoading(null);
    }
  }, [
    buildImageFile,
    buildDescription,
    buildName,
    clearDraftBuildImage,
    fetchProperties,
    fetchResourcePackData,
    orderedLibraryPacks,
    orderedPendingResourcePacks,
    orderedResourcePackIds.length,
    revokePendingPackPreview,
    serverId,
    serverName,
    setActionError,
    setActionLoading,
  ]);

  const selectBuild = useCallback(async (buildId: string) => {
    setActionError("");
    setSelectedPackIds([]);
    cancelEditingPack();
    clearBuildDraft();
    clearDraftBuildImage();
    try {
      await refreshSelectedBuildDetail(buildId);
      setSelectedBuildId(buildId);
    } catch (err: any) {
      setSelectedBuildId(null);
      setSelectedBuildDetail(null);
      setActionError(err.message || "Failed to load merged build details");
    }
  }, [cancelEditingPack, clearBuildDraft, clearDraftBuildImage, refreshSelectedBuildDetail, setActionError]);

  const clearSelectedBuild = useCallback(() => {
    setSelectedBuildId(null);
    setSelectedBuildDetail(null);
    setSelectedPackIds([]);
    setPackOrderIds([]);
    cancelEditingBuild();
    cancelEditingPack();
    clearBuildDraft();
    clearDraftBuildImage();
  }, [cancelEditingBuild, cancelEditingPack, clearBuildDraft, clearDraftBuildImage]);

  useEffect(() => () => {
    pendingPackPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    pendingPackPreviewUrlsRef.current.clear();
    if (buildImagePreviewUrlRef.current) {
      URL.revokeObjectURL(buildImagePreviewUrlRef.current);
      buildImagePreviewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "resourcePacks") return;
    void fetchResourcePackData();
  }, [activeTab, fetchResourcePackData]);

  useEffect(() => {
    setPackOrderIds((current) => {
      const availablePackIds = [
        ...resourcePacks.map((pack) => pack.id),
        ...pendingResourcePacks.map((pack) => pack.id),
      ];
      return current.filter((packId) => availablePackIds.includes(packId));
    });
  }, [pendingResourcePacks, resourcePacks]);

  useEffect(() => {
    if (!draggedPackId) return;

    const handlePointerUp = () => {
      handlePackPointerRelease();
    };

    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [draggedPackId, handlePackPointerRelease]);

  return {
    resourcePacksLoaded,
    resourcePackBuilds,
    resourcePackNotice,
    resourcePackProgress,
    resourcePackConfirm,
    setResourcePackConfirm,
    resourcePackDragActive,
    resourcePackInputRef,
    resourcePackImageInputRef,
    selectedBuildId,
    selectedBuildDetail,
    selectedPackIds,
    setSelectedPackIds,
    editingPackId,
    editingPackName,
    setEditingPackName,
    editingBuildId,
    editingBuildName,
    setEditingBuildName,
    editingBuildDescription,
    setEditingBuildDescription,
    draggedPackId,
    dragOverPackId,
    buildName,
    setBuildName,
    buildDescription,
    setBuildDescription,
    buildImagePreviewUrl,
    buildImageFile,
    previewPackNames,
    previewConflicts,
    orderedAvailablePacks,
    orderedLibraryPacks,
    allAvailablePacksSelected,
    fetchResourcePackData,
    handleUploadResourcePack,
    openResourcePackPicker,
    handleResourcePackDragEnter,
    handleResourcePackDragOver,
    handleResourcePackDragLeave,
    handleResourcePackDrop,
    handleBuildImageSelected,
    applyPreparedBuildImage,
    consumeBuildImageSelectionTarget,
    openBuildImagePicker,
    openDraftBuildImagePicker,
    clearDraftBuildImage,
    togglePackSelection,
    toggleSelectAllPacks,
    movePackInLibrary,
    handlePackPointerDown,
    handlePackPointerEnter,
    handlePackPointerMove,
    handleDeleteSelectedPacks,
    handleBuildMergedPack,
    selectBuild,
    clearSelectedBuild,
    handleAssignBuild,
    handleConfirmResourcePackAction,
    startEditingPack,
    cancelEditingPack,
    handleRenamePack,
    startEditingBuild,
    cancelEditingBuild,
    handleRenameBuild,
  };
}
