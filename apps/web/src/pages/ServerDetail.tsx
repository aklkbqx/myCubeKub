import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type ServerWithStatus, type UpdateServerData } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { FileBrowser } from "@/components/FileBrowser";
import { FileEditor } from "@/components/FileEditor";
import { Console } from "@/components/Console";
import SelectDropdown from "@/components/SelectDropdown";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import {
    formatMemoryGb,
    MEMORY_MAX_MB,
    MEMORY_MIN_MB,
    MEMORY_STEP_MB,
    SERVER_TYPE_OPTIONS,
    SERVER_VERSION_OPTIONS,
} from "@/lib/serverFormOptions";
import {
    ArrowLeft, Play, Square, RotateCcw, Trash2, Save,
    Cpu, MemoryStick, Settings, FileText, FolderOpen, Terminal, Server,
} from "lucide-react";

export function ServerDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [server, setServer] = useState<ServerWithStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"settings" | "properties" | "files" | "console">("settings");

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

    // Properties
    const [properties, setProperties] = useState<Record<string, string>>({});
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);
    const [propertiesSaved, setPropertiesSaved] = useState(false);

    // Delete confirmation
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState("");

    const fetchServer = useCallback(async () => {
        if (!id) return;
        try {
            const { server } = await api.servers.get(id);
            setServer(server);
            setSettings({
                name: server.name,
                port: server.port,
                version: server.version,
                type: server.type,
                memoryMb: server.memoryMb,
            });
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
        try {
            const { properties } = await api.servers.getProperties(id);
            setProperties(properties);
            setPropertiesLoaded(true);
        } catch {
            setProperties({});
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
        if (activeTab === "properties" && !propertiesLoaded) {
            fetchProperties();
        }
    }, [activeTab, propertiesLoaded, fetchProperties]);

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

    const handleSaveProperties = async () => {
        if (!id) return;
        setActionError("");
        setActionLoading("saveProps");
        try {
            await api.servers.updateProperties(id, properties);
            setPropertiesSaved(true);
            setTimeout(() => setPropertiesSaved(false), 2000);
        } catch (err: any) {
            setActionError(err.message || "Failed to save properties");
        } finally {
            setActionLoading(null);
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

    return (
        <div className="min-h-screen">
            {/* Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-600/8 rounded-full blur-[120px]" />
                <div className="absolute left-0 top-40 h-[360px] w-[360px] rounded-full bg-cyan-500/5 blur-[110px]" />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-surface-800/80 bg-surface-950/80 backdrop-blur-2xl">
                <div className="page-shell">
                    <div className="flex min-h-[76px] items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate("/")}
                                className="btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-200"
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-500/25 bg-brand-500/10 text-brand-300">
                                <Server size={18} />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-[0.24em] text-brand-300/75">Server Workspace</p>
                                <h1 className="text-2xl font-bold text-surface-50">{server.name}</h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <StatusBadge status={server.status} className="hidden sm:inline-flex" />
                            {!isRunning ? (
                                <button
                                    onClick={() => handleAction("start", () => api.servers.start(id!))}
                                    disabled={actionLoading !== null}
                                    className="btn-primary text-sm flex items-center gap-1.5"
                                >
                                    <Play size={14} /> Start
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleAction("stop", () => api.servers.stop(id!))}
                                        disabled={actionLoading !== null}
                                        className="btn-danger text-sm flex items-center gap-1.5"
                                    >
                                        <Square size={14} /> Stop
                                    </button>
                                    <button
                                        onClick={() => handleAction("restart", () => api.servers.restart(id!))}
                                        disabled={actionLoading !== null}
                                        className="btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-200"
                                    >
                                        <RotateCcw size={16} />
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
                <section className="hero-panel mb-8 p-6 sm:p-8">
                    <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-500/10 to-transparent" />
                    <div className="absolute -top-14 right-12 h-36 w-36 rounded-full bg-brand-400/10 blur-3xl" />
                    <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-2xl">
                            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-brand-200">
                                <span className="h-2 w-2 rounded-full bg-brand-400" />
                                Server Detail
                            </p>
                            <h2 className="text-3xl font-bold text-surface-50 sm:text-4xl">{server.name}</h2>
                            <p className="mt-3 text-sm leading-6 text-surface-300">
                                {server.type} edition, version {server.version}, exposed at {connectionAddress}. Manage runtime, files, and configuration from one place.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 lg:min-w-[420px]">
                            <div className="rounded-2xl border border-surface-700/70 bg-surface-800/60 px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Status</p>
                                <div className="mt-2">
                                    <StatusBadge status={server.status} />
                                </div>
                            </div>
                            <div className="rounded-2xl border border-surface-700/70 bg-surface-800/60 px-4 py-4">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Connection</p>
                                <p className="mt-2 text-2xl font-bold text-surface-100">{connectionAddress}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stats row */}
                {isRunning && server.stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="card flex items-center gap-3">
                            <Cpu size={18} className="text-blue-400" />
                            <div>
                                <p className="text-xs text-surface-500 uppercase">CPU</p>
                                <p className="text-lg font-semibold text-surface-200">{server.stats.cpuPercent}%</p>
                            </div>
                        </div>
                        <div className="card flex items-center gap-3">
                            <MemoryStick size={18} className="text-purple-400" />
                            <div>
                                <p className="text-xs text-surface-500 uppercase">RAM</p>
                                <p className="text-lg font-semibold text-surface-200">{server.stats.memoryPercent}%</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="mb-6 flex w-fit gap-2 rounded-2xl border border-surface-700/60 bg-surface-900/55 p-2 backdrop-blur-xl">
                    <button
                        onClick={() => setActiveTab("settings")}
                        className={`game-tab ${activeTab === "settings"
                            ? "game-tab-active"
                            : "game-tab-idle"
                            }`}
                    >
                        <Settings size={14} /> Settings
                    </button>
                    <button
                        onClick={() => setActiveTab("properties")}
                        className={`game-tab ${activeTab === "properties"
                            ? "game-tab-active"
                            : "game-tab-idle"
                            }`}
                    >
                        <FileText size={14} /> Properties
                    </button>
                    <button
                        onClick={() => setActiveTab("files")}
                        className={`game-tab ${activeTab === "files"
                            ? "game-tab-active"
                            : "game-tab-idle"
                            }`}
                    >
                        <FolderOpen size={14} /> Files
                    </button>
                    <button
                        onClick={() => setActiveTab("console")}
                        className={`game-tab ${activeTab === "console"
                            ? "game-tab-active"
                            : "game-tab-idle"
                            }`}
                    >
                        <Terminal size={14} /> Console
                    </button>
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
                                <div>
                                    <label className="block text-sm font-medium text-surface-300 mb-1.5">Name</label>
                                    <input
                                        type="text"
                                        value={settings.name || ""}
                                        onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                                        className="input-field w-full"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Type</label>
                                        <SelectDropdown
                                            options={SERVER_TYPE_OPTIONS}
                                            value={settings.type || "vanilla"}
                                            onChange={(value) => setSettings({ ...settings, type: value })}
                                            placeholder="Select server type"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Version</label>
                                        <SelectDropdown
                                            options={SERVER_VERSION_OPTIONS}
                                            value={settings.version || "latest"}
                                            onChange={(value) => setSettings({ ...settings, version: value })}
                                            placeholder="Select version"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-medium text-surface-300 mb-1.5">Port</label>
                                        <input
                                            type="number"
                                            value={settings.port || 25565}
                                            onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })}
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
                                            onChange={(e) => setSettings({ ...settings, memoryMb: Number(e.target.value) })}
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

                                <div className="flex justify-between items-center pt-2">
                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={actionLoading !== null || isDuplicatePort}
                                        className="btn-primary flex items-center gap-2"
                                    >
                                        <Save size={14} />
                                        {settingsSaved ? "Saved ✓" : "Save Settings"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="card mt-6 border-red-500/20">
                            <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
                            <p className="text-sm text-surface-400 mb-4">
                                Deleting a server will stop the Minecraft server, remove all files, and delete the database record.
                                This action cannot be undone.
                            </p>

                            {!showDeleteConfirm ? (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="btn-danger flex items-center gap-2"
                                >
                                    <Trash2 size={14} /> Delete Server
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm text-surface-300">
                                        Type <span className="font-mono text-red-400">{server.name}</span> to confirm:
                                    </p>
                                    <input
                                        type="text"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        placeholder={server.name}
                                        className="input-field w-full max-w-xs"
                                        autoFocus
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setShowDeleteConfirm(false);
                                                setDeleteConfirmText("");
                                            }}
                                            className="btn-secondary text-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            disabled={deleteConfirmText !== server.name || actionLoading !== null}
                                            className="btn-danger text-sm disabled:opacity-50"
                                        >
                                            {actionLoading === "delete" ? "Deleting..." : "Confirm Delete"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Properties Tab */}
                {activeTab === "properties" && (
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-surface-100">server.properties</h3>
                            <button
                                onClick={handleSaveProperties}
                                disabled={actionLoading !== null}
                                className="btn-primary flex items-center gap-2 text-sm"
                            >
                                <Save size={14} />
                                {propertiesSaved ? "Saved ✓" : "Save"}
                            </button>
                        </div>

                        {Object.keys(properties).length === 0 ? (
                            <div className="text-center py-8 text-surface-500">
                                <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No server.properties file found.</p>
                                <p className="text-xs mt-1">Start the server once to generate it.</p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
                                {Object.entries(properties).map(([key, value]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <label className="text-xs text-surface-400 font-mono w-56 flex-shrink-0 truncate" title={key}>
                                            {key}
                                        </label>
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={(e) =>
                                                setProperties({ ...properties, [key]: e.target.value })
                                            }
                                            className="input-field flex-1 text-sm font-mono py-1.5"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
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
            </main>
        </div>
    );
}
