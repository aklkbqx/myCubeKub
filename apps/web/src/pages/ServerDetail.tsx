import { type ChangeEvent, type DragEvent, useRef, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ApiError, api, type ResourcePackBuildInfo, type ResourcePackInfo, type ServerWithStatus, type UpdateServerData } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { FileBrowser } from "@/components/FileBrowser";
import { FileEditor } from "@/components/FileEditor";
import { Console } from "@/components/Console";
import SelectDropdown from "@/components/SelectDropdown";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { cn, formatBytes } from "@/lib/utils";
import {
    formatMemoryGb,
    MEMORY_MAX_MB,
    MEMORY_MIN_MB,
    MEMORY_STEP_MB,
    SERVER_TYPE_OPTIONS,
    SERVER_VERSION_OPTIONS,
} from "@/lib/serverFormOptions";
import {
    ArrowLeft, Play, Square, RotateCcw, Trash2, Save, RefreshCw,
    Cpu, MemoryStick, Settings, FileText, FolderOpen, Terminal, ImageIcon, Copy, Check,
    Layers3, Upload, WandSparkles, Link2, Pencil, ChevronUp, ChevronDown, X,
} from "lucide-react";

type PropertyField =
    | {
        key: string;
        label: string;
        description: string;
        type: "text" | "number" | "boolean";
        placeholder?: string;
    }
    | {
        key: string;
        label: string;
        description: string;
        type: "select";
        options: Array<{ value: string; label: string }>;
        placeholder?: string;
    };

const PROPERTY_FIELDS: PropertyField[] = [
    {
        key: "motd",
        label: "Server Message",
        description: "Message shown to players in the multiplayer server list.",
        type: "text",
        placeholder: "A Minecraft Server",
    },
    {
        key: "max-players",
        label: "Max Players",
        description: "Maximum number of players allowed online at the same time.",
        type: "number",
        placeholder: "20",
    },
    {
        key: "difficulty",
        label: "Difficulty",
        description: "Default world difficulty.",
        type: "select",
        options: [
            { value: "peaceful", label: "Peaceful" },
            { value: "easy", label: "Easy" },
            { value: "normal", label: "Normal" },
            { value: "hard", label: "Hard" },
        ],
    },
    {
        key: "gamemode",
        label: "Default Gamemode",
        description: "Default mode for newly joined players.",
        type: "select",
        options: [
            { value: "survival", label: "Survival" },
            { value: "creative", label: "Creative" },
            { value: "adventure", label: "Adventure" },
            { value: "spectator", label: "Spectator" },
        ],
    },
    {
        key: "pvp",
        label: "PVP",
        description: "Allow or block player-versus-player combat.",
        type: "boolean",
    },
    {
        key: "online-mode",
        label: "Online Mode",
        description: "Require Mojang or Microsoft account verification.",
        type: "boolean",
    },
    {
        key: "white-list",
        label: "Whitelist",
        description: "Only allow players listed in the whitelist.",
        type: "boolean",
    },
    {
        key: "hardcore",
        label: "Hardcore",
        description: "Enable hardcore rules for player deaths.",
        type: "boolean",
    },
    {
        key: "allow-flight",
        label: "Allow Flight",
        description: "Permit flight from clients or mods.",
        type: "boolean",
    },
    {
        key: "spawn-protection",
        label: "Spawn Protection",
        description: "Protected radius around spawn from block edits.",
        type: "number",
        placeholder: "16",
    },
    {
        key: "view-distance",
        label: "View Distance",
        description: "Chunk render distance sent to players.",
        type: "number",
        placeholder: "10",
    },
    {
        key: "simulation-distance",
        label: "Simulation Distance",
        description: "Chunk simulation distance that stays active.",
        type: "number",
        placeholder: "10",
    },
    {
        key: "resource-pack",
        label: "Resource Pack URL",
        description: "Direct download URL for the server resource pack zip file.",
        type: "text",
        placeholder: "https://cdn.example.com/resource-pack.zip",
    },
    {
        key: "resource-pack-sha1",
        label: "Resource Pack SHA1",
        description: "Optional SHA1 hash used by clients to validate the resource pack.",
        type: "text",
        placeholder: "0123456789abcdef0123456789abcdef01234567",
    },
    {
        key: "resource-pack-prompt",
        label: "Resource Pack Prompt",
        description: "Custom message shown before players download the resource pack.",
        type: "text",
        placeholder: "This server uses a custom resource pack.",
    },
    {
        key: "require-resource-pack",
        label: "Require Resource Pack",
        description: "Kick players who decline the server resource pack.",
        type: "boolean",
    },
] as const;

const PROPERTY_DEFAULTS: Record<string, string> = {
    motd: "A Minecraft Server",
    "max-players": "20",
    difficulty: "easy",
    gamemode: "survival",
    pvp: "true",
    "online-mode": "true",
    "white-list": "false",
    hardcore: "false",
    "allow-flight": "false",
    "spawn-protection": "16",
    "view-distance": "10",
    "simulation-distance": "10",
    "resource-pack": "",
    "resource-pack-sha1": "",
    "resource-pack-prompt": "",
    "require-resource-pack": "false",
};

function formatPercent(value: number) {
    return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

function getUsageTone(percent: number) {
    if (percent >= 85) {
        return {
            label: "High",
            textClassName: "text-red-300",
            fillClassName: "bg-red-400",
        };
    }

    if (percent >= 60) {
        return {
            label: "Moderate",
            textClassName: "text-amber-300",
            fillClassName: "bg-amber-400",
        };
    }

    return {
        label: "Low",
        textClassName: "text-emerald-300",
        fillClassName: "bg-emerald-400",
    };
}

type PendingResourcePack = {
    id: string;
    name: string;
    originalFilename: string;
    sizeBytes: number;
    file: File;
    kind: "pending";
};

type AvailableResourcePack = (ResourcePackInfo & { kind: "stored" }) | PendingResourcePack;

type ResourcePackConfirmState =
    | { kind: "deleteSelectedPacks"; packIds: string[] }
    | { kind: "deletePack"; pack: AvailableResourcePack }
    | { kind: "deleteBuild"; build: ResourcePackBuildInfo };

type DangerConfirmState = "delete" | "recreate" | null;
type ServerDetailTab = "settings" | "properties" | "resourcePacks" | "files" | "console";
type UnsavedChangesState =
    | { kind: "tab"; nextTab: ServerDetailTab }
    | { kind: "leave" }
    | null;

function normalizeSettingsForComparison(settings: UpdateServerData) {
    return {
        name: settings.name ?? "",
        port: settings.port ?? 25565,
        version: settings.version ?? "",
        type: settings.type ?? "",
        memoryMb: settings.memoryMb ?? MEMORY_MIN_MB,
    };
}

function normalizePropertiesForComparison(properties: Record<string, string>) {
    return Object.keys(properties)
        .sort()
        .reduce<Record<string, string>>((result, key) => {
            result[key] = properties[key] ?? "";
            return result;
        }, {});
}

export function ServerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [server, setServer] = useState<ServerWithStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ServerDetailTab>("settings");

    // File editor
    const [editingFile, setEditingFile] = useState<string | null>(null);

    // Settings form
    const [settings, setSettings] = useState<UpdateServerData>({});
    const [settingsSaved, setSettingsSaved] = useState(false);
    const [settingsError, setSettingsError] = useState("");
    const [actionError, setActionError] = useState("");
    const [restartNotice, setRestartNotice] = useState("");
    const [usedPorts, setUsedPorts] = useState<number[]>([]);
    const [connectionIp, setConnectionIp] = useState("localhost");
    const [connectionCopied, setConnectionCopied] = useState(false);
    const [mobileHeaderOpen, setMobileHeaderOpen] = useState(false);

    // Properties
    const [properties, setProperties] = useState<Record<string, string>>({});
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);
    const [propertiesSaved, setPropertiesSaved] = useState(false);
    const [showAdvancedProperties, setShowAdvancedProperties] = useState(false);
    const [serverIconDragActive, setServerIconDragActive] = useState(false);
    const [serverIconCacheBust, setServerIconCacheBust] = useState(0);
    const [resourcePacks, setResourcePacks] = useState<ResourcePackInfo[]>([]);
    const [resourcePackBuilds, setResourcePackBuilds] = useState<ResourcePackBuildInfo[]>([]);
    const [resourcePacksLoaded, setResourcePacksLoaded] = useState(false);
    const [pendingResourcePacks, setPendingResourcePacks] = useState<PendingResourcePack[]>([]);
    const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
    const [editingPackId, setEditingPackId] = useState<string | null>(null);
    const [editingPackName, setEditingPackName] = useState("");
    const [editingBuildId, setEditingBuildId] = useState<string | null>(null);
    const [editingBuildName, setEditingBuildName] = useState("");
    const [packOrderIds, setPackOrderIds] = useState<string[]>([]);
    const [buildName, setBuildName] = useState("");
    const [previewConflicts, setPreviewConflicts] = useState<string[]>([]);
    const [previewPackNames, setPreviewPackNames] = useState<string[]>([]);
    const [resourcePackNotice, setResourcePackNotice] = useState("");
    const [resourcePackProgress, setResourcePackProgress] = useState<{ label: string; percent: number } | null>(null);
    const [resourcePackConfirm, setResourcePackConfirm] = useState<ResourcePackConfirmState | null>(null);
    const [resourcePackDragActive, setResourcePackDragActive] = useState(false);
    const [draggedPackId, setDraggedPackId] = useState<string | null>(null);
    const [dragOverPackId, setDragOverPackId] = useState<string | null>(null);
    const resourcePackInputRef = useRef<HTMLInputElement | null>(null);
    const resourcePackDragDepthRef = useRef(0);
    const tabScrollPositionsRef = useRef<Record<"settings" | "properties" | "resourcePacks" | "files" | "console", number>>({
        settings: 0,
        properties: 0,
        resourcePacks: 0,
        files: 0,
        console: 0,
    });
    const pendingScrollRestoreRef = useRef<"settings" | "properties" | "resourcePacks" | "files" | "console" | null>(null);

    // Delete confirmation
    const [deleteConfirmText, setDeleteConfirmText] = useState("");
    const [recreateConfirmText, setRecreateConfirmText] = useState("");
    const [dangerConfirm, setDangerConfirm] = useState<DangerConfirmState>(null);
    const [unsavedChangesConfirm, setUnsavedChangesConfirm] = useState<UnsavedChangesState>(null);
    const settingsBaselineRef = useRef<UpdateServerData | null>(null);
    const propertiesBaselineRef = useRef<Record<string, string>>({});
    const settingsRef = useRef<UpdateServerData>({});
    const propertiesRef = useRef<Record<string, string>>({});

    const fetchServer = useCallback(async () => {
        if (!id) return;
        try {
            const { server } = await api.servers.get(id);
            const nextSettings: UpdateServerData = {
                name: server.name,
                port: server.port,
                version: server.version,
                type: server.type,
                memoryMb: server.memoryMb,
            };

            setServer(server);
            const hasLocalUnsavedSettings =
                settingsBaselineRef.current !== null &&
                JSON.stringify(normalizeSettingsForComparison(settingsRef.current)) !==
                JSON.stringify(normalizeSettingsForComparison(settingsBaselineRef.current));

            settingsBaselineRef.current = nextSettings;

            if (!hasLocalUnsavedSettings) {
                setSettings(nextSettings);
            }
        } catch {
            navigate("/", { replace: true });
        }
    }, [id, navigate]);

    const fetchUsedPorts = useCallback(async () => {
        if (!id) return;
        try {
            const { servers } = await api.servers.list();
            setUsedPorts(servers.filter((server) => server.id !== id).map((server) => server.port));
        } catch {
            setUsedPorts([]);
        }
    }, [id]);

    const fetchProperties = useCallback(async () => {
        if (!id) return;
        setPropertiesLoaded(false);
        try {
            const { properties } = await api.servers.getProperties(id);
            const hasLocalUnsavedProperties =
                JSON.stringify(normalizePropertiesForComparison(propertiesRef.current)) !==
                JSON.stringify(normalizePropertiesForComparison(propertiesBaselineRef.current));

            propertiesBaselineRef.current = properties;

            if (!hasLocalUnsavedProperties) {
                setProperties(properties);
            }
        } catch {
            setProperties({});
            propertiesBaselineRef.current = {};
        } finally {
            setPropertiesLoaded(true);
        }
    }, [id]);

    const fetchConfig = useCallback(async () => {
        try {
            const { connectionIp } = await api.config();
            setConnectionIp(connectionIp || "localhost");
        } catch {
            setConnectionIp("localhost");
        }
    }, []);

    const fetchResourcePackData = useCallback(async () => {
        if (!id) return;
        setResourcePacksLoaded(false);
        try {
            const [{ packs }, { builds }] = await Promise.all([
                api.resourcePacks.list(id),
                api.resourcePacks.listBuilds(id),
            ]);
            setResourcePacks(packs);
            setResourcePackBuilds(builds);
        } catch (err: any) {
            setResourcePacks([]);
            setResourcePackBuilds([]);
            setActionError(err.message || "Failed to load resource pack library");
        } finally {
            setResourcePacksLoaded(true);
        }
    }, [id]);

    const restoreTabScrollPosition = useCallback((tab: "settings" | "properties" | "resourcePacks" | "files" | "console") => {
        const top = tabScrollPositionsRef.current[tab] ?? 0;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                window.scrollTo({ top, behavior: "auto" });
            });
        });
    }, []);

    const handleTabChange = (nextTab: ServerDetailTab) => {
        if (nextTab === activeTab) return;
        if (hasUnsavedChanges) {
            setUnsavedChangesConfirm({ kind: "tab", nextTab });
            return;
        }
        tabScrollPositionsRef.current[activeTab] = window.scrollY;
        pendingScrollRestoreRef.current = nextTab;
        setActiveTab(nextTab);
    };

    const continueTabChange = (nextTab: ServerDetailTab) => {
        tabScrollPositionsRef.current[activeTab] = window.scrollY;
        pendingScrollRestoreRef.current = nextTab;
        setActiveTab(nextTab);
    };

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            await Promise.all([fetchServer(), fetchUsedPorts(), fetchConfig()]);
            setLoading(false);
        };
        init();
        const interval = setInterval(() => {
            void Promise.all([fetchServer(), fetchUsedPorts()]);
        }, 10_000);
        return () => clearInterval(interval);
    }, [fetchConfig, fetchServer, fetchUsedPorts]);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    useEffect(() => {
        propertiesRef.current = properties;
    }, [properties]);

    useEffect(() => {
        if (activeTab !== "properties") return;

        void fetchProperties();

        if (server?.status !== "running") return;

        const interval = setInterval(() => {
            void fetchProperties();
        }, 5_000);

        return () => clearInterval(interval);
    }, [activeTab, fetchProperties, server?.status]);

    useEffect(() => {
        if (activeTab !== "resourcePacks") return;
        void fetchResourcePackData();
    }, [activeTab, fetchResourcePackData]);

    useEffect(() => {
        const handleScroll = () => {
            tabScrollPositionsRef.current[activeTab] = window.scrollY;
        };

        handleScroll();
        window.addEventListener("scroll", handleScroll, { passive: true });

        return () => {
            window.removeEventListener("scroll", handleScroll);
        };
    }, [activeTab]);

    useEffect(() => {
        if (pendingScrollRestoreRef.current !== activeTab) return;

        const ready =
            activeTab === "properties"
                ? propertiesLoaded
                : activeTab === "resourcePacks"
                    ? resourcePacksLoaded
                    : true;

        if (!ready) return;

        restoreTabScrollPosition(activeTab);
        pendingScrollRestoreRef.current = null;
    }, [activeTab, propertiesLoaded, resourcePacksLoaded, restoreTabScrollPosition]);

    useEffect(() => {
        setPackOrderIds((current) => {
            const availablePackIds = [
                ...resourcePacks.map((pack) => pack.id),
                ...pendingResourcePacks.map((pack) => pack.id),
            ];
            const validCurrent = current.filter((packId) => availablePackIds.includes(packId));
            const missingIds = availablePackIds
                .filter((packId) => !validCurrent.includes(packId));

            return [...validCurrent, ...missingIds];
        });
    }, [pendingResourcePacks, resourcePacks]);

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

    const handleSaveSettings = async () => {
        if (!id) return;
        setSettingsError("");
        setRestartNotice("");
        setActionLoading("save");
        try {
            const res = await api.servers.update(id, settings);
            settingsBaselineRef.current = settings;
            setSettingsSaved(true);
            setTimeout(() => setSettingsSaved(false), 2000);
            if (res.restartRequired && server?.status === "running") {
                setRestartNotice("Settings saved. Restart the server to apply port, memory, version, or type changes.");
            }
            await Promise.all([fetchServer(), fetchUsedPorts()]);
        } catch (err: any) {
            setSettingsError(err.message || "Failed to save settings");
        } finally {
            setActionLoading(null);
        }
    };

    const updateSettingsField = <K extends keyof UpdateServerData>(key: K, value: NonNullable<UpdateServerData[K]>) => {
        setSettings((current) => {
            if (current[key] === value) {
                return current;
            }

            return {
                ...current,
                [key]: value,
            };
        });
    };

    const handleUndoSettingsChange = () => {
        if (!settingsBaselineRef.current) return;
        setSettings(settingsBaselineRef.current);
    };

    const handleSaveProperties = async () => {
        if (!id) return;
        setActionError("");
        setActionLoading("saveProps");
        try {
            await api.servers.updateProperties(id, properties);
            propertiesBaselineRef.current = properties;
            setPropertiesSaved(true);
            setTimeout(() => setPropertiesSaved(false), 2000);
        } catch (err: any) {
            setActionError(err.message || "Failed to save properties");
        } finally {
            setActionLoading(null);
        }
    };

    const setPropertyValue = (key: string, value: string) => {
        setProperties((current) => {
            if ((current[key] ?? "") === value) {
                return current;
            }

            return {
                ...current,
                [key]: value,
            };
        });
    };

    const handleUndoPropertyChange = () => {
        setProperties(propertiesBaselineRef.current);
    };

    const handleServerIconUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        if (!id) return;

        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) return;

        if (file.type !== "image/png") {
            setActionError("Server icon must be a PNG image.");
            return;
        }

        setActionError("");
        setActionLoading("uploadIcon");
        try {
            const iconFile = await resizeServerIcon(file);
            await api.files.upload(id, iconFile);
            setServerIconCacheBust(Date.now());
        } catch (err: any) {
            setActionError(err.message || "Failed to upload server icon");
        } finally {
            setActionLoading(null);
        }
    };

    const resizeServerIcon = useCallback(async (file: File) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Failed to read server icon"));
            reader.readAsDataURL(file);
        });

        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to load server icon"));
            img.src = dataUrl;
        });

        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas is not available in this browser");
        }

        context.clearRect(0, 0, 64, 64);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, 64, 64);

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((nextBlob) => {
                if (!nextBlob) {
                    reject(new Error("Failed to encode resized server icon"));
                    return;
                }
                resolve(nextBlob);
            }, "image/png");
        });

        return new File([blob], "server-icon.png", { type: "image/png" });
    }, []);

    const handleServerIconDrop = async (event: DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setServerIconDragActive(false);

        const file = event.dataTransfer.files?.[0];
        if (!file) return;

        const inputEvent = {
            target: { files: [file], value: "" },
        } as unknown as ChangeEvent<HTMLInputElement>;

        await handleServerIconUpload(inputEvent);
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

    const togglePackSelection = (packId: string) => {
        setPreviewConflicts([]);
        setPreviewPackNames([]);
        setSelectedPackIds((current) =>
            current.includes(packId)
                ? current.filter((id) => id !== packId)
                : [...current, packId]
        );
    };

    const movePackInLibrary = (packId: string, direction: "up" | "down") => {
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
    };

    const movePackToPosition = (packId: string, targetPackId: string) => {
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
    };

    const handlePackPointerDown = (packId: string) => {
        setDraggedPackId(packId);
        setDragOverPackId(packId);
    };

    const handlePackPointerEnter = (packId: string) => {
        if (!draggedPackId || draggedPackId === packId) return;
        movePackToPosition(draggedPackId, packId);
        setDragOverPackId(packId);
    };

    const handlePackPointerRelease = () => {
        setDraggedPackId(null);
        setDragOverPackId(null);
    };

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
    }, [draggedPackId]);

    const handleDeleteSelectedPacks = async () => {
        if (selectedPackIds.length === 0) return;
        setResourcePackConfirm({
            kind: "deleteSelectedPacks",
            packIds: [...selectedPackIds],
        });
    };

    const executeDeleteSelectedPacks = async (packIds: string[]) => {
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

            setPendingResourcePacks((current) => current.filter((pack) => !removablePackIds.has(pack.id)));
            setSelectedPackIds((current) => current.filter((selectedId) => !removablePackIds.has(selectedId)));
            setPackOrderIds((current) =>
                current.filter((currentId) => !removablePackIds.has(currentId))
            );
            setPreviewConflicts([]);
            setPreviewPackNames([]);
            await fetchResourcePackData();

            const deletedCount = removablePackIds.size;
            if (deletedCount > 0 && lockedPackNames.length === 0) {
                setResourcePackNotice(
                    `Deleted ${deletedCount} resource pack${deletedCount > 1 ? "s" : ""}.`
                );
                return;
            }

            if (deletedCount > 0) {
                setResourcePackNotice(
                    `Deleted ${deletedCount} resource pack${deletedCount > 1 ? "s" : ""}. ${lockedPackNames.length} still in use by existing build${lockedPackNames.length > 1 ? "s" : ""}.`
                );
                setActionError(
                    `Delete blocked for: ${lockedPackNames.join(", ")}. Delete the related merged build first.`
                );
                return;
            }

            setActionError(
                `Delete blocked for: ${lockedPackNames.join(", ")}. Delete the related merged build first.`
            );
        } catch (err: any) {
            setActionError(err.message || "Failed to delete selected resource packs");
        } finally {
            setActionLoading(null);
        }
    };

    const queueResourcePackFiles = useCallback((fileList: FileList | File[]) => {
        const uploadableFiles = Array.from(fileList).filter((file) => file.name.toLowerCase().endsWith(".zip"));
        if (uploadableFiles.length === 0) {
            throw new Error("Only .zip resource packs are supported");
        }

        setActionError("");
        setResourcePackNotice("");
        setPendingResourcePacks((current) => [
            ...current,
            ...uploadableFiles.map((file) => ({
                id: `pending:${crypto.randomUUID()}`,
                name: file.name.replace(/\.zip$/i, ""),
                originalFilename: file.name,
                sizeBytes: file.size,
                file,
                kind: "pending" as const,
            })),
        ]);
        setResourcePackNotice(
            `${uploadableFiles.length} resource pack${uploadableFiles.length > 1 ? "s added." : " added."}`
        );
    }, []);

    const handleUploadResourcePack = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files?.length) return;

        const selectedFiles = Array.from(files);
        event.target.value = "";

        queueResourcePackFiles(selectedFiles);
    };

    const openResourcePackPicker = () => {
        const input = resourcePackInputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (!input || actionLoading !== null) return;

        if (typeof input.showPicker === "function") {
            input.showPicker();
            return;
        }

        input.click();
    };

    const handleResourcePackDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resourcePackDragDepthRef.current += 1;
        setResourcePackDragActive(true);
    };

    const handleResourcePackDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (!resourcePackDragActive) {
            setResourcePackDragActive(true);
        }
    };

    const handleResourcePackDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resourcePackDragDepthRef.current = Math.max(0, resourcePackDragDepthRef.current - 1);
        if (resourcePackDragDepthRef.current === 0) {
            setResourcePackDragActive(false);
        }
    };

    const handleResourcePackDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        resourcePackDragDepthRef.current = 0;
        setResourcePackDragActive(false);

        const files = event.dataTransfer.files;
        if (!files?.length) return;

        queueResourcePackFiles(files);
    };

    const handleBuildMergedPack = async () => {
        if (!id || !server) return;

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
                        id,
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
            const name = buildName.trim() || `${server.name}-resource-pack`;
            setResourcePackProgress({
                label: "Building merged resource pack",
                percent: orderedPendingResourcePacks.length > 0 ? 99 : 50,
            });
            const buildPackIds = orderedAvailablePacks.map((pack) =>
                pack.kind === "stored" ? pack.id : uploadedPackByPendingId.get(pack.id)!.id
            );
            const { build, conflicts } = await api.resourcePacks.build(id, name, buildPackIds);
            setBuildName(build.name);
            setPreviewConflicts(conflicts);
            setPreviewPackNames(orderedAvailablePacks.map((pack) => pack.name));
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
    };

    const handleAssignBuild = async (buildId: string) => {
        if (!id) return;

        setActionError("");
        setActionLoading("assignPack");
        try {
            await api.resourcePacks.assignToServer(buildId, id, {});
            await fetchResourcePackData();
        } catch (err: any) {
            setActionError(err.message || "Failed to assign merged resource pack");
        } finally {
            setActionLoading(null);
        }
    };

    const executeDeletePack = async (pack: AvailableResourcePack) => {
        setActionError("");
        setResourcePackNotice("");
        setActionLoading("deletePack");
        try {
            if (pack.kind === "stored") {
                await api.resourcePacks.delete(pack.id);
                await fetchResourcePackData();
            } else {
                setPendingResourcePacks((current) => current.filter((item) => item.id !== pack.id));
            }
            setSelectedPackIds((current) => current.filter((id) => id !== pack.id));
            setPackOrderIds((current) => current.filter((id) => id !== pack.id));
            setPreviewConflicts([]);
            setPreviewPackNames([]);
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
    };

    const executeDeleteBuild = async (build: ResourcePackBuildInfo) => {
        setActionError("");
        setResourcePackNotice("");
        setActionLoading("deleteBuild");
        try {
            await api.resourcePacks.deleteBuild(id!, build.id);
            await fetchResourcePackData();
            setResourcePackNotice(`Deleted merged build "${build.name}".`);
        } catch (err: any) {
            setActionError(err.message || "Failed to delete merged resource pack");
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmResourcePackAction = async () => {
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
    };

    const startEditingPack = (pack: AvailableResourcePack) => {
        setEditingPackId(pack.id);
        setEditingPackName(pack.name);
    };

    const cancelEditingPack = () => {
        setEditingPackId(null);
        setEditingPackName("");
    };

    const handleRenamePack = async (pack: AvailableResourcePack) => {
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
    };

    const handleRenameBuild = async (build: ResourcePackBuildInfo) => {
        const nextName = editingBuildName.trim();
        if (!nextName) return;
        if (nextName === build.name) {
            cancelEditingBuild();
            return;
        }

        setActionError("");
        setActionLoading("renameBuild");
        try {
            await api.resourcePacks.renameBuild(id!, build.id, nextName);
            await fetchResourcePackData();
            cancelEditingBuild();
        } catch (err: any) {
            setActionError(err.message || "Failed to rename merged build");
        } finally {
            setActionLoading(null);
        }
    };

    const startEditingBuild = (build: ResourcePackBuildInfo) => {
        setEditingBuildId(build.id);
        setEditingBuildName(build.name);
    };

    const cancelEditingBuild = () => {
        setEditingBuildId(null);
        setEditingBuildName("");
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

    const hasUnsavedSettings =
        settingsBaselineRef.current !== null &&
        JSON.stringify(normalizeSettingsForComparison(settings)) !==
        JSON.stringify(normalizeSettingsForComparison(settingsBaselineRef.current));
    const hasUnsavedProperties =
        JSON.stringify(normalizePropertiesForComparison(properties)) !==
        JSON.stringify(normalizePropertiesForComparison(propertiesBaselineRef.current));
    const hasUnsavedChanges = hasUnsavedSettings || hasUnsavedProperties;
    const canUndoSettingsChange = hasUnsavedSettings;
    const canUndoPropertyChange = hasUnsavedProperties;

    useEffect(() => {
        if (!hasUnsavedChanges) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const handleBackNavigation = () => {
        if (hasUnsavedChanges) {
            setUnsavedChangesConfirm({ kind: "leave" });
            return;
        }
        navigate("/");
    };

    const handleConfirmDiscardChanges = () => {
        const confirmState = unsavedChangesConfirm;
        setUnsavedChangesConfirm(null);
        if (!confirmState) return;

        if (settingsBaselineRef.current) {
            setSettings(settingsBaselineRef.current);
        }
        setProperties(propertiesBaselineRef.current);

        if (confirmState.kind === "tab") {
            continueTabChange(confirmState.nextTab);
            return;
        }

        navigate("/");
    };

    if (loading || !server) {
        return (
            <div className="min-h-screen">
                <LoadingOverlay mode="fixed" message="Loading server" />
            </div>
        );
    }

    const isRunning = server.status === "running";
    const isDuplicatePort = settings.port !== undefined && usedPorts.includes(settings.port);
    const connectionAddress = `${connectionIp}:${server.port}`;
    const cpuUsageTone = server.stats ? getUsageTone(server.stats.cpuPercent) : null;
    const memoryUsageTone = server.stats ? getUsageTone(server.stats.memoryPercent) : null;
    const serverIconUrl = id ? `${api.files.downloadUrl(id, "server-icon.png")}&v=${serverIconCacheBust}` : "";
    const availableResourcePackEntries: Array<readonly [string, AvailableResourcePack]> = [
        ...resourcePacks.map((pack) => [pack.id, { ...pack, kind: "stored" as const }] as const),
        ...pendingResourcePacks.map((pack) => [pack.id, pack] as const),
    ];
    const availableResourcePackById = new Map<string, AvailableResourcePack>(availableResourcePackEntries);
    const orderedAvailablePacks = packOrderIds
        .map((packId) => availableResourcePackById.get(packId))
        .filter((pack): pack is AvailableResourcePack => Boolean(pack));
    const orderedPendingResourcePacks = orderedAvailablePacks.filter(
        (pack): pack is PendingResourcePack => pack.kind === "pending"
    );
    const orderedResourcePackIds = orderedAvailablePacks.map((pack) => pack.id);
    const allAvailablePacksSelected = orderedAvailablePacks.length > 0 && selectedPackIds.length === orderedAvailablePacks.length;

    const toggleSelectAllPacks = () => {
        setSelectedPackIds((current) =>
            current.length === orderedAvailablePacks.length ? [] : orderedAvailablePacks.map((pack) => pack.id)
        );
    };

    return (
        <div className="min-h-screen">
            {/* Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-600/8 rounded-full blur-[120px]" />
                <div className="absolute left-0 top-40 h-[360px] w-[360px] rounded-full bg-cyan-500/5 blur-[110px]" />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-surface-800/80 bg-surface-950/85 backdrop-blur-2xl">
                <div className="page-shell">
                    <div className="grid gap-4 py-3 sm:py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                            <button
                                onClick={handleBackNavigation}
                                className="btn-icon mt-1 border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-200"
                                aria-label="Back to dashboard"
                            >
                                <ArrowLeft size={20} />
                            </button>

                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                <div className="hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10 text-brand-300 shadow-lg shadow-brand-900/15 sm:flex">
                                    <img
                                        src="/favicon.svg"
                                        alt="myCubeKub"
                                        className="h-7 w-7"
                                    />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                        <div className="min-w-0">
                                            <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/75">Server Workspace</p>
                                            <h1 className="truncate text-xl font-bold leading-tight text-surface-50 sm:text-3xl">{server.name}</h1>
                                        </div>

                                        <div className="max-w-full items-center gap-2 rounded-xl border border-brand-500/15 bg-brand-500/8 px-3 py-2 text-xs sm:text-sm hidden md:inline-flex">
                                            <span className="text-surface-500">Address</span>
                                            <span className="min-w-0 truncate font-mono text-brand-200">
                                                {connectionAddress}
                                            </span>
                                        </div>
                                        <StatusBadge status={server.status} className="shrink-0 hidden md:block" />
                                    </div>

                                    <div className="mt-2 hidden md:flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-surface-400 sm:gap-x-3 sm:text-sm">
                                        <span>{server.type}</span>
                                        <span className="text-surface-600">•</span>
                                        <span>Version {server.version}</span>
                                        <span className="text-surface-600">•</span>
                                        <span>{Math.round(server.memoryMb / 1024)} GB RAM</span>

                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                            <div className="relative sm:hidden">
                                <button
                                    type="button"
                                    onClick={() => setMobileHeaderOpen((current) => !current)}
                                    className="btn-secondary inline-flex min-h-[44px] w-full items-center justify-center gap-2 text-sm"
                                >
                                    Manage Server
                                    <ChevronDown size={16} className={`transition-transform ${mobileHeaderOpen ? "rotate-180" : ""}`} />
                                </button>

                                {mobileHeaderOpen && (
                                    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-surface-700/70 bg-surface-900/95 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
                                        <div className="rounded-xl border border-surface-700/60 bg-surface-950/60 px-3 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] uppercase tracking-[0.22em] text-surface-500">Status</span>
                                                <StatusBadge status={server.status} />
                                            </div>
                                            <div className="mt-3 text-xs text-surface-400">
                                                <div>{server.type} · Version {server.version}</div>
                                                <div className="mt-1">{Math.round(server.memoryMb / 1024)} GB RAM</div>
                                                <div className="mt-2 truncate font-mono text-brand-200">{connectionAddress}</div>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void handleCopyConnection();
                                                    setMobileHeaderOpen(false);
                                                }}
                                                className="btn-secondary inline-flex min-h-[42px] items-center justify-center gap-2 text-sm"
                                            >
                                                {connectionCopied ? <Check size={14} /> : <Copy size={14} />}
                                                {connectionCopied ? "Address Copied" : "Copy Address"}
                                            </button>

                                            {!isRunning ? (
                                                <button
                                                    onClick={() => {
                                                        void handleAction("start", () => api.servers.start(id!));
                                                        setMobileHeaderOpen(false);
                                                    }}
                                                    disabled={actionLoading !== null}
                                                    className="btn-primary inline-flex min-h-[42px] items-center justify-center gap-2 text-sm"
                                                >
                                                    <Play size={14} />
                                                    Start Server
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            void handleAction("restart", () => api.servers.restart(id!));
                                                            setMobileHeaderOpen(false);
                                                        }}
                                                        disabled={actionLoading !== null}
                                                        className="btn-secondary inline-flex min-h-[42px] items-center justify-center gap-2 text-sm"
                                                    >
                                                        <RotateCcw size={14} />
                                                        Restart
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            void handleAction("stop", () => api.servers.stop(id!));
                                                            setMobileHeaderOpen(false);
                                                        }}
                                                        disabled={actionLoading !== null}
                                                        className="btn-danger inline-flex min-h-[42px] items-center justify-center gap-2 text-sm"
                                                    >
                                                        <Square size={14} />
                                                        Stop Server
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyConnection}
                                className="hidden btn-secondary min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex"
                            >
                                {connectionCopied ? <Check size={14} /> : <Copy size={14} />}
                                {connectionCopied ? "Address Copied" : "Copy Address"}
                            </button>

                            {!isRunning ? (
                                <button
                                    onClick={() => handleAction("start", () => api.servers.start(id!))}
                                    disabled={actionLoading !== null}
                                    className="hidden btn-primary min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex"
                                >
                                    <Play size={14} />
                                    Start Server
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleAction("restart", () => api.servers.restart(id!))}
                                        disabled={actionLoading !== null}
                                        className="hidden btn-secondary min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex"
                                    >
                                        <RotateCcw size={14} />
                                        Restart
                                    </button>
                                    <button
                                        onClick={() => handleAction("stop", () => api.servers.stop(id!))}
                                        disabled={actionLoading !== null}
                                        className="hidden btn-danger min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex"
                                    >
                                        <Square size={14} />
                                        Stop Server
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            <main className="page-shell relative py-8">
                {actionLoading && (
                    <LoadingOverlay
                        message={actionLoading === "saveProps" ? "Saving properties" : `${actionLoading[0].toUpperCase()}${actionLoading.slice(1)} in progress`}
                        subtle
                    />
                )}
                {actionError && (
                    <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {actionError}
                    </div>
                )}
                <section className="hero-panel mb-8 p-5 sm:p-8">
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-500/10 to-transparent" />
                    <div className="absolute -top-14 right-12 h-36 w-36 rounded-full bg-brand-400/10 blur-3xl" />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-brand-200">
                                <span className="h-2 w-2 rounded-full bg-brand-400" />
                                Server Detail
                            </p>
                            <h2 className="text-2xl font-bold text-surface-50 sm:text-4xl">{server.name}</h2>
                            <p className="mt-3 text-sm leading-6 text-surface-300">
                                {server.type} edition, version {server.version}, exposed at {connectionAddress}. Manage runtime, files, and configuration from one place.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[420px]">
                            <div className="rounded-2xl border border-surface-700/70 bg-surface-800/60 px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Status</p>
                                <div className="mt-2">
                                    <StatusBadge status={server.status} />
                                </div>
                            </div>
                            <div className="rounded-2xl border border-surface-700/70 bg-surface-800/60 px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Connection</p>
                                <div className="mt-2 flex items-start gap-2">
                                    <p className="min-w-0 break-all text-sm font-semibold text-surface-100 sm:text-lg">
                                        {connectionAddress}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleCopyConnection}
                                        className="btn-icon h-9 w-9 flex-shrink-0 border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-100"
                                        title="Copy server address"
                                        aria-label="Copy server address"
                                    >
                                        {connectionCopied ? <Check size={15} /> : <Copy size={15} />}
                                    </button>
                                </div>
                                <p className="mt-2 text-xs text-surface-500">
                                    {connectionCopied ? "Copied to clipboard" : "Copy this address for Minecraft client connection"}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats row */}
                {isRunning && server.stats && (
                    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="card space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-2 text-blue-300">
                                    <Cpu size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-surface-500 uppercase tracking-[0.18em]">CPU Usage</p>
                                    <p className="text-2xl font-semibold text-surface-100">{formatPercent(server.stats.cpuPercent)}</p>
                                    <p className={cn("text-sm font-medium", cpuUsageTone?.textClassName)}>
                                        {cpuUsageTone?.label} load right now
                                    </p>
                                </div>
                            </div>
                            <div>
                                <div className="mb-2 flex items-center justify-between text-xs text-surface-400">
                                    <span>Processor load</span>
                                    <span>{formatPercent(server.stats.cpuPercent)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-800">
                                    <div
                                        className={cn("h-full rounded-full transition-all", cpuUsageTone?.fillClassName)}
                                        style={{ width: `${Math.min(server.stats.cpuPercent, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="card space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-2 text-fuchsia-300">
                                    <MemoryStick size={18} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-surface-500 uppercase tracking-[0.18em]">Memory Usage</p>
                                    <p className="text-2xl font-semibold text-surface-100">
                                        {formatBytes(server.stats.memoryUsage)}
                                    </p>
                                    <p className="text-sm text-surface-400">
                                        of {formatBytes(server.stats.memoryLimit)} allocated
                                    </p>
                                    <p className={cn("text-sm font-medium", memoryUsageTone?.textClassName)}>
                                        {formatPercent(server.stats.memoryPercent)} used, {memoryUsageTone?.label.toLowerCase()} pressure
                                    </p>
                                </div>
                            </div>
                            <div>
                                <div className="mb-2 flex items-center justify-between text-xs text-surface-400">
                                    <span>Allocated memory</span>
                                    <span>{formatPercent(server.stats.memoryPercent)}</span>
                                </div>
                                <div className="h-2 rounded-full bg-surface-800">
                                    <div
                                        className={cn("h-full rounded-full transition-all", memoryUsageTone?.fillClassName)}
                                        style={{ width: `${Math.min(server.stats.memoryPercent, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-fit sm:px-0">
                    <div className="flex min-w-max gap-2 rounded-2xl border border-surface-700/60 bg-surface-900/55 p-2 backdrop-blur-xl">
                        <button
                            onClick={() => handleTabChange("settings")}
                            className={`game-tab ${activeTab === "settings"
                                ? "game-tab-active"
                                : "game-tab-idle"
                                }`}
                        >
                            <Settings size={14} /> Settings
                        </button>
                        <button
                            onClick={() => handleTabChange("properties")}
                            className={`game-tab ${activeTab === "properties"
                                ? "game-tab-active"
                                : "game-tab-idle"
                                }`}
                        >
                            <FileText size={14} /> Properties
                        </button>
                        <button
                            onClick={() => handleTabChange("resourcePacks")}
                            className={`game-tab ${activeTab === "resourcePacks"
                                ? "game-tab-active"
                                : "game-tab-idle"
                                }`}
                        >
                            <Layers3 size={14} /> Resource Packs
                        </button>
                        <button
                            onClick={() => handleTabChange("files")}
                            className={`game-tab ${activeTab === "files"
                                ? "game-tab-active"
                                : "game-tab-idle"
                                }`}
                        >
                            <FolderOpen size={14} /> Files
                        </button>
                        <button
                            onClick={() => handleTabChange("console")}
                            className={`game-tab ${activeTab === "console"
                                ? "game-tab-active"
                                : "game-tab-idle"
                                }`}
                        >
                            <Terminal size={14} /> Console
                        </button>
                    </div>
                </div>

                {/* Settings Tab */}
                {activeTab === "settings" && (
                    <>

                        <div className="card">
                            <h3 className="text-lg font-semibold text-surface-100 mb-4">Server Settings</h3>
                            <div className="space-y-4">
                                {settingsError && (
                                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
                                        {settingsError}
                                    </div>
                                )}
                                {restartNotice && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                                        {restartNotice}
                                    </div>
                                )}
                                {hasUnsavedSettings && (
                                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                        You have unsaved changes in server settings.
                                    </div>
                                )}
                                <div>
                                    <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
                                    <input
                                        type="text"
                                        value={settings.name || ""}
                                        onChange={(e) => updateSettingsField("name", e.target.value)}
                                        className="input-field w-full"
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Type</label>
                                        <SelectDropdown
                                            options={SERVER_TYPE_OPTIONS}
                                            value={settings.type || "vanilla"}
                                            onChange={(value) => updateSettingsField("type", value)}
                                            placeholder="Select server type"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Version</label>
                                        <SelectDropdown
                                            options={SERVER_VERSION_OPTIONS}
                                            value={settings.version || "latest"}
                                            onChange={(value) => updateSettingsField("version", value)}
                                            placeholder="Select version"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Port</label>
                                        <input
                                            type="number"
                                            value={settings.port || 25565}
                                            onChange={(e) => updateSettingsField("port", Number(e.target.value))}
                                            min={1024}
                                            max={65535}
                                            className="input-field w-full"
                                        />
                                        {isDuplicatePort && (
                                            <p className="mt-1.5 text-sm text-red-400">
                                                Port {settings.port} is already in use. Duplicate ports are not allowed.
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-sm font-medium text-surface-300">Memory</label>
                                            <span className="text-sm font-semibold text-brand-300">
                                                {formatMemoryGb(settings.memoryMb || MEMORY_MIN_MB)}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            value={settings.memoryMb || MEMORY_MIN_MB}
                                            onChange={(e) => updateSettingsField("memoryMb", Number(e.target.value))}
                                            min={MEMORY_MIN_MB}
                                            max={MEMORY_MAX_MB}
                                            step={MEMORY_STEP_MB}
                                            className="memory-slider w-full"
                                        />
                                        <div className="mt-1 flex justify-between text-xs text-surface-500">
                                            <span>{formatMemoryGb(MEMORY_MIN_MB)}</span>
                                            <span>{formatMemoryGb(MEMORY_MAX_MB)}</span>
                                        </div>
                                    </div>
                                </div>
                                {/* <div>
                                <label className="block text-sm font-medium text-surface-300 mb-1.5">JVM Args</label>
                                <input
                                    type="text"
                                    value={settings.jvmArgs || ""}
                                    onChange={(e) => setSettings({ ...settings, jvmArgs: e.target.value })}
                                    placeholder="-XX:+UseG1GC -XX:+ParallelRefThreads"
                                    className="input-field w-full font-mono text-sm"
                                />
                            </div> */}

                                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleUndoSettingsChange}
                                            disabled={actionLoading !== null || !canUndoSettingsChange}
                                            className="btn-secondary flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <RotateCcw size={14} />
                                            Undo
                                        </button>
                                        <button
                                            onClick={handleSaveSettings}
                                            disabled={actionLoading !== null || isDuplicatePort || !hasUnsavedSettings}
                                            className="btn-primary flex items-center gap-2"
                                        >
                                            <Save size={14} />
                                            {settingsSaved ? "Saved ✓" : "Save Settings"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card mt-6 border-red-500/20">
                            <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
                            <p className="text-sm text-surface-400 mb-4">
                                Recreate will destroy the current container and server files, then build a fresh server using the same name and settings.
                                Delete removes the record entirely.
                            </p>
                            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4">
                                <p className="text-sm text-amber-100 mb-3">
                                    Recreate keeps this server entry and configuration, but resets the runtime data to a fresh server.
                                </p>

                                <button
                                    onClick={() => setDangerConfirm("recreate")}
                                    className="btn-secondary flex items-center gap-2 border-amber-500/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                >
                                    <RefreshCw size={14} /> Recreate Server
                                </button>
                            </div>

                            <p className="text-sm text-surface-400 mb-4">
                                Deleting a server will stop the Minecraft server, remove all files, and delete the database record.
                                This action cannot be undone.
                            </p>

                            <button
                                onClick={() => setDangerConfirm("delete")}
                                className="btn-danger flex items-center gap-2"
                            >
                                <Trash2 size={14} /> Delete Server
                            </button>
                        </div>
                    </>
                )}

                {/* Properties Tab */}
                {activeTab === "properties" && (
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-surface-100">Server Properties</h3>
                                <p className="mt-1 text-sm text-surface-400">
                                    Manage the most common server settings here, then use the raw editor for advanced values.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleUndoPropertyChange}
                                    disabled={actionLoading !== null || !canUndoPropertyChange}
                                    className="btn-secondary flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <RotateCcw size={14} />
                                    Undo
                                </button>
                                <button
                                    onClick={handleSaveProperties}
                                    disabled={actionLoading !== null || !hasUnsavedProperties}
                                    className="btn-primary flex items-center gap-2 text-sm"
                                >
                                    <Save size={14} />
                                    {propertiesSaved ? "Saved ✓" : "Save"}
                                </button>
                            </div>
                        </div>

                        {Object.keys(properties).length === 0 && (
                            <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                                `server.properties` was not found yet. Saving this form will create or update it for you.
                            </div>
                        )}
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
                                        Saved as `server-icon.png` in `/servers/{server.id}/data`. Recommended size: 64x64 PNG.
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
                                        setServerIconDragActive(true);
                                    }}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (!serverIconDragActive) setServerIconDragActive(true);
                                    }}
                                    onDragLeave={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setServerIconDragActive(false);
                                    }}
                                    onDrop={(event) => void handleServerIconDrop(event)}
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
                                                {actionLoading === "uploadIcon" ? "Uploading server icon..." : "Upload server-icon.png"}
                                            </p>
                                            <p className="mt-1 text-sm text-surface-400">
                                                Click to choose a PNG file or drag and drop it here.
                                            </p>
                                            <p className="mt-3 text-xs text-surface-500">
                                                Minecraft reads this file from the server data directory using the exact name `server-icon.png`.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/png"
                                        className="hidden"
                                        onChange={handleServerIconUpload}
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            {PROPERTY_FIELDS.map((field) => {
                                const value = properties[field.key] ?? PROPERTY_DEFAULTS[field.key] ?? "";

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
                                                onChange={(nextValue) => setPropertyValue(field.key, nextValue)}
                                                placeholder={`Select ${field.label}`}
                                            />
                                        ) : field.type === "boolean" ? (
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={value === "true"}
                                                onClick={() => setPropertyValue(field.key, value === "true" ? "false" : "true")}
                                                className={cn(
                                                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all",
                                                    value === "true"
                                                        ? "border-emerald-500/30 bg-emerald-500/10"
                                                        : "border-surface-700/80 bg-surface-950/70"
                                                )}
                                            >
                                                <div>
                                                    <p className={cn(
                                                        "text-sm font-medium",
                                                        value === "true" ? "text-emerald-100" : "text-surface-200"
                                                    )}>
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
                                        ) : (
                                            <input
                                                type={field.type}
                                                value={value}
                                                min={field.type === "number" ? 0 : undefined}
                                                onChange={(e) => setPropertyValue(field.key, e.target.value)}
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
                                onClick={() => setShowAdvancedProperties((current) => !current)}
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
                                                        onChange={(e) => setPropertyValue(key, e.target.value)}
                                                        className="input-field flex-1 py-1.5 font-mono text-sm"
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "resourcePacks" && (
                    <div className="space-y-6">
                        <div
                            className={cn("card relative transition-all duration-200", resourcePackDragActive && "scale-[1.01] border-brand-500/40")}
                            onDragEnter={handleResourcePackDragEnter}
                            onDragOver={handleResourcePackDragOver}
                            onDragLeave={handleResourcePackDragLeave}
                            onDrop={handleResourcePackDrop}
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
                                                const dropDirection =
                                                    isDragTarget && draggedIndex !== -1 && draggedIndex < index ? "down" : "up";

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
                                                            isSelected
                                                                ? "border-red-500/30 bg-red-500/10"
                                                                : "border-surface-700/70 bg-surface-900/40",
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
                                                                    {pack.kind === "stored" && (
                                                                        <span className="font-mono">{pack.sha1.slice(0, 12)}...</span>
                                                                    )}
                                                                </div>
                                                                <p className="mt-3 text-xs text-surface-500">
                                                                    {isSelected
                                                                        ? "This pack is selected for bulk delete only."
                                                                        : "Drag to reorder, or use the controls to manage this pack."}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="mt-4 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
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
                                                                    setResourcePackConfirm({ kind: "deletePack", pack });
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
                                                onChange={(e) => setBuildName(e.target.value)}
                                                placeholder={`${server.name}-resource-pack`}
                                                className="input-field w-full"
                                            />
                                        </div>

                                        <p className="text-xs text-surface-500">
                                            Configure prompt, require-resource-pack, and other server properties in the Properties tab.
                                        </p>

                                        <button
                                            type="button"
                                            onClick={handleBuildMergedPack}
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
                                        <span className={cn(
                                            "rounded-full px-2.5 py-1 text-xs font-medium",
                                            previewConflicts.length > 0
                                                ? "border border-amber-500/25 bg-amber-500/10 text-amber-200"
                                                : "border border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                                        )}>
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
                                                        <p>Size: {formatBytes(build.sizeBytes)} · SHA1: <span className="font-mono">{build.sha1}</span></p>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
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
                                                        onClick={() => handleAssignBuild(build.id)}
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
                                                        onClick={() => setResourcePackConfirm({ kind: "deleteBuild", build })}
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
                )}

                {/* Files Tab */}
                {activeTab === "files" && (
                    <div className="card">
                        {editingFile ? (
                            <div className="-m-5 h-[600px]">
                                <FileEditor
                                    serverId={id!}
                                    filePath={editingFile}
                                    onClose={() => setEditingFile(null)}
                                />
                            </div>
                        ) : (
                            <>
                                <h3 className="text-lg font-semibold text-surface-100 mb-4">File Manager</h3>
                                <FileBrowser
                                    serverId={id!}
                                    onEditFile={(path) => setEditingFile(path)}
                                />
                            </>
                        )}
                    </div>
                )}

                {/* Console Tab */}
                {activeTab === "console" && (
                    <div className="card">
                        <h3 className="text-lg font-semibold text-surface-100 mb-4">Console</h3>
                        {isRunning ? (
                            <Console serverId={id!} />
                        ) : (
                            <div className="text-center py-12 text-surface-500">
                                <Terminal size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Server must be running to view console.</p>
                            </div>
                        )}
                    </div>
                )}

                {resourcePackConfirm && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
                            <h3 className="text-lg font-semibold text-surface-100">
                                {resourcePackConfirm.kind === "deleteSelectedPacks"
                                    ? "Delete selected packs?"
                                    : resourcePackConfirm.kind === "deleteBuild"
                                        ? "Delete merged build?"
                                        : "Delete resource pack?"}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-surface-400">
                                {resourcePackConfirm.kind === "deleteSelectedPacks"
                                    ? `This will remove ${resourcePackConfirm.packIds.length} selected resource pack${resourcePackConfirm.packIds.length > 1 ? "s" : ""}.`
                                    : resourcePackConfirm.kind === "deleteBuild"
                                        ? `This will remove "${resourcePackConfirm.build.name}" and its public download link.`
                                        : `This will remove "${resourcePackConfirm.pack.name}".`}
                            </p>
                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setResourcePackConfirm(null)}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleConfirmResourcePackAction()}
                                    className="btn-danger"
                                >
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {dangerConfirm && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
                            <h3 className={cn(
                                "text-lg font-semibold",
                                dangerConfirm === "delete" ? "text-red-300" : "text-amber-200"
                            )}>
                                {dangerConfirm === "delete" ? "Delete server?" : "Recreate server?"}
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-surface-400">
                                {dangerConfirm === "delete"
                                    ? "This will stop the server, remove all server files, and delete the database record."
                                    : "This will reset the runtime data and rebuild the server using the same name and settings."}
                            </p>
                            <p className="mt-4 text-sm text-surface-300">
                                Type <span className={cn(
                                    "font-mono",
                                    dangerConfirm === "delete" ? "text-red-400" : "text-amber-300"
                                )}>{server.name}</span> to continue:
                            </p>
                            <input
                                type="text"
                                value={dangerConfirm === "delete" ? deleteConfirmText : recreateConfirmText}
                                onChange={(event) => {
                                    if (dangerConfirm === "delete") {
                                        setDeleteConfirmText(event.target.value);
                                        return;
                                    }
                                    setRecreateConfirmText(event.target.value);
                                }}
                                placeholder={server.name}
                                className="input-field mt-3 w-full"
                                autoFocus
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        setDangerConfirm(null);
                                        setDeleteConfirmText("");
                                        setRecreateConfirmText("");
                                    }
                                    if (event.key === "Enter") {
                                        if (dangerConfirm === "delete") {
                                            void handleDelete();
                                            return;
                                        }
                                        void handleRecreate();
                                    }
                                }}
                            />
                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDangerConfirm(null);
                                        setDeleteConfirmText("");
                                        setRecreateConfirmText("");
                                    }}
                                    className="btn-secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (dangerConfirm === "delete") {
                                            void handleDelete();
                                            return;
                                        }
                                        void handleRecreate();
                                    }}
                                    disabled={
                                        actionLoading !== null ||
                                        (dangerConfirm === "delete"
                                            ? deleteConfirmText !== server.name
                                            : recreateConfirmText !== server.name)
                                    }
                                    className={cn(
                                        dangerConfirm === "delete"
                                            ? "btn-danger"
                                            : "btn-secondary border-amber-500/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
                                        "disabled:opacity-50"
                                    )}
                                >
                                    {dangerConfirm === "delete"
                                        ? actionLoading === "delete"
                                            ? "Deleting..."
                                            : "Confirm Delete"
                                        : actionLoading === "recreate"
                                            ? "Recreating..."
                                            : "Confirm Recreate"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {unsavedChangesConfirm && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
                            <h3 className="text-lg font-semibold text-surface-100">
                                Discard unsaved changes?
                            </h3>
                            <p className="mt-2 text-sm leading-6 text-surface-400">
                                {unsavedChangesConfirm.kind === "tab"
                                    ? "You have unsaved changes. Leaving this tab now will discard them."
                                    : "You have unsaved changes. Leaving this page now will discard them."}
                            </p>
                            <div className="mt-6 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setUnsavedChangesConfirm(null)}
                                    className="btn-secondary"
                                >
                                    Stay Here
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmDiscardChanges}
                                    className="btn-danger"
                                >
                                    Discard Changes
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
