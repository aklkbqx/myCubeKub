import { type ChangeEvent, type Dispatch, type DragEvent, type MutableRefObject, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { resizeServerIcon } from "@/components/server-detail/resource-pack-utils";
import {
  editorValueToRawPropertyValue,
  normalizePropertiesForComparison,
  PREVIEW_BACKGROUND_PRESETS,
  PROPERTY_DEFAULTS,
  rawPropertyValueToEditorValue,
  type CustomizablePropertyKey,
} from "@/components/server-detail/properties-config";
import type { ServerDetailTab } from "@/components/server-detail/server-detail-types";

type UseServerPropertiesOptions = {
  id?: string;
  activeTab: ServerDetailTab;
  serverStatus?: string;
  serverCreatedAt?: string;
  setActionError: Dispatch<SetStateAction<string>>;
  setActionLoading: Dispatch<SetStateAction<string | null>>;
};

const PROPERTY_BOOTSTRAP_WINDOW_MS = 2 * 60 * 1000;
const PROPERTY_BOOTSTRAP_POLL_MS = 3_000;

function getBootstrapDeadline(serverCreatedAt?: string) {
  if (!serverCreatedAt) return null;
  const createdAtMs = Date.parse(serverCreatedAt);
  if (Number.isNaN(createdAtMs)) return null;
  return createdAtMs + PROPERTY_BOOTSTRAP_WINDOW_MS;
}

function isWithinBootstrapWindow(serverCreatedAt?: string) {
  const deadline = getBootstrapDeadline(serverCreatedAt);
  return deadline !== null && Date.now() < deadline;
}

export function useServerProperties({
  id,
  activeTab,
  serverStatus,
  serverCreatedAt,
  setActionError,
  setActionLoading,
}: UseServerPropertiesOptions) {
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [serverPropertiesExists, setServerPropertiesExists] = useState(true);
  const [propertiesInitializing, setPropertiesInitializing] = useState(false);
  const [propertiesBootstrapRemainingMs, setPropertiesBootstrapRemainingMs] = useState(0);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [propertiesSaved, setPropertiesSaved] = useState(false);
  const [showAdvancedProperties, setShowAdvancedProperties] = useState(false);
  const [propertyFormatDrafts, setPropertyFormatDrafts] = useState<Record<CustomizablePropertyKey, string>>({
    motd: rawPropertyValueToEditorValue("motd", PROPERTY_DEFAULTS.motd),
    "resource-pack-prompt": rawPropertyValueToEditorValue("resource-pack-prompt", PROPERTY_DEFAULTS["resource-pack-prompt"]),
  });
  const [activePropertyCustomizer, setActivePropertyCustomizer] = useState<CustomizablePropertyKey | null>(null);
  const [propertyPreviewBackground, setPropertyPreviewBackground] = useState<(typeof PREVIEW_BACKGROUND_PRESETS)[number]["id"]>("black");
  const [propertyPreviewAnimationFrame, setPropertyPreviewAnimationFrame] = useState(0);
  const [serverIconDragActive, setServerIconDragActive] = useState(false);
  const [serverIconCacheBust, setServerIconCacheBust] = useState(0);
  const [pendingServerIconFile, setPendingServerIconFile] = useState<File | null>(null);
  const [pendingServerIconPreviewUrl, setPendingServerIconPreviewUrl] = useState<string | null>(null);
  const [serverIconUploadProgress, setServerIconUploadProgress] = useState<number | null>(null);

  const propertyTextareaRefs = useRef<Record<CustomizablePropertyKey, HTMLTextAreaElement | null>>({
    motd: null,
    "resource-pack-prompt": null,
  });
  const serverIconPreviewUrlRef = useRef<string | null>(null);
  const propertiesBaselineRef = useRef<Record<string, string>>({});
  const propertiesRef = useRef<Record<string, string>>({});

  const syncPropertyFormatDrafts = useCallback((nextProperties: Record<string, string>) => {
    setPropertyFormatDrafts({
      motd: rawPropertyValueToEditorValue("motd", nextProperties.motd ?? PROPERTY_DEFAULTS.motd),
      "resource-pack-prompt": rawPropertyValueToEditorValue(
        "resource-pack-prompt",
        nextProperties["resource-pack-prompt"] ?? PROPERTY_DEFAULTS["resource-pack-prompt"]
      ),
    });
  }, []);

  const clearPendingServerIcon = useCallback(() => {
    if (serverIconPreviewUrlRef.current) {
      URL.revokeObjectURL(serverIconPreviewUrlRef.current);
      serverIconPreviewUrlRef.current = null;
    }

    setPendingServerIconFile(null);
    setPendingServerIconPreviewUrl(null);
    setServerIconUploadProgress(null);
  }, []);

  const refreshServerIconPreview = useCallback(() => {
    setServerIconCacheBust(Date.now());
  }, []);

  const fetchProperties = useCallback(async () => {
    if (!id) {
      setPropertiesLoaded(true);
      return;
    }

    setPropertiesLoaded(false);
    try {
      const { properties: nextProperties, exists } = await api.servers.getProperties(id);
      const hasLocalUnsavedProperties =
        JSON.stringify(normalizePropertiesForComparison(propertiesRef.current)) !==
        JSON.stringify(normalizePropertiesForComparison(propertiesBaselineRef.current));
      const shouldTreatAsInitializing =
        !exists &&
        serverStatus === "running" &&
        isWithinBootstrapWindow(serverCreatedAt);

      setServerPropertiesExists(exists);
      setPropertiesInitializing(shouldTreatAsInitializing);
      propertiesBaselineRef.current = nextProperties;

      if (!hasLocalUnsavedProperties) {
        setProperties(nextProperties);
        syncPropertyFormatDrafts(nextProperties);
      }
    } catch {
      setProperties({});
      setServerPropertiesExists(false);
      setPropertiesInitializing(false);
      propertiesBaselineRef.current = {};
      syncPropertyFormatDrafts({});
    } finally {
      setPropertiesLoaded(true);
    }
  }, [id, serverCreatedAt, serverStatus, syncPropertyFormatDrafts]);

  const setPropertyValue = useCallback((key: string, value: string) => {
    setProperties((current) => {
      if ((current[key] ?? "") === value) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }, []);

  const setCustomizablePropertyValue = useCallback((key: CustomizablePropertyKey, editorValue: string) => {
    setPropertyFormatDrafts((current) => ({
      ...current,
      [key]: editorValue,
    }));
    setPropertyValue(key, editorValueToRawPropertyValue(key, editorValue));
  }, [setPropertyValue]);

  const syncCustomizablePropertyDraftFromRaw = useCallback((key: CustomizablePropertyKey, rawValue: string) => {
    setPropertyFormatDrafts((current) => ({
      ...current,
      [key]: rawPropertyValueToEditorValue(key, rawValue),
    }));
  }, []);

  const insertIntoCustomizableProperty = useCallback((key: CustomizablePropertyKey, token: string) => {
    const textarea = propertyTextareaRefs.current[key];
    const currentValue = propertyFormatDrafts[key] ?? "";
    const selectionStart = textarea?.selectionStart ?? currentValue.length;
    const selectionEnd = textarea?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, selectionStart)}${token}${currentValue.slice(selectionEnd)}`;
    const nextCaretPosition = selectionStart + token.length;

    setCustomizablePropertyValue(key, nextValue);

    window.requestAnimationFrame(() => {
      const nextTextarea = propertyTextareaRefs.current[key];
      if (!nextTextarea) {
        return;
      }
      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
    });
  }, [propertyFormatDrafts, setCustomizablePropertyValue]);

  const clearCustomizablePropertyFormatting = useCallback((key: CustomizablePropertyKey) => {
    setCustomizablePropertyValue(key, "");
    window.requestAnimationFrame(() => {
      const textarea = propertyTextareaRefs.current[key];
      textarea?.focus();
    });
  }, [setCustomizablePropertyValue]);

  const handleUndoPropertyChange = useCallback(() => {
    setProperties(propertiesBaselineRef.current);
    syncPropertyFormatDrafts(propertiesBaselineRef.current);
    clearPendingServerIcon();
  }, [clearPendingServerIcon, syncPropertyFormatDrafts]);

  const uploadPendingServerIcon = useCallback(async () => {
    if (!id || !pendingServerIconFile) {
      return false;
    }

    setServerIconUploadProgress(0);
    await api.files.upload(id, pendingServerIconFile, undefined, (progress) => {
      setServerIconUploadProgress(progress.percent);
    });
    refreshServerIconPreview();
    clearPendingServerIcon();
    return true;
  }, [clearPendingServerIcon, id, pendingServerIconFile, refreshServerIconPreview]);

  const handleSaveProperties = useCallback(async () => {
    if (!id) return;

    setActionError("");
    setActionLoading("saveProps");
    try {
      await api.servers.updateProperties(id, propertiesRef.current);
      await uploadPendingServerIcon();
      propertiesBaselineRef.current = propertiesRef.current;
      setPropertiesSaved(true);
      setTimeout(() => setPropertiesSaved(false), 2000);
    } catch (err: any) {
      setActionError(err.message || (pendingServerIconFile ? "Failed to save properties or upload server icon" : "Failed to save properties"));
    } finally {
      setServerIconUploadProgress(null);
      setActionLoading(null);
    }
  }, [id, pendingServerIconFile, setActionError, setActionLoading, uploadPendingServerIcon]);

  const handleCreatePropertiesFile = useCallback(async () => {
    if (!id) return;
    setActionError("");
    setActionLoading("createProps");
    try {
      const created = await api.servers.createProperties(id);
      propertiesBaselineRef.current = created.properties;
      setProperties(created.properties);
      setServerPropertiesExists(true);
      setPropertiesInitializing(false);
      syncPropertyFormatDrafts(created.properties);
      setPropertiesSaved(true);
      setTimeout(() => setPropertiesSaved(false), 2000);
    } catch (err: any) {
      setActionError(err.message || "Failed to create server.properties");
    } finally {
      setActionLoading(null);
    }
  }, [id, setActionError, setActionLoading, syncPropertyFormatDrafts]);

  const handleServerIconUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (file.type !== "image/png") {
      setActionError("Server icon must be a PNG image.");
      return;
    }

    setActionError("");
    try {
      const iconFile = await resizeServerIcon(file);
      const previewUrl = URL.createObjectURL(iconFile);

      if (serverIconPreviewUrlRef.current) {
        URL.revokeObjectURL(serverIconPreviewUrlRef.current);
      }

      serverIconPreviewUrlRef.current = previewUrl;
      setPendingServerIconFile(iconFile);
      setPendingServerIconPreviewUrl(previewUrl);
      setServerIconUploadProgress(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to prepare server icon");
    }
  }, [setActionError]);

  const handleServerIconDrop = useCallback(async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setServerIconDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const inputEvent = {
      target: { files: [file], value: "" },
    } as unknown as ChangeEvent<HTMLInputElement>;

    await handleServerIconUpload(inputEvent);
  }, [handleServerIconUpload]);

  const discardLocalPropertyChanges = useCallback(() => {
    setProperties(propertiesBaselineRef.current);
    syncPropertyFormatDrafts(propertiesBaselineRef.current);
    clearPendingServerIcon();
  }, [clearPendingServerIcon, syncPropertyFormatDrafts]);

  const hasPendingServerIcon = pendingServerIconFile !== null;
  const propertiesBootstrapExpired =
    !serverPropertiesExists &&
    serverStatus === "running" &&
    !propertiesInitializing &&
    !!serverCreatedAt;
  const hasUnsavedProperties =
    JSON.stringify(normalizePropertiesForComparison(properties)) !==
    JSON.stringify(normalizePropertiesForComparison(propertiesBaselineRef.current));
  const canUndoPropertyChange = hasUnsavedProperties || hasPendingServerIcon;
  const serverIconUrl = pendingServerIconPreviewUrl || (id ? `${api.files.downloadUrl(id, "server-icon.png")}&v=${serverIconCacheBust}` : "");

  useEffect(() => {
    propertiesRef.current = properties;
  }, [properties]);

  useEffect(() => () => {
    if (serverIconPreviewUrlRef.current) {
      URL.revokeObjectURL(serverIconPreviewUrlRef.current);
      serverIconPreviewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!activePropertyCustomizer) {
      return;
    }

    const textarea = propertyTextareaRefs.current[activePropertyCustomizer];
    if (!textarea) {
      return;
    }

    window.requestAnimationFrame(() => {
      textarea.focus();
      const caretPosition = textarea.value.length;
      textarea.setSelectionRange(caretPosition, caretPosition);
    });
  }, [activePropertyCustomizer]);

  useEffect(() => {
    if (!activePropertyCustomizer) {
      return;
    }

    setPropertyPreviewAnimationFrame(0);

    const activeDraft = propertyFormatDrafts[activePropertyCustomizer] ?? "";
    if (!activeDraft.includes("\u00A7k")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setPropertyPreviewAnimationFrame((currentFrame) => currentFrame + 1);
    }, 140);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activePropertyCustomizer, propertyFormatDrafts]);

  useEffect(() => {
    if (activeTab !== "properties") return;

    if (serverStatus !== "running") {
      setPropertiesInitializing(false);
      setPropertiesLoaded(true);
      return;
    }

    void fetchProperties();
  }, [activeTab, fetchProperties, serverStatus]);

  useEffect(() => {
    if (
      activeTab !== "properties" ||
      serverStatus !== "running" ||
      serverPropertiesExists ||
      !propertiesInitializing
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchProperties();
    }, PROPERTY_BOOTSTRAP_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeTab, fetchProperties, propertiesInitializing, serverPropertiesExists, serverStatus]);

  useEffect(() => {
    if (!propertiesInitializing) {
      setPropertiesBootstrapRemainingMs(0);
      return;
    }

    const updateRemaining = () => {
      const deadline = getBootstrapDeadline(serverCreatedAt);
      if (deadline === null) {
        setPropertiesBootstrapRemainingMs(0);
        return;
      }

      setPropertiesBootstrapRemainingMs(Math.max(0, deadline - Date.now()));
    };

    updateRemaining();
    const intervalId = window.setInterval(updateRemaining, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [propertiesInitializing, serverCreatedAt]);

  return {
    properties,
    serverPropertiesExists,
    propertiesInitializing,
    propertiesBootstrapExpired,
    propertiesBootstrapRemainingMs,
    propertiesLoaded,
    propertiesSaved,
    showAdvancedProperties,
    setShowAdvancedProperties,
    propertyFormatDrafts,
    activePropertyCustomizer,
    setActivePropertyCustomizer,
    propertyPreviewBackground,
    setPropertyPreviewBackground,
    propertyPreviewAnimationFrame,
    serverIconDragActive,
    setServerIconDragActive,
    pendingServerIconFile,
    serverIconUploadProgress,
    propertyTextareaRefs,
    fetchProperties,
    handleSaveProperties,
    handleCreatePropertiesFile,
    setPropertyValue,
    setCustomizablePropertyValue,
    syncCustomizablePropertyDraftFromRaw,
    insertIntoCustomizableProperty,
    clearCustomizablePropertyFormatting,
    clearPendingServerIcon,
    handleUndoPropertyChange,
    handleServerIconUpload,
    handleServerIconDrop,
    uploadPendingServerIcon,
    discardLocalPropertyChanges,
    hasPendingServerIcon,
    hasUnsavedProperties,
    canUndoPropertyChange,
    serverIconUrl,
    refreshServerIconPreview,
  };
}
