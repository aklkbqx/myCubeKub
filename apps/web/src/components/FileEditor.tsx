import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Save, X } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";

interface FileEditorProps {
    serverId: string;
    filePath: string;
    onClose: () => void;
}

export function FileEditor({ serverId, filePath, onClose }: FileEditorProps) {
    const [content, setContent] = useState("");
    const [originalContent, setOriginalContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.files.read(serverId, filePath);
                setContent(res.content);
                setOriginalContent(res.content);
            } catch (err) {
                console.error("Failed to load file:", err);
                setContent("(failed to load file)");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [serverId, filePath]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.files.write(serverId, filePath, content);
            setOriginalContent(content);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error("Failed to save:", err);
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = content !== originalContent;
    const fileName = filePath.split("/").pop() || filePath;

    return (
        <div className="relative flex flex-col h-full">
            {(loading || saving) && (
                <LoadingOverlay
                    message={saving ? "Saving file" : "Loading editor"}
                    subtle
                />
            )}
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-surface-700/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="truncate text-sm font-medium text-surface-200">{fileName}</span>
                    <span className="truncate text-xs text-surface-600">{filePath}</span>
                    {hasChanges && (
                        <span className="text-xs text-amber-400">● unsaved</span>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                        <Save size={13} />
                        {saved ? "Saved ✓" : saving ? "Saving..." : "Save"}
                    </button>
                    <button onClick={onClose} className="btn-icon text-surface-400 hover:text-surface-200">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Editor */}
            {!loading && (
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="flex-1 w-full bg-surface-900 p-3 text-sm leading-relaxed text-surface-200 resize-none focus:outline-none sm:p-4"
                    spellCheck={false}
                    onKeyDown={(e) => {
                        // Ctrl/Cmd + S to save
                        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                            e.preventDefault();
                            handleSave();
                        }
                        // Tab inserts 2 spaces
                        if (e.key === "Tab") {
                            e.preventDefault();
                            const start = e.currentTarget.selectionStart;
                            const end = e.currentTarget.selectionEnd;
                            const newContent = content.substring(0, start) + "  " + content.substring(end);
                            setContent(newContent);
                            // Move cursor after tab
                            setTimeout(() => {
                                e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
                            }, 0);
                        }
                    }}
                />
            )}
        </div>
    );
}
