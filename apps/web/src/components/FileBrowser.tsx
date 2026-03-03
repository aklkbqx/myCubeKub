import { useState, useEffect, useCallback, useRef, type ReactNode, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { api, type FileInfo } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import {
    Folder, File, ArrowLeft, Trash2, Download, Upload,
    FolderPlus, Edit3, X, Check, Inbox, HardDriveDownload, Search, ArrowUpDown,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import SelectDropdown from "./SelectDropdown";

interface FileBrowserProps {
    serverId: string;
    onEditFile: (path: string) => void;
}

type FileDeleteConfirmState =
    | { kind: "single"; item: FileInfo }
    | { kind: "bulk"; items: FileInfo[] };

type UploadState = {
    targetPath: string;
    totalFiles: number;
    completedFiles: number;
    currentFileName: string;
    percent: number;
};

interface IconTooltipProps {
    label: string;
    children: ReactNode;
}

function IconTooltip({ label, children }: IconTooltipProps) {
    return (
        <span className="group/icon-tooltip relative inline-flex">
            {children}
            <span className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-surface-700/80 bg-surface-950/95 px-2 py-1 text-[11px] font-medium text-surface-100 shadow-lg group-hover/icon-tooltip:block group-focus-within/icon-tooltip:block">
                {label}
            </span>
        </span>
    );
}

function joinRelativePath(basePath: string, name: string) {
    return basePath ? `${basePath}/${name}` : name;
}

type FileFilterMode = "all" | "files" | "folders";
type FileSortMode = "name-asc" | "name-desc" | "size-desc" | "size-asc" | "modified-desc" | "modified-asc";

const FILE_FILTER_OPTIONS = [
    { value: "all", label: "All items" },
    { value: "files", label: "Files only" },
    { value: "folders", label: "Folders only" },
] as const;

const FILE_SORT_OPTIONS = [
    { value: "name-asc", label: "Name A-Z" },
    { value: "name-desc", label: "Name Z-A" },
    { value: "modified-desc", label: "Recently modified" },
    { value: "modified-asc", label: "Oldest modified" },
    { value: "size-desc", label: "Largest first" },
    { value: "size-asc", label: "Smallest first" },
] as const;

export function FileBrowser({ serverId, onEditFile }: FileBrowserProps) {
    const [currentPath, setCurrentPath] = useState("");
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [renamingFile, setRenamingFile] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [error, setError] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadState, setUploadState] = useState<UploadState | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [folderDropTarget, setFolderDropTarget] = useState<string | null>(null);
    const [recentlyUploadedPaths, setRecentlyUploadedPaths] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<FileFilterMode>("all");
    const [sortMode, setSortMode] = useState<FileSortMode>("name-asc");
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const [deleteConfirm, setDeleteConfirm] = useState<FileDeleteConfirmState | null>(null);
    const [previewImage, setPreviewImage] = useState<FileInfo | null>(null);
    const dragDepthRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const recentUploadTimeoutRef = useRef<number | null>(null);

    const normalizedCurrentPath =
        currentPath && currentPath !== "undefined" && currentPath !== "null"
            ? currentPath
            : "";

    const fetchFiles = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;

        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError("");
        try {
            const res = await api.files.list(serverId, normalizedCurrentPath || undefined);
            setFiles(res.files);
            setCurrentPath(res.path && res.path !== "undefined" && res.path !== "null" ? res.path : "");
            setSelectedPaths((prev) =>
                prev.filter((path) => res.files.some((file) => file.path === path))
            );
        } catch (err) {
            setError("Failed to load files.");
            setFiles([]);
            setSelectedPaths([]);
        } finally {
            if (silent) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [serverId, normalizedCurrentPath]);

    useEffect(() => {
        void fetchFiles();
    }, [fetchFiles]);

    useEffect(() => {
        const interval = setInterval(() => {
            void fetchFiles({ silent: true });
        }, 5_000);

        return () => clearInterval(interval);
    }, [fetchFiles]);

    useEffect(() => {
        return () => {
            if (recentUploadTimeoutRef.current) {
                window.clearTimeout(recentUploadTimeoutRef.current);
            }
        };
    }, []);

    const navigateToFolder = (path: string) => {
        setCurrentPath(path);
    };

    const navigateUp = () => {
        const parts = normalizedCurrentPath.split("/").filter(Boolean);
        parts.pop();
        setCurrentPath(parts.join("/"));
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const path = normalizedCurrentPath ? `${normalizedCurrentPath}/${newFolderName}` : newFolderName;
        setError("");
        try {
            await api.files.mkdir(serverId, path);
            setNewFolderName("");
            setShowNewFolder(false);
            void fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to create folder.");
        }
    };

    const executeDelete = async (file: FileInfo) => {
        setError("");
        try {
            await api.files.delete(serverId, file.path);
            void fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to delete item.");
        }
    };

    const handleRename = async (file: FileInfo) => {
        if (!renameValue.trim() || renameValue === file.name) {
            setRenamingFile(null);
            return;
        }
        const dir = file.path.substring(0, file.path.length - file.name.length);
        const newPath = dir + renameValue;
        setError("");
        try {
            await api.files.rename(serverId, file.path, newPath);
            setRenamingFile(null);
            void fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to rename item.");
        }
    };

    const uploadFiles = useCallback(async (fileList: FileList | File[], targetPath?: string) => {
        const items = Array.from(fileList);
        if (items.length === 0) return;
        const destinationPath = targetPath ?? normalizedCurrentPath;

        setUploading(true);
        setError("");
        setFolderDropTarget(null);
        setUploadState({
            targetPath: destinationPath || "data",
            totalFiles: items.length,
            completedFiles: 0,
            currentFileName: items[0]?.name || "",
            percent: 0,
        });

        try {
            for (let index = 0; index < items.length; index += 1) {
                const file = items[index];
                await api.files.upload(serverId, file, destinationPath || undefined, (progress) => {
                    const overallPercent = Math.round(((index + progress.percent / 100) / items.length) * 100);
                    setUploadState({
                        targetPath: destinationPath || "data",
                        totalFiles: items.length,
                        completedFiles: index,
                        currentFileName: file.name,
                        percent: overallPercent,
                    });
                });

                setUploadState({
                    targetPath: destinationPath || "data",
                    totalFiles: items.length,
                    completedFiles: index + 1,
                    currentFileName: file.name,
                    percent: Math.round(((index + 1) / items.length) * 100),
                });
            }

            if (destinationPath === normalizedCurrentPath) {
                const uploadedPaths = items.map((file) => joinRelativePath(destinationPath, file.name));
                setRecentlyUploadedPaths(uploadedPaths);
                if (recentUploadTimeoutRef.current) {
                    window.clearTimeout(recentUploadTimeoutRef.current);
                }
                recentUploadTimeoutRef.current = window.setTimeout(() => {
                    setRecentlyUploadedPaths([]);
                    recentUploadTimeoutRef.current = null;
                }, 8000);
            }

            await fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to upload file.");
        } finally {
            setUploading(false);
            setUploadState(null);
        }
    }, [normalizedCurrentPath, fetchFiles, serverId]);

    const handleUpload = async () => {
        fileInputRef.current?.click();
    };

    const handleFileSelection = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles?.length) return;

        await uploadFiles(selectedFiles);
        e.target.value = "";
    };

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current += 1;
        setDragActive(true);
    };

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!dragActive) {
            setDragActive(true);
        }
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
            setDragActive(false);
        }
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setDragActive(false);
        setFolderDropTarget(null);

        const droppedFiles = e.dataTransfer.files;
        if (!droppedFiles?.length) return;

        await uploadFiles(droppedFiles);
    };

    const handleFolderDrop = async (e: DragEvent<HTMLDivElement>, folderPath: string) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setDragActive(false);
        setFolderDropTarget(null);

        const droppedFiles = e.dataTransfer.files;
        if (!droppedFiles?.length) return;

        await uploadFiles(droppedFiles, folderPath);
    };

    const handleFileClick = (file: FileInfo) => {
        if (file.isDirectory) {
            navigateToFolder(file.path);
        } else if (isTextFile(file.name)) {
            onEditFile(file.path);
        } else if (isImageFile(file.name)) {
            setPreviewImage(file);
        }
    };

    const toggleSelection = (file: FileInfo) => {
        setSelectedPaths((prev) =>
            prev.includes(file.path)
                ? prev.filter((path) => path !== file.path)
                : [...prev, file.path]
        );
    };

    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredFiles = files
        .filter((file) => {
            if (filterMode === "files" && file.isDirectory) return false;
            if (filterMode === "folders" && !file.isDirectory) return false;
            if (!normalizedSearchQuery) return true;

            return file.name.toLowerCase().includes(normalizedSearchQuery);
        })
        .sort((left, right) => {
            if (sortMode.startsWith("name")) {
                const direction = sortMode === "name-desc" ? -1 : 1;
                if (left.isDirectory !== right.isDirectory) {
                    return left.isDirectory ? -1 : 1;
                }
                return left.name.localeCompare(right.name) * direction;
            }

            if (sortMode.startsWith("size")) {
                const direction = sortMode === "size-desc" ? -1 : 1;
                if (left.isDirectory !== right.isDirectory) {
                    return left.isDirectory ? -1 : 1;
                }
                return (left.size - right.size) * direction;
            }

            const direction = sortMode === "modified-desc" ? -1 : 1;
            return (new Date(left.modifiedAt).getTime() - new Date(right.modifiedAt).getTime()) * direction;
        });

    const selectableItems = filteredFiles;
    const hasSelectableItems = selectableItems.length > 0;
    const visibleSelectedItems = selectableItems.filter((file) => selectedPaths.includes(file.path));
    const allFilesSelected =
        hasSelectableItems &&
        selectableItems.every((file) => selectedPaths.includes(file.path));

    const toggleSelectAll = () => {
        setSelectedPaths(allFilesSelected ? [] : selectableItems.map((file) => file.path));
    };

    const triggerDownload = (path: string) => {
        const anchor = document.createElement("a");
        anchor.href = api.files.downloadUrl(serverId, path);
        anchor.download = path.split("/").pop() || "download";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const handleDownloadSelected = async () => {
        if (visibleSelectedItems.length === 0) return;

        setDownloading(true);
        setError("");

        try {
            for (const file of visibleSelectedItems) {
                triggerDownload(file.path);
                await new Promise((resolve) => setTimeout(resolve, 150));
            }
        } catch (err: any) {
            setError(err.message || "Failed to download selected files.");
        } finally {
            setDownloading(false);
        }
    };

    const executeDeleteSelected = async (items: FileInfo[]) => {
        if (items.length === 0) return;
        setError("");
        setDownloading(true);

        try {
            await Promise.all(
                items.map((file) => api.files.delete(serverId, file.path))
            );
            setSelectedPaths([]);
            await fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to delete selected items.");
        } finally {
            setDownloading(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (visibleSelectedItems.length === 0) return;
        setDeleteConfirm({ kind: "bulk", items: visibleSelectedItems });
    };

    const handleConfirmDelete = async () => {
        if (!deleteConfirm) return;

        const confirmState = deleteConfirm;
        setDeleteConfirm(null);

        if (confirmState.kind === "single") {
            await executeDelete(confirmState.item);
            return;
        }

        await executeDeleteSelected(confirmState.items);
    };

    const handleDownloadAll = () => {
        const anchor = document.createElement("a");
        anchor.href = api.files.downloadAllUrl(serverId);
        anchor.download = "server-data.tar.gz";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    };

    const breadcrumbs = normalizedCurrentPath ? normalizedCurrentPath.split("/").filter(Boolean) : [];

    const isTextFile = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const textExts = [
            "txt", "yml", "yaml", "json", "properties", "cfg", "conf", "ini",
            "log", "md", "toml", "xml", "html", "css", "js", "ts", "java",
            "sh", "bat", "command", "mcmeta", "csv",
        ];
        return textExts.includes(ext);
    };

    const isImageFile = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];
        return imageExts.includes(ext);
    };

    return (
        <div
            className={`relative transition-all duration-200 ${dragActive ? "scale-[1.01]" : ""}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {(loading || downloading) && (
                <LoadingOverlay
                    message={
                        downloading
                            ? "Preparing downloads"
                            : "Loading files"
                    }
                    subtle
                />
            )}

            {!loading && refreshing && !uploading && !downloading && (
                <div className="pointer-events-none absolute right-4 top-4 z-20 rounded-full border border-surface-700/70 bg-surface-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-surface-400 backdrop-blur-md">
                    Refreshing
                </div>
            )}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelection}
            />
            {error && (
                <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}
            {uploadState && (
                <div className="mb-4 rounded-2xl border border-brand-500/20 bg-brand-500/10 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-surface-100">
                                Uploading to {uploadState.targetPath || "data"}
                            </p>
                            <p className="mt-1 truncate text-xs text-surface-400">
                                {uploadState.currentFileName} • {uploadState.completedFiles}/{uploadState.totalFiles} completed
                            </p>
                        </div>
                        <span className="text-sm font-semibold text-brand-200">
                            {uploadState.percent}%
                        </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-800">
                        <div
                            className="h-full rounded-full bg-brand-400 transition-[width]"
                            style={{ width: `${uploadState.percent}%` }}
                        />
                    </div>
                </div>
            )}
            {/* Toolbar */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button
                        onClick={() => setCurrentPath("")}
                        className="text-brand-400 hover:text-brand-300 font-medium"
                    >
                        data
                    </button>
                    {breadcrumbs.map((part, i) => (
                        <span key={i} className="flex items-center gap-2">
                            <span className="text-surface-600">/</span>
                            <button
                                onClick={() =>
                                    setCurrentPath(breadcrumbs.slice(0, i + 1).join("/"))
                                }
                                className="text-brand-400 hover:text-brand-300"
                            >
                                {part}
                            </button>
                        </span>
                    ))}
                </div>

                <div className="flex items-center justify-end gap-2">
                    <IconTooltip label="Download all">
                        <button
                            onClick={handleDownloadAll}
                            disabled={downloading || uploading}
                            className="btn-icon text-surface-400 hover:text-surface-200 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Download entire data folder"
                        >
                            <HardDriveDownload size={16} />
                        </button>
                    </IconTooltip>
                    <IconTooltip label="Upload files">
                        <button
                            onClick={handleUpload}
                            className="btn-icon text-surface-400 hover:text-surface-200"
                            aria-label="Upload files"
                        >
                            <Upload size={16} />
                        </button>
                    </IconTooltip>
                    <IconTooltip label="Create folder">
                        <button
                            onClick={() => setShowNewFolder(true)}
                            className="btn-icon text-surface-400 hover:text-surface-200"
                            aria-label="Create folder"
                        >
                            <FolderPlus size={16} />
                        </button>
                    </IconTooltip>
                </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                <label className="relative block">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search files and folders"
                        className="input-field w-full pl-9"
                    />
                </label>

                <label className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">
                        <Folder size={14} />
                    </span>
                    <div className="pl-9">
                        <SelectDropdown
                            options={[...FILE_FILTER_OPTIONS]}
                            value={filterMode}
                            onChange={(value) => setFilterMode(value as FileFilterMode)}
                            placeholder="Filter items"
                        />
                    </div>
                </label>

                <label className="relative block">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">
                        <ArrowUpDown size={14} />
                    </span>
                    <div className="pl-9">
                        <SelectDropdown
                            options={[...FILE_SORT_OPTIONS]}
                            value={sortMode}
                            onChange={(value) => setSortMode(value as FileSortMode)}
                            placeholder="Sort items"
                        />
                    </div>
                </label>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-surface-400">
                <span className="rounded-full border border-surface-700/70 bg-surface-900/70 px-3 py-1">
                    Showing {filteredFiles.length} of {files.length} items
                </span>
                {(searchQuery || filterMode !== "all") && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearchQuery("");
                            setFilterMode("all");
                        }}
                        className="rounded-full border border-brand-500/20 bg-brand-500/10 px-3 py-1 text-brand-300 transition-colors hover:bg-brand-500/15"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* New folder input */}
            {showNewFolder && (
                <div className="flex items-center gap-2 mb-3 bg-surface-800/50 rounded-lg px-3 py-2">
                    <FolderPlus size={14} className="text-brand-400" />
                    <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Folder name"
                        className="input-field flex-1 py-1 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateFolder();
                            if (e.key === "Escape") setShowNewFolder(false);
                        }}
                    />
                    <IconTooltip label="Create folder">
                        <button onClick={handleCreateFolder} className="btn-icon text-brand-400" aria-label="Create folder">
                            <Check size={14} />
                        </button>
                    </IconTooltip>
                    <IconTooltip label="Cancel">
                        <button onClick={() => setShowNewFolder(false)} className="btn-icon text-surface-500" aria-label="Cancel">
                            <X size={14} />
                        </button>
                    </IconTooltip>
                </div>
            )}

            {/* Back button */}
            {currentPath && (
                <button
                    onClick={navigateUp}
                    className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200 mb-2 px-2 py-1.5 rounded-md hover:bg-surface-800/50 w-full"
                >
                    <ArrowLeft size={14} />
                    <span>..</span>
                </button>
            )}

            {hasSelectableItems && visibleSelectedItems.length > 0 && (
                <div className="mb-3 flex items-center justify-between rounded-2xl border border-brand-500/15 bg-surface-900/65 px-4 py-3 text-xs text-surface-300 shadow-lg shadow-black/10">
                    <label className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="Select all items"
                            onClick={toggleSelectAll}
                            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                                allFilesSelected
                                    ? "border-brand-400 bg-brand-500/20 text-brand-200"
                                    : "border-surface-700 bg-surface-900/70 text-transparent hover:border-brand-500/40"
                            }`}
                        >
                            <Check size={12} />
                        </button>
                        <span className="inline-flex items-center gap-2">
                            <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-brand-300">
                                Selection
                            </span>
                            {visibleSelectedItems.length > 0
                                ? `${visibleSelectedItems.length} item${visibleSelectedItems.length > 1 ? "s" : ""} selected`
                                : "Select files or folders to download"}
                        </span>
                    </label>
                    {visibleSelectedItems.length > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleDownloadSelected}
                                disabled={downloading}
                                className="inline-flex items-center gap-1 rounded-lg border border-brand-500/20 bg-brand-500/10 px-2.5 py-1.5 text-[11px] font-medium text-brand-200 transition-colors hover:border-brand-400/30 hover:bg-brand-500/15 hover:text-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Download size={12} />
                                Download {visibleSelectedItems.length} item{visibleSelectedItems.length > 1 ? "s" : ""}
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteSelected}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200"
                            >
                                <Trash2 size={12} />
                                Delete selected
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedPaths([])}
                                className="text-surface-500 transition-colors hover:text-surface-200"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            )}

            {dragActive && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-400/60 bg-brand-500/10 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-brand-400/30 bg-surface-950/85 px-6 py-5 text-center shadow-2xl shadow-brand-900/20">
                        <Inbox size={24} className="text-brand-300" />
                        <div>
                            <p className="text-sm font-medium text-surface-50">Drop files to upload here</p>
                            <p className="text-xs text-surface-400">Files will be uploaded into {normalizedCurrentPath || "data/"}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className={`rounded-2xl border transition-colors duration-200 ${dragActive ? "border-brand-400/50 bg-brand-500/5" : "border-transparent"}`}>
                {/* File list */}
                {!loading && filteredFiles.length === 0 ? (
                    <button
                        type="button"
                        onClick={() => {
                            if (files.length === 0) {
                                void handleUpload();
                                return;
                            }

                            setSearchQuery("");
                            setFilterMode("all");
                        }}
                        className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-surface-700/80 bg-surface-900/40 px-6 py-10 text-center text-sm text-surface-500 transition-colors hover:border-brand-500/40 hover:bg-surface-900/70 hover:text-surface-300"
                    >
                        <Folder size={32} className="mx-auto mb-2 opacity-50" />
                        <p>{files.length === 0 ? "Empty directory" : "No matching files"}</p>
                        <p className="mt-2 text-xs text-surface-600">
                            {files.length === 0
                                ? "Click to upload or drag and drop files here"
                                : "Adjust search or filter to see more items"}
                        </p>
                    </button>
                ) : (
                    <div className="space-y-0.5 grid grid-cols-1">
                        {filteredFiles.map((file) => (
                            <div
                                key={file.path}
                                className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl px-2 py-3 transition-colors group sm:grid-cols-[minmax(0,1fr)_80px_110px] sm:items-center ${
                                    folderDropTarget === file.path
                                        ? "border border-brand-400/45 bg-brand-500/15"
                                        // : recentlyUploadedPaths.includes(file.path)
                                        //     ? "border border-emerald-500/25 bg-emerald-500/10"
                                            : selectedPaths.includes(file.path)
                                                ? "border border-brand-500/25 bg-brand-500/10"
                                                : "border border-transparent hover:bg-surface-800/50"
                                    }`}
                                onClick={() => handleFileClick(file)}
                                onDragEnter={(e) => {
                                    if (!file.isDirectory) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setFolderDropTarget(file.path);
                                }}
                                onDragOver={(e) => {
                                    if (!file.isDirectory) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (folderDropTarget !== file.path) {
                                        setFolderDropTarget(file.path);
                                    }
                                }}
                                onDragLeave={(e) => {
                                    if (!file.isDirectory) return;
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (folderDropTarget === file.path) {
                                        setFolderDropTarget(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    if (!file.isDirectory) return;
                                    void handleFolderDrop(e, file.path);
                                }}
                            >
                                <div className="items-center flex gap-2 flex-1 w-full">
                                    <button
                                        type="button"
                                        aria-label={`Select ${file.name}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(file);
                                        }}
                                        className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${selectedPaths.includes(file.path) ? "border-brand-400 bg-brand-500/20 text-brand-200" : "border-surface-700 bg-surface-900/70 text-transparent hover:border-brand-500/40"}`}
                                    >
                                        <Check size={12} />
                                    </button>
                                    {file.isDirectory ? (
                                        <Folder size={16} className="text-brand-400 flex-shrink-0" />
                                    ) : (
                                        <File size={16} className="text-surface-500 flex-shrink-0" />
                                    )}

                                    {renamingFile === file.path ? (
                                        <input
                                            type="text"
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            className="input-field flex-1 text-sm py-1"
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleRename(file);
                                                if (e.key === "Escape") setRenamingFile(null);
                                            }}
                                            onBlur={() => handleRename(file)}
                                        />
                                    ) : (
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <span className="truncate text-sm text-surface-200">
                                                    {file.name}
                                                </span>
                                                {recentlyUploadedPaths.includes(file.path) && (
                                                    <span className="inline-flex flex-shrink-0 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]">
                                                        New!
                                                    </span>
                                                )}
                                            </div>
                                            {/* {file.isDirectory && folderDropTarget === file.path && (
                                                <span className="mt-1 inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-brand-200">
                                                    Drop files here
                                                </span>
                                            )} */}
                                        </div>
                                    )}
                                </div>

                                <div className="hidden h-full sm:block">
                                    {!file.isDirectory && (
                                        <span className="text-xs text-surface-600">
                                            {formatBytes(file.size)}
                                        </span>
                                    )}
                                </div>

                                {/* Actions */}
                                <div className="col-span-2 flex justify-end sm:col-span-1 sm:justify-center">
                                    <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                                        <IconTooltip label="Rename">
                                            <button
                                                onClick={() => {
                                                    setRenamingFile(file.path);
                                                    setRenameValue(file.name);
                                                }}
                                                className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                                aria-label={`Rename ${file.name}`}
                                            >
                                                <Edit3 size={12} />
                                            </button>
                                        </IconTooltip>
                                        {!file.isDirectory && isTextFile(file.name) && (
                                            <IconTooltip label="Edit">
                                                <button
                                                    onClick={() => onEditFile(file.path)}
                                                    className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                                    aria-label={`Edit ${file.name}`}
                                                >
                                                    <Edit3 size={12} />
                                                </button>
                                            </IconTooltip>
                                        )}
                                        {!file.isDirectory && (
                                            <IconTooltip label="Download">
                                                <a
                                                    href={api.files.downloadUrl(serverId, file.path)}
                                                    className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                                    aria-label={`Download ${file.name}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <Download size={12} />
                                                </a>
                                            </IconTooltip>
                                        )}
                                        <IconTooltip label="Delete">
                                            <button
                                                onClick={() => setDeleteConfirm({ kind: "single", item: file })}
                                                className="btn-icon text-surface-500 hover:text-red-400 p-1"
                                                aria-label={`Delete ${file.name}`}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </IconTooltip>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {deleteConfirm && createPortal(
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
                        <h3 className="text-lg font-semibold text-surface-100">
                            {deleteConfirm.kind === "single" ? "Delete item?" : "Delete selected items?"}
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-surface-400">
                            {deleteConfirm.kind === "single"
                                ? `This will delete ${deleteConfirm.item.isDirectory ? "folder" : "file"} "${deleteConfirm.item.name}".`
                                : `This will delete ${deleteConfirm.items.length} selected item${deleteConfirm.items.length > 1 ? "s" : ""}.`}
                        </p>
                        {deleteConfirm.kind === "bulk" && (
                            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-surface-800 bg-surface-950/60 p-3 text-xs text-surface-300">
                                <div className="space-y-2">
                                    {deleteConfirm.items.slice(0, 5).map((item) => (
                                        <div key={item.path}>
                                            {item.name}
                                            {item.isDirectory ? " (folder, deletes contents)" : ""}
                                        </div>
                                    ))}
                                    {deleteConfirm.items.length > 5 && (
                                        <div className="text-surface-500">
                                            ...and {deleteConfirm.items.length - 5} more item{deleteConfirm.items.length - 5 > 1 ? "s" : ""}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirm(null)}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleConfirmDelete()}
                                className="btn-danger"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {previewImage && createPortal(
                <div
                    className="fixed inset-0 z-[75] flex items-center justify-center bg-surface-950/85 px-4 py-6 backdrop-blur-sm"
                    onClick={() => setPreviewImage(null)}
                >
                    <div
                        className="w-full max-w-5xl rounded-2xl border border-surface-700/70 bg-surface-900 p-4 shadow-2xl shadow-black/40"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                <h3 className="truncate text-lg font-semibold text-surface-100">
                                    {previewImage.name}
                                </h3>
                                <p className="mt-1 text-xs text-surface-400">
                                    {formatBytes(previewImage.size)}
                                </p>
                            </div>
                            <IconTooltip label="Close preview">
                                <button
                                    type="button"
                                    onClick={() => setPreviewImage(null)}
                                    className="btn-icon text-surface-400 hover:text-surface-100"
                                    aria-label="Close image preview"
                                >
                                    <X size={16} />
                                </button>
                            </IconTooltip>
                        </div>

                        <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-2xl border border-surface-800 bg-surface-950/70 p-3">
                            <img
                                src={api.files.downloadUrl(serverId, previewImage.path)}
                                alt={previewImage.name}
                                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
