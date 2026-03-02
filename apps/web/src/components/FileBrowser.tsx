import { useState, useEffect, useCallback } from "react";
import { api, type FileInfo } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import {
    Folder, File, ArrowLeft, Plus, Trash2, Download, Upload,
    FolderPlus, Edit3, X, Check,
} from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface FileBrowserProps {
    serverId: string;
    onEditFile: (path: string) => void;
}

export function FileBrowser({ serverId, onEditFile }: FileBrowserProps) {
    const [currentPath, setCurrentPath] = useState("");
    const [files, setFiles] = useState<FileInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [renamingFile, setRenamingFile] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [error, setError] = useState("");

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await api.files.list(serverId, currentPath || undefined);
            setFiles(res.files);
        } catch (err) {
            setError("Failed to load files.");
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [serverId, currentPath]);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const navigateToFolder = (path: string) => {
        setCurrentPath(path);
    };

    const navigateUp = () => {
        const parts = currentPath.split("/").filter(Boolean);
        parts.pop();
        setCurrentPath(parts.join("/"));
    };

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const path = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
        setError("");
        try {
            await api.files.mkdir(serverId, path);
            setNewFolderName("");
            setShowNewFolder(false);
            fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to create folder.");
        }
    };

    const handleDelete = async (file: FileInfo) => {
        const confirmed = window.confirm(
            `Delete ${file.isDirectory ? "folder" : "file"} "${file.name}"?`
        );
        if (!confirmed) return;
        setError("");
        try {
            await api.files.delete(serverId, file.path);
            fetchFiles();
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
            fetchFiles();
        } catch (err: any) {
            setError(err.message || "Failed to rename item.");
        }
    };

    const handleUpload = async () => {
        const input = document.createElement("input");
        input.type = "file";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append("file", file);
            if (currentPath) formData.append("path", currentPath);

            setError("");
            const res = await fetch(`/api/servers/${serverId}/files/upload`, {
                method: "POST",
                credentials: "include",
                body: formData,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || "Failed to upload file.");
                return;
            }
            fetchFiles();
        };
        input.click();
    };

    const handleFileClick = (file: FileInfo) => {
        if (file.isDirectory) {
            navigateToFolder(file.path);
        } else {
            onEditFile(file.path);
        }
    };

    const breadcrumbs = currentPath ? currentPath.split("/").filter(Boolean) : [];

    const isTextFile = (name: string) => {
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const textExts = [
            "txt", "yml", "yaml", "json", "properties", "cfg", "conf", "ini",
            "log", "md", "toml", "xml", "html", "css", "js", "ts", "java",
            "sh", "bat", "command", "mcmeta", "csv",
        ];
        return textExts.includes(ext);
    };

    return (
        <div className="relative">
            {loading && <LoadingOverlay message="Loading files" subtle />}
            {error && (
                <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            )}
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm">
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

                <div className="flex items-center gap-2">
                    <button onClick={handleUpload} className="btn-icon text-surface-400 hover:text-surface-200" title="Upload">
                        <Upload size={16} />
                    </button>
                    <button onClick={() => setShowNewFolder(true)} className="btn-icon text-surface-400 hover:text-surface-200" title="New folder">
                        <FolderPlus size={16} />
                    </button>
                </div>
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
                    <button onClick={handleCreateFolder} className="btn-icon text-brand-400">
                        <Check size={14} />
                    </button>
                    <button onClick={() => setShowNewFolder(false)} className="btn-icon text-surface-500">
                        <X size={14} />
                    </button>
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

            {/* File list */}
            {!loading && files.length === 0 ? (
                <div className="text-center py-8 text-surface-500 text-sm">
                    <Folder size={32} className="mx-auto mb-2 opacity-50" />
                    <p>Empty directory</p>
                </div>
            ) : (
                <div className="space-y-0.5 grid grid-cols-1">
                    {files.map((file) => (
                        <div
                            key={file.path}
                            className="items-center gap-3 px-2 py-2 rounded-lg hover:bg-surface-800/50 group cursor-pointer transition-colors grid grid-cols-[1fr_80px_110px]"
                            onClick={() => handleFileClick(file)}
                        >
                            <div className="items-center flex gap-2 flex-1 w-full">
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
                                    <span className="flex-1 text-sm text-surface-200 truncate">
                                        {file.name}
                                    </span>
                                )}
                            </div>

                            <div className="h-full">
                                {!file.isDirectory && (
                                    <span className="text-xs text-surface-600">
                                        {formatBytes(file.size)}
                                    </span>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="justify-center flex">
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                    <button
                                        onClick={() => {
                                            setRenamingFile(file.path);
                                            setRenameValue(file.name);
                                        }}
                                        className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                        title="Rename"
                                    >
                                        <Edit3 size={12} />
                                    </button>
                                    {!file.isDirectory && isTextFile(file.name) && (
                                        <button
                                            onClick={() => onEditFile(file.path)}
                                            className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                            title="Edit"
                                        >
                                            <Edit3 size={12} />
                                        </button>
                                    )}
                                    {!file.isDirectory && (
                                        <a
                                            href={api.files.downloadUrl(serverId, file.path)}
                                            className="btn-icon text-surface-500 hover:text-surface-300 p-1"
                                            title="Download"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Download size={12} />
                                        </a>
                                    )}
                                    <button
                                        onClick={() => handleDelete(file)}
                                        className="btn-icon text-surface-500 hover:text-red-400 p-1"
                                        title="Delete"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
