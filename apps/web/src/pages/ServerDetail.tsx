import { useState, useEffect, useCallback, type ChangeEvent, type DragEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { ConsoleTabSection } from "@/components/server-detail/ConsoleTabSection";
import { BackupConfirmModal } from "@/components/server-detail/BackupConfirmModal";
import { DangerConfirmModal } from "@/components/server-detail/DangerConfirmModal";
import { FilesTabSection } from "@/components/server-detail/FilesTabSection";
import { ImageEditModal } from "@/components/server-detail/ImageEditModal";
import { PropertyCustomizerModal } from "@/components/server-detail/PropertyCustomizerModal";
import { ResourcePackConfirmModal } from "@/components/server-detail/ResourcePackConfirmModal";
import { ResourcePacksTabSection } from "@/components/server-detail/ResourcePacksTabSection";
import { ServerDetailShellSection } from "@/components/server-detail/ServerDetailShellSection";
import { SettingsTabSection } from "@/components/server-detail/SettingsTabSection";
import { PropertiesTabSection } from "@/components/server-detail/PropertiesTabSection";
import { formatPercent, getUsageTone } from "@/components/server-detail/server-metrics";
import { UnsavedChangesModal } from "@/components/server-detail/UnsavedChangesModal";
import { useServerDetailNavigation } from "@/components/server-detail/useServerDetailNavigation";
import { useServerProperties } from "@/components/server-detail/useServerProperties";
import { useServerBackups } from "@/components/server-detail/useServerBackups";
import { useResourcePacks } from "@/components/server-detail/useResourcePacks";
import { useServerSettings } from "@/components/server-detail/useServerSettings";
import {
    CUSTOMIZABLE_PROPERTY_KEYS,
    MINECRAFT_COLOR_TOKENS,
    MINECRAFT_STYLE_TOKENS,
    MINECRAFT_SYMBOL_TOKENS,
    PREVIEW_BACKGROUND_PRESETS,
    PROPERTY_DEFAULTS,
    PROPERTY_FIELDS,
    renderMinecraftPreviewSegments,
} from "@/components/server-detail/properties-config";
import {
    IMAGE_EDIT_SIZES,
    resizeResourcePackImage,
    resizeServerIcon,
    type ImageEditOptions,
    type ImageResizeMode,
} from "@/components/server-detail/resource-pack-utils";
import {
    type DangerConfirmState,
    type ServerDetailTab,
} from "@/components/server-detail/server-detail-types";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import {
    formatMemoryGb,
    MEMORY_MAX_MB,
    MEMORY_MIN_MB,
    MEMORY_STEP_MB,
    SERVER_TYPE_OPTIONS,
    SERVER_VERSION_OPTIONS,
} from "@/lib/serverFormOptions";

export function ServerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ServerDetailTab>("settings");
    const [serverStatus, setServerStatus] = useState<string | undefined>(undefined);
    const [serverCreatedAt, setServerCreatedAt] = useState<string | undefined>(undefined);

    // File editor
    const [editingFile, setEditingFile] = useState<string | null>(null);

    const [actionError, setActionError] = useState("");
    const [connectionCopied, setConnectionCopied] = useState(false);
    const [mobileHeaderOpen, setMobileHeaderOpen] = useState(false);
    const [imageEditState, setImageEditState] = useState<{
        file: File;
        target: "serverIcon" | "buildImage";
        buildTargetId?: string;
        title: string;
        confirmLabel: string;
        size: number;
        initialMode: ImageResizeMode;
    } | null>(null);
    const [imageEditApplying, setImageEditApplying] = useState(false);

    // Delete confirmation
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [recreateConfirmText, setRecreateConfirmText] = useState("");
    const [dangerConfirm, setDangerConfirm] = useState<DangerConfirmState>(null);

    const {
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
        applyPreparedServerIcon,
        setPropertyValue,
        setCustomizablePropertyValue,
        syncCustomizablePropertyDraftFromRaw,
        insertIntoCustomizableProperty,
        clearCustomizablePropertyFormatting,
        clearPendingServerIcon,
        handleUndoPropertyChange,
        uploadPendingServerIcon,
        discardLocalPropertyChanges,
        hasPendingServerIcon,
        hasUnsavedProperties,
        canUndoPropertyChange,
        serverIconUrl,
        serverIconExists,
        refreshServerIconPreview,
    } = useServerProperties({
        id,
        activeTab,
        serverStatus,
        serverCreatedAt,
        setActionError,
        setActionLoading,
    });

    const {
        server,
        loading,
        settings,
        settingsSaved,
        settingsError,
        restartNotice,
        connectionIp,
        fetchServer,
        handleSaveSettings,
        updateSettingsField,
        handleUndoSettingsChange,
        hasUnsavedSettings,
        canUndoSettingsChange,
        isDuplicatePort,
        settingsBaselineRef,
        setSettings,
    } = useServerSettings({
        id,
        navigate,
        memoryMinMb: MEMORY_MIN_MB,
        pendingServerIconFile,
        uploadPendingServerIcon,
        clearPendingServerIcon,
        setActionLoading,
    });

    const {
        backups,
        backupsLoaded,
        backupNotice,
        backupConfirm,
        setBackupConfirm,
        handleCreateBackup,
        handleConfirmBackupAction,
    } = useServerBackups({
        serverId: id,
        activeTab,
        fetchServer,
        fetchProperties,
        refreshServerIconPreview,
        setActionError,
        setActionLoading,
    });

    useEffect(() => {
        setServerStatus(server?.status);
        setServerCreatedAt(server?.createdAt);
    }, [server?.createdAt, server?.status]);

    const {
        resourcePacksLoaded,
        resourcePackBuilds,
        resourcePackNotice,
        resourcePackProgress,
        resourcePackConfirm,
        setResourcePackConfirm,
        resourcePackDragActive,
        resourcePackInputRef,
        resourcePackImageInputRef,
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
        allAvailablePacksSelected,
        fetchResourcePackData,
        handleUploadResourcePack,
        openResourcePackPicker,
        handleResourcePackDragEnter,
        handleResourcePackDragOver,
        handleResourcePackDragLeave,
        handleResourcePackDrop,
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
        handleAssignBuild,
        handleConfirmResourcePackAction,
        startEditingPack,
        cancelEditingPack,
        handleRenamePack,
        startEditingBuild,
        cancelEditingBuild,
        handleRenameBuild,
    } = useResourcePacks({
        serverId: id,
        serverName: server?.name,
        activeTab,
        fetchProperties,
        setActionError,
        setActionLoading,
    });

    useEffect(() => {
        if (!actionLoading && !imageEditState) {
            return;
        }

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [actionLoading, imageEditState]);

    const openImageEditor = useCallback((nextState: NonNullable<typeof imageEditState>) => {
        setActionError("");
        setImageEditState(nextState);
    }, []);

    const handleServerIconInputForEditor = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        if (file.type !== "image/png") {
            setActionError("Server icon must be a PNG image.");
            return;
        }

        openImageEditor({
            file,
            target: "serverIcon",
            title: "Edit Server Icon",
            confirmLabel: "Use Server Icon",
            size: IMAGE_EDIT_SIZES.serverIcon,
            initialMode: "contain",
        });
    }, [openImageEditor]);

    const handleServerIconDropForEditor = useCallback((event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setServerIconDragActive(false);

        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        if (file.type !== "image/png") {
            setActionError("Server icon must be a PNG image.");
            return;
        }

        openImageEditor({
            file,
            target: "serverIcon",
            title: "Edit Server Icon",
            confirmLabel: "Use Server Icon",
            size: IMAGE_EDIT_SIZES.serverIcon,
            initialMode: "contain",
        });
    }, [openImageEditor, setServerIconDragActive]);

    const handleBuildImageInputForEditor = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        const targetBuildId = consumeBuildImageSelectionTarget();

        if (!file || !targetBuildId) {
            return;
        }

        openImageEditor({
            file,
            target: "buildImage",
            buildTargetId: targetBuildId,
            title: targetBuildId === "__draft__" ? "Edit Build Image" : "Edit Merged Pack Image",
            confirmLabel: targetBuildId === "__draft__" ? "Use Build Image" : "Update Build Image",
            size: IMAGE_EDIT_SIZES.resourcePack,
            initialMode: "cover",
        });
    }, [consumeBuildImageSelectionTarget, openImageEditor]);

    const handleConfirmImageEdit = useCallback(async (options: ImageEditOptions) => {
        if (!imageEditState) return;

        setImageEditApplying(true);
        setActionError("");

        try {
            if (imageEditState.target === "serverIcon") {
                const resizedFile = await resizeServerIcon(imageEditState.file, options);
                applyPreparedServerIcon(resizedFile);
            } else if (imageEditState.buildTargetId) {
                const resizedFile = await resizeResourcePackImage(imageEditState.file, options);
                await applyPreparedBuildImage(resizedFile, imageEditState.buildTargetId);
            }

            setImageEditState(null);
        } catch (err: any) {
            setActionError(err.message || "Failed to prepare image");
        } finally {
            setImageEditApplying(false);
        }
    }, [applyPreparedBuildImage, applyPreparedServerIcon, imageEditState]);

    const handleAction = async (action: string, fn: () => Promise<any>) => {
        setActionError("");
        setActionLoading(action);
        try {
            await fn();
            await fetchServer();
        } catch (err: any) {
            setActionError(err.message || `Failed to ${action}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCopyConnection = async () => {
        try {
            await navigator.clipboard.writeText(connectionAddress);
            setConnectionCopied(true);
            window.setTimeout(() => setConnectionCopied(false), 1600);
        } catch {
            setActionError("Failed to copy connection address");
        }
    };

    const handleDelete = async () => {
        if (!id || deleteConfirmText !== server?.name) return;
        setActionError("");
        setActionLoading("delete");
        try {
            await api.servers.delete(id);
            navigate("/", { replace: true });
        } catch (err: any) {
            setActionError(err.message || "Failed to delete server");
        } finally {
            setActionLoading(null);
        }
    };

    const handleRecreate = async () => {
        if (!id || recreateConfirmText !== server?.name) return;
        setActionError("");
        setActionLoading("recreate");
        try {
            await api.servers.recreate(id);
            setRecreateConfirmText("");
            setDangerConfirm(null);
            await fetchServer();
        } catch (err: any) {
            setActionError(err.message || "Failed to recreate server");
        } finally {
            setActionLoading(null);
        }
    };

    const hasUnsavedChanges = hasUnsavedSettings || hasPendingServerIcon || hasUnsavedProperties;

    const {
        unsavedChangesConfirm,
        setUnsavedChangesConfirm,
        handleTabChange,
        handleBackNavigation,
        handleConfirmDiscardChanges,
    } = useServerDetailNavigation({
        activeTab,
        setActiveTab,
        hasUnsavedChanges,
        propertiesLoaded,
        resourcePacksLoaded,
        onDiscardChanges: () => {
            if (settingsBaselineRef.current) {
                setSettings(settingsBaselineRef.current);
            }
            discardLocalPropertyChanges();
        },
        onLeavePage: () => navigate("/"),
    });

    if (loading || !server) {
        return (
            <div className="min-h-screen">
                <LoadingOverlay mode="fixed" message="Loading server" />
            </div>
        );
    }

    const isRunning = server.status === "running";
    const propertiesSectionReady = server.status === "running";
    const connectionAddress = `${connectionIp}:${server.port}`;
    const cpuUsageTone = server.stats ? getUsageTone(server.stats.cpuPercent) : null;
    const memoryUsageTone = server.stats ? getUsageTone(server.stats.memoryPercent) : null;

    return (
        <div className="min-h-screen">
            {/* Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-600/8 rounded-full blur-[120px]" />
                <div className="absolute left-0 top-40 h-[360px] w-[360px] rounded-full bg-cyan-500/5 blur-[110px]" />
            </div>

            <ServerDetailShellSection
                server={server}
                connectionAddress={connectionAddress}
                connectionCopied={connectionCopied}
                mobileHeaderOpen={mobileHeaderOpen}
                setMobileHeaderOpen={setMobileHeaderOpen}
                handleBackNavigation={handleBackNavigation}
                handleCopyConnection={handleCopyConnection}
                isRunning={isRunning}
                actionLoading={actionLoading}
                onStart={() => void handleAction("start", () => api.servers.start(id!))}
                onRestart={() => void handleAction("restart", () => api.servers.restart(id!))}
                onStop={() => void handleAction("stop", () => api.servers.stop(id!))}
                formatPercent={formatPercent}
                cpuUsageTone={cpuUsageTone}
                memoryUsageTone={memoryUsageTone}
                activeTab={activeTab}
                onTabChange={handleTabChange}
            />

            <main className="page-shell relative mb-8">
                {actionLoading && (
                    <LoadingOverlay
                        mode="fixed"
                        message={actionLoading === "saveProps" ? "Saving properties" : `${actionLoading[0].toUpperCase()}${actionLoading.slice(1)} in progress`}
                    />
                )}
                {actionError && (
                    <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {actionError}
                    </div>
                )}
                {/* Settings Tab */}
                {activeTab === "settings" && (
                    <SettingsTabSection
                        settingsError={settingsError}
                        restartNotice={restartNotice}
                        hasUnsavedSettings={hasUnsavedSettings}
                        settings={settings}
                        lastAutoBackupAt={server.lastAutoBackupAt}
                        updateSettingsField={updateSettingsField}
                        serverTypeOptions={SERVER_TYPE_OPTIONS}
                        serverVersionOptions={SERVER_VERSION_OPTIONS}
                        isDuplicatePort={isDuplicatePort}
                        memoryMinMb={MEMORY_MIN_MB}
                        memoryMaxMb={MEMORY_MAX_MB}
                        memoryStepMb={MEMORY_STEP_MB}
                        formatMemoryGb={formatMemoryGb}
                        actionLoading={actionLoading}
                        canUndoSettingsChange={canUndoSettingsChange}
                        onUndoSettingsChange={handleUndoSettingsChange}
                        onSaveSettings={handleSaveSettings}
                        hasPendingServerIcon={hasPendingServerIcon}
                        settingsSaved={settingsSaved}
                        backupsLoaded={backupsLoaded}
                        backups={backups}
                        backupNotice={backupNotice}
                        getBackupDownloadUrl={(backupId) => api.servers.downloadBackupUrl(id!, backupId)}
                        onCreateBackup={handleCreateBackup}
                        onRequestRestoreBackup={(backup) => setBackupConfirm({ kind: "restore", backup })}
                        onRequestDeleteBackup={(backup) => setBackupConfirm({ kind: "delete", backup })}
                        onOpenDangerConfirm={(kind) => setDangerConfirm(kind)}
                    />
                )}

                {/* Properties Tab */}
                {activeTab === "properties" && (
                    <PropertiesTabSection
                        propertiesSectionReady={propertiesSectionReady}
                        propertiesInitializing={propertiesInitializing}
                        propertiesBootstrapExpired={propertiesBootstrapExpired}
                        propertiesBootstrapRemainingMs={propertiesBootstrapRemainingMs}
                        actionLoading={actionLoading}
                        canUndoPropertyChange={canUndoPropertyChange}
                        onUndoPropertyChange={handleUndoPropertyChange}
                        onSaveProperties={handleSaveProperties}
                        onCreatePropertiesFile={handleCreatePropertiesFile}
                        hasUnsavedProperties={hasUnsavedProperties}
                        hasPendingServerIcon={hasPendingServerIcon}
                        propertiesSaved={propertiesSaved}
                        serverPropertiesExists={serverPropertiesExists}
                        serverIconExists={serverIconExists}
                        serverIconUrl={serverIconUrl}
                        serverIconDragActive={serverIconDragActive}
                        onServerIconDragActiveChange={(isActive) => setServerIconDragActive(isActive)}
                        onServerIconDrop={handleServerIconDropForEditor}
                        onServerIconUpload={handleServerIconInputForEditor}
                        pendingServerIconFile={pendingServerIconFile}
                        serverIconUploadProgress={serverIconUploadProgress}
                        propertyFields={PROPERTY_FIELDS}
                        properties={properties}
                        propertyDefaults={PROPERTY_DEFAULTS}
                        customizablePropertyKeys={CUSTOMIZABLE_PROPERTY_KEYS}
                        propertyFormatDrafts={propertyFormatDrafts}
                        onCustomizablePropertyChange={(key, value) => setCustomizablePropertyValue(key, value)}
                        onPropertyValueChange={setPropertyValue}
                        onOpenCustomizer={(key) => setActivePropertyCustomizer(key)}
                        showAdvancedProperties={showAdvancedProperties}
                        onToggleAdvancedProperties={() => setShowAdvancedProperties((current) => !current)}
                        onRawCustomizablePropertySync={syncCustomizablePropertyDraftFromRaw}
                    />
                )}

                {activeTab === "resourcePacks" && (
                    <ResourcePacksTabSection
                        resourcePackDragActive={resourcePackDragActive}
                        onResourcePackDragEnter={handleResourcePackDragEnter}
                        onResourcePackDragOver={handleResourcePackDragOver}
                        onResourcePackDragLeave={handleResourcePackDragLeave}
                        onResourcePackDrop={handleResourcePackDrop}
                        fetchResourcePackData={fetchResourcePackData}
                        actionLoading={actionLoading}
                        openResourcePackPicker={() => openResourcePackPicker(actionLoading)}
                        resourcePackInputRef={resourcePackInputRef}
                        handleUploadResourcePack={handleUploadResourcePack}
                        resourcePackImageInputRef={resourcePackImageInputRef}
                        handleBuildImageSelected={handleBuildImageInputForEditor}
                        resourcePackNotice={resourcePackNotice}
                        resourcePackProgress={resourcePackProgress}
                        orderedAvailablePacks={orderedAvailablePacks}
                        selectedPackIds={selectedPackIds}
                        toggleSelectAllPacks={toggleSelectAllPacks}
                        allAvailablePacksSelected={allAvailablePacksSelected}
                        handleDeleteSelectedPacks={handleDeleteSelectedPacks}
                        setSelectedPackIds={(ids) => setSelectedPackIds(ids)}
                        editingPackId={editingPackId}
                        editingPackName={editingPackName}
                        setEditingPackName={(value) => setEditingPackName(value)}
                        draggedPackId={draggedPackId}
                        dragOverPackId={dragOverPackId}
                        handlePackPointerDown={handlePackPointerDown}
                        handlePackPointerEnter={handlePackPointerEnter}
                        handlePackPointerMove={handlePackPointerMove}
                        togglePackSelection={togglePackSelection}
                        handleRenamePack={handleRenamePack}
                        startEditingPack={startEditingPack}
                        cancelEditingPack={cancelEditingPack}
                        setDeletePackConfirm={(pack) => setResourcePackConfirm({ kind: "deletePack", pack })}
                        movePackInLibrary={movePackInLibrary}
                        buildName={buildName}
                        setBuildName={(value) => setBuildName(value)}
                        buildDescription={buildDescription}
                        setBuildDescription={(value) => setBuildDescription(value)}
                        serverName={server.name}
                        buildImagePreviewUrl={buildImagePreviewUrl}
                        buildImageFile={buildImageFile}
                        openDraftBuildImagePicker={() => openDraftBuildImagePicker(actionLoading)}
                        clearDraftBuildImage={clearDraftBuildImage}
                        handleBuildMergedPack={handleBuildMergedPack}
                        previewPackNames={previewPackNames}
                        previewConflicts={previewConflicts}
                        resourcePackBuilds={resourcePackBuilds}
                        editingBuildId={editingBuildId}
                        editingBuildName={editingBuildName}
                        setEditingBuildName={(value) => setEditingBuildName(value)}
                        editingBuildDescription={editingBuildDescription}
                        setEditingBuildDescription={(value) => setEditingBuildDescription(value)}
                        handleRenameBuild={handleRenameBuild}
                        startEditingBuild={startEditingBuild}
                        cancelEditingBuild={cancelEditingBuild}
                        openBuildImagePicker={(buildId) => openBuildImagePicker(buildId, actionLoading)}
                        handleAssignBuild={handleAssignBuild}
                        setDeleteBuildConfirm={(build) => setResourcePackConfirm({ kind: "deleteBuild", build })}
                    />
                )}

                {/* Files Tab */}
                {activeTab === "files" && (
                    <FilesTabSection
                        serverId={id!}
                        editingFile={editingFile}
                        onEditFile={(path) => setEditingFile(path)}
                        onCloseEditor={() => setEditingFile(null)}
                    />
                )}

                {/* Console Tab */}
                {activeTab === "console" && (
                    <ConsoleTabSection
                        serverId={id!}
                        isRunning={isRunning}
                    />
                )}

                {resourcePackConfirm && (
                    <ResourcePackConfirmModal
                        confirmState={resourcePackConfirm}
                        onCancel={() => setResourcePackConfirm(null)}
                        onConfirm={handleConfirmResourcePackAction}
                    />
                )}

                {imageEditState && (
                    <ImageEditModal
                        file={imageEditState.file}
                        title={imageEditState.title}
                        size={imageEditState.size}
                        confirmLabel={imageEditState.confirmLabel}
                        initialMode={imageEditState.initialMode}
                        saving={imageEditApplying}
                        onCancel={() => {
                            if (imageEditApplying) return;
                            setImageEditState(null);
                        }}
                        onConfirm={handleConfirmImageEdit}
                    />
                )}

                {activePropertyCustomizer && (
                    <PropertyCustomizerModal
                        activePropertyCustomizer={activePropertyCustomizer}
                        draftValue={propertyFormatDrafts[activePropertyCustomizer] ?? ""}
                        onClose={() => setActivePropertyCustomizer(null)}
                        onDraftChange={(value) => setCustomizablePropertyValue(activePropertyCustomizer, value)}
                        onInsertToken={(token) => insertIntoCustomizableProperty(activePropertyCustomizer, token)}
                        onClearAll={() => clearCustomizablePropertyFormatting(activePropertyCustomizer)}
                        propertyTextareaRefs={propertyTextareaRefs}
                        styleTokens={MINECRAFT_STYLE_TOKENS}
                        colorTokens={MINECRAFT_COLOR_TOKENS}
                        symbolTokens={MINECRAFT_SYMBOL_TOKENS}
                        previewBackgroundPresets={PREVIEW_BACKGROUND_PRESETS}
                        propertyPreviewBackground={propertyPreviewBackground}
                        onPreviewBackgroundChange={(backgroundId) => setPropertyPreviewBackground(
                            backgroundId as (typeof PREVIEW_BACKGROUND_PRESETS)[number]["id"]
                        )}
                        previewContent={renderMinecraftPreviewSegments(
                            propertyFormatDrafts[activePropertyCustomizer] ?? "",
                            propertyPreviewAnimationFrame
                        )}
                    />
                )}

                {dangerConfirm && (
                    <DangerConfirmModal
                        dangerConfirm={dangerConfirm}
                        serverName={server.name}
                        deleteConfirmText={deleteConfirmText}
                        recreateConfirmText={recreateConfirmText}
                        setDeleteConfirmText={setDeleteConfirmText}
                        setRecreateConfirmText={setRecreateConfirmText}
                        onCancel={() => {
                            setDangerConfirm(null);
                            setDeleteConfirmText("");
                            setRecreateConfirmText("");
                        }}
                        onConfirmDelete={handleDelete}
                        onConfirmRecreate={handleRecreate}
                        actionLoading={actionLoading}
                    />
                )}

                {backupConfirm && (
                    <BackupConfirmModal
                        confirmState={backupConfirm}
                        onCancel={() => setBackupConfirm(null)}
                        onConfirm={handleConfirmBackupAction}
                    />
                )}

                {unsavedChangesConfirm && (
                    <UnsavedChangesModal
                        kind={unsavedChangesConfirm.kind}
                        onStay={() => setUnsavedChangesConfirm(null)}
                        onDiscard={handleConfirmDiscardChanges}
                    />
                )}
            </main>
        </div>
    );
}
