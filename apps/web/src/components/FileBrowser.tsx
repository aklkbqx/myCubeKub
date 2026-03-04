import { useState, useEffect, useCallback, useRef, type ReactNode, type ChangeEvent, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { ApiError, api, type FileInfo } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import {
    Folder, File, ArrowLeft, Trash2, Download, Upload,
    FolderPlus, Edit3, X, Check, Inbox, HardDriveDownload, Search, ArrowUpDown, FolderUp, Folders,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import SelectDropdown from "./SelectDropdown";

interface FileBrowserProps {
    serverId: string;
    onEditFile: (path: string) => void;
    onServerFilesChanged?: () => void;
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

type UploadCandidate = {
    file: File;
    relativeDir?: string;
};

type SkippedCollectionItem = {
    path?: string;
    reason: string;
};

type DropCollectionStat = {
    expected: number;
    fromEntries: number;
    fromFileList: number;
    merged: number;
    skipped: SkippedCollectionItem[];
};

type DropCollectionResult = {
    candidates: UploadCandidate[];
    directories: string[];
    stats: DropCollectionStat;
};

type UploadSummary = {
    expected: number;
    prepared: number;
    uploaded: number;
    failed: number;
    missingBeforeUpload: number;
    skippedDuringCollection: SkippedCollectionItem[];
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

function normalizeJoinPath(basePath: string, extraPath: string) {
    if (!basePath) return extraPath;
    if (!extraPath) return basePath;
    return `${basePath}/${extraPath}`;
}

function sanitizeRelativePath(path: string) {
    const normalized = path.replace(/\\/g, "/");
    const segments = normalized.split("/");
    const safe: string[] = [];
    for (const segment of segments) {
        if (!segment || segment === ".") continue;
        if (segment === "..") {
            safe.pop();
            continue;
        }
        safe.push(segment);
    }
    return safe.join("/");
}

function getFileRelativeDirectory(file: File) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    if (!relativePath.includes("/")) return "";
    const parentPath = relativePath.split("/").slice(0, -1).join("/");
    return sanitizeRelativePath(parentPath);
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function toPathSegments(path: string) {
    return path.split("/").filter(Boolean);
}

function normalizeRelativeDir(path: string) {
    return sanitizeRelativePath(toPathSegments(path).join("/"));
}

async function collectDropCandidates(
    event: DragEvent<HTMLDivElement>
): Promise<DropCollectionResult> {
    const items = Array.from(event.dataTransfer.items || []);
    const supportsEntries = items.some((item) => typeof (item as any).webkitGetAsEntry === "function");
    const fromFileList = Array.from(event.dataTransfer.files || []).map((file) => ({
        file,
        relativeDir: getFileRelativeDirectory(file),
    }));
    const skipped: SkippedCollectionItem[] = [];

    const collectedFromEntries: UploadCandidate[] = [];
    const discoveredDirectories = new Set<string>();

    const readDirectoryEntries = async (reader: any): Promise<any[]> => {
        const entries: any[] = [];
        let exhausted = false;
        while (true) {
            const chunk = await Promise.race([
                new Promise<any[]>((resolve) => {
                    reader.readEntries((batch: any[]) => resolve(batch || []), () => resolve([]));
                }),
                new Promise<any[]>((resolve) => {
                    window.setTimeout(() => {
                        exhausted = true;
                        resolve([]);
                    }, 2500);
                }),
            ]);
            if (exhausted) {
                break;
            }
            if (!chunk.length) {
                break;
            }
            for (const entry of chunk) {
                entries.push(entry);
            }
        }
        return entries;
    };

    const readFileFromEntry = async (entry: any): Promise<File | null> => {
        return new Promise<File | null>((resolve) => {
            try {
                entry.file(
                    (file: File) => resolve(file),
                    () => resolve(null)
                );
            } catch {
                resolve(null);
            }
        });
    };

    const traverseEntry = async (entry: any, parentDir: string) => {
        if (!entry) return;

        const safeParentDir = normalizeRelativeDir(parentDir);

        if (entry.isFile) {
            const file = await readFileFromEntry(entry);
            const filePath = normalizeJoinPath(safeParentDir, entry.name || "");
            if (!file) {
                skipped.push({
                    path: sanitizeRelativePath(filePath),
                    reason: "Unable to read dropped file from DataTransfer entry",
                });
                return;
            }

            collectedFromEntries.push({
                file,
                relativeDir: safeParentDir,
            });
            return;
        }

        if (!entry.isDirectory) {
            skipped.push({
                path: sanitizeRelativePath(normalizeJoinPath(safeParentDir, entry.name || "")),
                reason: "Unsupported dropped item type",
            });
            return;
        }

        try {
            const nextParent = normalizeRelativeDir(normalizeJoinPath(safeParentDir, entry.name || ""));
            if (nextParent) {
                discoveredDirectories.add(nextParent);
            }
            const reader = entry.createReader();
            const children = await readDirectoryEntries(reader);
            if (children.length === 0) {
                return;
            }
            for (const child of children) {
                await traverseEntry(child, nextParent);
            }
        } catch {
            skipped.push({
                path: sanitizeRelativePath(normalizeJoinPath(safeParentDir, entry.name || "")),
                reason: "Failed to traverse dropped directory",
            });
        }
    };

    if (supportsEntries) {
        for (const item of items) {
            const entry = (item as any).webkitGetAsEntry?.();
            if (!entry) continue;
            await traverseEntry(entry, "");
        }
    }

    const mergedByKey = new Map<string, UploadCandidate>();
    const looseFingerprints = new Map<string, string>();
    const allCandidates = [...collectedFromEntries, ...fromFileList];

    for (const candidate of allCandidates) {
        const relativeDir = normalizeRelativeDir(candidate.relativeDir || "");
        const normalizedCandidate: UploadCandidate = { file: candidate.file, relativeDir };
        const fullKey = uploadCandidateKey(normalizedCandidate);
        const looseKey = `${normalizedCandidate.file.name}:${normalizedCandidate.file.size}:${normalizedCandidate.file.lastModified}`;
        const existingFull = mergedByKey.get(fullKey);
        if (existingFull) {
            continue;
        }

        const preferredKey = looseFingerprints.get(looseKey);
        if (preferredKey) {
            const existingPreferred = mergedByKey.get(preferredKey);
            if (existingPreferred && !existingPreferred.relativeDir && relativeDir) {
                mergedByKey.delete(preferredKey);
                mergedByKey.set(fullKey, normalizedCandidate);
                looseFingerprints.set(looseKey, fullKey);
            } else if (existingPreferred && existingPreferred.relativeDir && !relativeDir) {
                continue;
            } else {
                mergedByKey.set(fullKey, normalizedCandidate);
            }
            continue;
        }

        mergedByKey.set(fullKey, normalizedCandidate);
        looseFingerprints.set(looseKey, fullKey);
    }

    const result: DropCollectionResult = {
        candidates: Array.from(mergedByKey.values()),
        directories: Array.from(discoveredDirectories),
        stats: {
            expected: event.dataTransfer.files?.length ?? 0,
            fromEntries: collectedFromEntries.length,
            fromFileList: fromFileList.length,
            merged: mergedByKey.size,
            skipped,
        },
    };

    if (import.meta.env.DEV) {
        console.info("[FileBrowser] Drop collection summary", {
            expected: result.stats.expected,
            fromEntries: result.stats.fromEntries,
            fromFileList: result.stats.fromFileList,
            merged: result.stats.merged,
            discoveredDirectories: result.directories.length,
            skippedCount: result.stats.skipped.length,
            skippedPreview: result.stats.skipped.slice(0, 10),
        });
    }

    return result;
}

function getDownloadFilename(contentDisposition: string | null, fallbackName: string) {
    if (!contentDisposition) return fallbackName;

    const filenameStarMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (filenameStarMatch?.[1]) {
        try {
            return decodeURIComponent(filenameStarMatch[1].trim().replace(/^"|"$/g, ""));
        } catch {
            // Ignore malformed filename and fallback below.
        }
    }

    const filenameMatch = contentDisposition.match(/filename\s*=\s*("?)([^";]+)\1/i);
    if (filenameMatch?.[2]) {
        return filenameMatch[2].trim();
    }

    return fallbackName;
}

function collectPathWithAncestors(path: string) {
    const segments = path.split("/").filter(Boolean);
    const paths: string[] = [];
    for (let i = 1; i <= segments.length; i += 1) {
        paths.push(segments.slice(0, i).join("/"));
    }
    return paths;
}

function toUploadCandidates(fileList: FileList | File[]) {
    return Array.from(fileList).map((file) => ({
        file,
        relativeDir: getFileRelativeDirectory(file),
    }));
}

function collectDirectoriesFromCandidates(candidates: UploadCandidate[]) {
    const directories = new Set<string>();
    for (const candidate of candidates) {
        const relativeDir = normalizeRelativeDir(candidate.relativeDir || "");
        if (!relativeDir) continue;
        const segments = relativeDir.split("/").filter(Boolean);
        for (let i = 1; i <= segments.length; i += 1) {
            directories.add(segments.slice(0, i).join("/"));
        }
    }
    return Array.from(directories);
}

function uploadCandidateKey(candidate: UploadCandidate) {
    return `${normalizeRelativeDir(candidate.relativeDir || "")}/${candidate.file.name}:${candidate.file.size}:${candidate.file.lastModified}`;
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

export function FileBrowser({ serverId, onEditFile, onServerFilesChanged }: FileBrowserProps) {
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
    const [queuedFolderCandidates, setQueuedFolderCandidates] = useState<UploadCandidate[]>([]);
    const [collectionWarning, setCollectionWarning] = useState("");
    const [lastUploadSummary, setLastUploadSummary] = useState<UploadSummary | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<FileDeleteConfirmState | null>(null);
    const [previewImage, setPreviewImage] = useState<FileInfo | null>(null);
    const dragDepthRef = useRef(0);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const folderInputRef = useRef<HTMLInputElement | null>(null);
    const batchFolderInputRef = useRef<HTMLInputElement | null>(null);
    const recentUploadTimeoutRef = useRef<number | null>(null);
    const uploadCancelRef = useRef<(() => void) | null>(null);
    const uploadCanceledRef = useRef(false);

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
            uploadCancelRef.current?.();
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
            onServerFilesChanged?.();
            void fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to create folder.");
        }
    };

    const executeDelete = async (file: FileInfo) => {
        setError("");
        try {
            await api.files.delete(serverId, file.path);
            onServerFilesChanged?.();
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
            onServerFilesChanged?.();
            void fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to rename item.");
        }
    };

    const uploadFiles = useCallback(async (
        input: FileList | File[] | UploadCandidate[],
        targetPath?: string,
        options?: {
            preserveRelativeDirectories?: boolean;
            expectedFiles?: number;
            skippedDuringCollection?: SkippedCollectionItem[];
            directoriesToEnsure?: string[];
        }
    ) => {
        const candidates: UploadCandidate[] = Array.isArray(input)
            ? (input.length > 0 && "file" in input[0]
                ? (input as UploadCandidate[])
                : (input as File[]).map((file) => ({ file })))
            : Array.from(input).map((file) => ({ file }));
        if (candidates.length === 0) return;

        const basePath = targetPath ?? normalizedCurrentPath;
        const uploadItems = candidates.map((candidate) => {
            const relativeDir = options?.preserveRelativeDirectories
                ? (candidate.relativeDir || getFileRelativeDirectory(candidate.file))
                : "";
            const destinationPath = normalizeJoinPath(basePath, relativeDir);
            const uploadPath = joinRelativePath(destinationPath, candidate.file.name);
            return {
                file: candidate.file,
                destinationPath,
                uploadPath,
            };
        });
        const firstPath = uploadItems[0]?.destinationPath || basePath;

        setUploading(true);
        uploadCanceledRef.current = false;
        setError("");
        setCollectionWarning("");
        setLastUploadSummary(null);
        setFolderDropTarget(null);
        setUploadState({
            targetPath: firstPath || "data",
            totalFiles: uploadItems.length,
            completedFiles: 0,
            currentFileName: uploadItems[0]?.file.name || "",
            percent: 0,
        });

        const expectedFiles = options?.expectedFiles ?? uploadItems.length;
        const skippedDuringCollection = options?.skippedDuringCollection || [];
        const candidateDirectories = options?.preserveRelativeDirectories
            ? collectDirectoriesFromCandidates(candidates)
            : [];
        const directoriesToEnsure = Array.from(new Set([
            ...(options?.directoriesToEnsure || []),
            ...candidateDirectories,
        ]));
        const successfulUploadPaths: string[] = [];
        let failedCount = 0;
        let completedCount = 0;

        if (directoriesToEnsure.length > 0) {
            for (const relativeDir of directoriesToEnsure) {
                const targetDir = normalizeJoinPath(basePath, relativeDir);
                try {
                    await api.files.mkdir(serverId, targetDir);
                } catch (err: any) {
                    if (uploadCanceledRef.current) break;
                    failedCount += 1;
                    setError(err?.message || `Failed to prepare folder "${targetDir}"`);
                }
            }
        }

        for (let index = 0; index < uploadItems.length; index += 1) {
            if (uploadCanceledRef.current) break;

            const item = uploadItems[index];
            let completed = false;
            let attempt = 0;

            while (!completed) {
                const uploadTask = api.files.uploadCancelable(serverId, item.file, item.destinationPath || undefined, (progress) => {
                    const overallPercent = Math.round(((index + progress.percent / 100) / uploadItems.length) * 100);
                    setUploadState({
                        targetPath: item.destinationPath || "data",
                        totalFiles: uploadItems.length,
                        completedFiles: completedCount,
                        currentFileName: item.file.name,
                        percent: overallPercent,
                    });
                });
                uploadCancelRef.current = uploadTask.cancel;

                try {
                    await uploadTask.promise;
                    completed = true;
                } catch (err: any) {
                    if (uploadCanceledRef.current) {
                        break;
                    }
                    const isRateLimited = err instanceof ApiError && err.status === 429;
                    if (isRateLimited && attempt < 3) {
                        attempt += 1;
                        const retryDelayMs = 1000 * attempt;
                        setError(`Rate limit reached, retrying "${item.file.name}" (${attempt}/3)...`);
                        await wait(retryDelayMs);
                        continue;
                    }

                    failedCount += 1;
                    setError(err?.message || `Failed to upload ${item.file.name}`);
                    break;
                } finally {
                    uploadCancelRef.current = null;
                }
            }

            if (completed) {
                completedCount += 1;
                successfulUploadPaths.push(item.uploadPath);
                setUploadState({
                    targetPath: item.destinationPath || "data",
                    totalFiles: uploadItems.length,
                    completedFiles: completedCount,
                    currentFileName: item.file.name,
                    percent: Math.round(((index + 1) / uploadItems.length) * 100),
                });
            }
        }

        if (basePath === normalizedCurrentPath && successfulUploadPaths.length > 0) {
            const uploadedPaths = Array.from(
                new Set(successfulUploadPaths.flatMap((path) => collectPathWithAncestors(path)))
            );
            setRecentlyUploadedPaths(uploadedPaths);
            if (recentUploadTimeoutRef.current) {
                window.clearTimeout(recentUploadTimeoutRef.current);
            }
            recentUploadTimeoutRef.current = window.setTimeout(() => {
                setRecentlyUploadedPaths([]);
                recentUploadTimeoutRef.current = null;
            }, 8000);
        }

        if (!uploadCanceledRef.current) {
            onServerFilesChanged?.();
            await fetchFiles();
        }

        const uploaded = Math.max(uploadItems.length - failedCount, 0);
        const missingBeforeUpload = Math.max(expectedFiles - uploadItems.length, 0);
        setLastUploadSummary({
            expected: expectedFiles,
            prepared: uploadItems.length,
            uploaded,
            failed: failedCount,
            missingBeforeUpload,
            skippedDuringCollection,
        });
        if (import.meta.env.DEV) {
            console.info("[FileBrowser] Upload summary", {
                expected: expectedFiles,
                prepared: uploadItems.length,
                uploaded,
                failed: failedCount,
                missingBeforeUpload,
                skippedDuringCollectionCount: skippedDuringCollection.length,
                skippedDuringCollectionPreview: skippedDuringCollection.slice(0, 10),
            });
        }

        if (uploadCanceledRef.current) {
            setError("Upload canceled.");
        } else if (failedCount > 0) {
            setError(`Upload completed with ${failedCount} failed file${failedCount > 1 ? "s" : ""}.`);
        } else if (skippedDuringCollection.length > 0 || missingBeforeUpload > 0) {
            setCollectionWarning("Upload finished for readable files only. Some dropped files were skipped before upload.");
        } else {
            setError("");
        }

        uploadCancelRef.current = null;
        uploadCanceledRef.current = false;
        setUploading(false);
        setUploadState(null);
    }, [normalizedCurrentPath, fetchFiles, serverId, onServerFilesChanged]);

    const handleCancelUpload = () => {
        if (!uploading) return;
        uploadCanceledRef.current = true;
        uploadCancelRef.current?.();
    };

    const handleUpload = async () => {
        fileInputRef.current?.click();
    };

    const handleUploadFolder = async () => {
        folderInputRef.current?.click();
    };

    const handleQueueFolders = async () => {
        batchFolderInputRef.current?.click();
    };

    const handleFileSelection = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles?.length) return;

        setCollectionWarning("");
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
        if (!droppedFiles?.length && !(e.dataTransfer.items?.length)) return;

        const { candidates, directories, stats } = await collectDropCandidates(e);
        if (!candidates.length) {
            setCollectionWarning("No readable files were found in the dropped folder.");
            return;
        }

        if (stats.merged < stats.expected) {
            const missing = stats.expected - stats.merged;
            setCollectionWarning(`Detected ${missing} dropped file${missing > 1 ? "s" : ""} missing before upload. Uploading readable files.`);
        } else {
            setCollectionWarning("");
        }

        const shouldPreserveRelativeDirectories = candidates.some((item) => Boolean(item.relativeDir));
        await uploadFiles(candidates, undefined, {
            preserveRelativeDirectories: shouldPreserveRelativeDirectories,
            expectedFiles: stats.expected,
            skippedDuringCollection: stats.skipped,
            directoriesToEnsure: directories,
        });
    };

    const handleFolderDrop = async (e: DragEvent<HTMLDivElement>, folderPath: string) => {
        e.preventDefault();
        e.stopPropagation();
        dragDepthRef.current = 0;
        setDragActive(false);
        setFolderDropTarget(null);

        const droppedFiles = e.dataTransfer.files;
        if (!droppedFiles?.length && !(e.dataTransfer.items?.length)) return;

        const { candidates, directories, stats } = await collectDropCandidates(e);
        if (!candidates.length) {
            setCollectionWarning("No readable files were found in the dropped folder.");
            return;
        }

        if (stats.merged < stats.expected) {
            const missing = stats.expected - stats.merged;
            setCollectionWarning(`Detected ${missing} dropped file${missing > 1 ? "s" : ""} missing before upload. Uploading readable files.`);
        } else {
            setCollectionWarning("");
        }

        const shouldPreserveRelativeDirectories = candidates.some((item) => Boolean(item.relativeDir));
        await uploadFiles(candidates, folderPath, {
            preserveRelativeDirectories: shouldPreserveRelativeDirectories,
            expectedFiles: stats.expected,
            skippedDuringCollection: stats.skipped,
            directoriesToEnsure: directories,
        });
    };

    const handleFolderSelection = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles?.length) return;

        const files = Array.from(selectedFiles);
        const emptyRelativeCount = files.filter((file) => !getFileRelativeDirectory(file)).length;
        if (files.length >= 5 && emptyRelativeCount / files.length > 0.35) {
            setCollectionWarning("Many selected files have missing relative paths. Folder structure may be flattened.");
        } else {
            setCollectionWarning("");
        }

        await uploadFiles(selectedFiles, undefined, {
            preserveRelativeDirectories: true,
            expectedFiles: files.length,
        });
        e.target.value = "";
    };

    const handleBatchFolderSelection = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles?.length) return;

        const added = toUploadCandidates(selectedFiles);
        setQueuedFolderCandidates((prev) => {
            const seen = new Set(prev.map(uploadCandidateKey));
            const merged = [...prev];
            for (const candidate of added) {
                const key = uploadCandidateKey(candidate);
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(candidate);
            }
            return merged;
        });
        e.target.value = "";
    };

    const handleUploadQueuedFolders = async () => {
        if (queuedFolderCandidates.length === 0) return;
        await uploadFiles(queuedFolderCandidates, undefined, {
            preserveRelativeDirectories: true,
            expectedFiles: queuedFolderCandidates.length,
        });
        setQueuedFolderCandidates([]);
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

    const downloadFromUrl = useCallback(async (url: string, fallbackName: string) => {
        const response = await fetch(url, { credentials: "include" });
        const responseContentType = response.headers.get("content-type") || "";

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const message =
                payload &&
                    typeof payload === "object" &&
                    "error" in payload &&
                    typeof payload.error === "string"
                    ? payload.error
                    : "Download failed.";
            throw new Error(message);
        }

        if (responseContentType.includes("application/json")) {
            const payload = await response.json().catch(() => null);
            const message =
                payload &&
                    typeof payload === "object" &&
                    "error" in payload &&
                    typeof payload.error === "string"
                    ? payload.error
                    : "Unexpected JSON response while downloading file.";
            throw new Error(message);
        }

        const filename = getDownloadFilename(
            response.headers.get("content-disposition"),
            fallbackName
        );
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    }, []);

    const triggerDownload = useCallback(async (path: string) => {
        const fallbackName = path.split("/").pop() || "download";
        await downloadFromUrl(api.files.downloadUrl(serverId, path), fallbackName);
    }, [downloadFromUrl, serverId]);

    const handleDownloadSelected = async () => {
        if (visibleSelectedItems.length === 0) return;

        setDownloading(true);
        setError("");

        try {
            for (const file of visibleSelectedItems) {
                await triggerDownload(file.path);
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
            onServerFilesChanged?.();
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

    const handleDownloadAll = async () => {
        setDownloading(true);
        setError("");
        try {
            await downloadFromUrl(api.files.downloadAllUrl(serverId), "server-data.tar.gz");
        } catch (err: any) {
            setError(err.message || "Failed to download data folder.");
        } finally {
            setDownloading(false);
        }
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
            <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFolderSelection}
                {...({ webkitdirectory: "", directory: "" } as any)}
            />
            <input
                ref={batchFolderInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleBatchFolderSelection}
                {...({ webkitdirectory: "", directory: "" } as any)}
            />
            {error && (
                <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}
            {collectionWarning && (
                <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {collectionWarning}
                </div>
            )}
            {lastUploadSummary && (
                <div className="mb-4 rounded-2xl border border-surface-700/70 bg-surface-900/55 px-4 py-3 text-xs text-surface-300">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-surface-700/70 bg-surface-900 px-2.5 py-1">
                            Expected: {lastUploadSummary.expected}
                        </span>
                        <span className="rounded-full border border-surface-700/70 bg-surface-900 px-2.5 py-1">
                            Prepared: {lastUploadSummary.prepared}
                        </span>
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-emerald-200">
                            Uploaded: {lastUploadSummary.uploaded}
                        </span>
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-200">
                            Failed: {lastUploadSummary.failed}
                        </span>
                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-200">
                            Skipped during collection: {lastUploadSummary.skippedDuringCollection.length}
                        </span>
                    </div>
                    {(lastUploadSummary.missingBeforeUpload > 0 || lastUploadSummary.skippedDuringCollection.length > 0) && (
                        <div className="mt-2 space-y-1 text-amber-200">
                            {lastUploadSummary.missingBeforeUpload > 0 && (
                                <p>
                                    Missing before upload: {lastUploadSummary.missingBeforeUpload} file{lastUploadSummary.missingBeforeUpload > 1 ? "s" : ""}.
                                </p>
                            )}
                            {lastUploadSummary.skippedDuringCollection.length > 0 && (
                                <>
                                    <p>Skipped items preview:</p>
                                    <ul className="list-disc space-y-0.5 pl-4 text-amber-100">
                                        {lastUploadSummary.skippedDuringCollection.slice(0, 10).map((item, idx) => (
                                            <li key={`${item.path || "unknown"}-${idx}`}>
                                                {item.path || "(unknown path)"} - {item.reason}
                                            </li>
                                        ))}
                                    </ul>
                                    {lastUploadSummary.skippedDuringCollection.length > 10 && (
                                        <p>
                                            ...and {lastUploadSummary.skippedDuringCollection.length - 10} more skipped items.
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
            {queuedFolderCandidates.length > 0 && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-xs text-surface-200">
                    <span className="rounded-full border border-brand-500/30 bg-brand-500/15 px-2.5 py-1 font-medium text-brand-200">
                        {queuedFolderCandidates.length} files queued from folders
                    </span>
                    <button
                        type="button"
                        onClick={() => void handleUploadQueuedFolders()}
                        disabled={uploading}
                        className="rounded-lg border border-brand-500/30 bg-brand-500/15 px-2.5 py-1 font-medium text-brand-100 transition-colors hover:bg-brand-500/20 disabled:opacity-50"
                    >
                        Upload queued folders
                    </button>
                    <button
                        type="button"
                        onClick={() => setQueuedFolderCandidates([])}
                        disabled={uploading}
                        className="rounded-lg border border-surface-700/70 bg-surface-900/60 px-2.5 py-1 text-surface-300 transition-colors hover:bg-surface-800 disabled:opacity-50"
                    >
                        Clear queue
                    </button>
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
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-brand-200">
                                {uploadState.percent}%
                            </span>
                            <button
                                type="button"
                                onClick={handleCancelUpload}
                                className="rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-200 transition-colors hover:bg-red-500/15"
                            >
                                Cancel upload
                            </button>
                        </div>
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
                    <IconTooltip label="Upload folder">
                        <button
                            onClick={handleUploadFolder}
                            className="btn-icon text-surface-400 hover:text-surface-200"
                            aria-label="Upload folder"
                        >
                            <FolderUp size={16} />
                        </button>
                    </IconTooltip>
                    <IconTooltip label="Queue folders">
                        <button
                            onClick={handleQueueFolders}
                            className="btn-icon text-surface-400 hover:text-surface-200"
                            aria-label="Queue folders"
                        >
                            <Folders size={16} />
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
                                                <button
                                                    type="button"
                                                    className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                                    aria-label={`Download ${file.name}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setError("");
                                                        setDownloading(true);
                                                        void triggerDownload(file.path)
                                                            .catch((err: any) => {
                                                                setError(err.message || "Failed to download file.");
                                                            })
                                                            .finally(() => {
                                                                setDownloading(false);
                                                            });
                                                    }}
                                                >
                                                    <Download size={12} />
                                                </button>
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
