import { useState, useEffect, useRef, useCallback } from "react";
import { ClipboardCopy, Send, Trash2 } from "lucide-react";
import { api, type ConsoleEvent, type ConsoleCommandMessage } from "@/lib/api";

interface ConsoleProps {
    serverId: string;
}

interface LogEntry {
    type: ConsoleEvent["type"] | "command";
    data: string;
    timestamp?: string;
    command?: string;
}

type LogLevel = "error" | "warning" | "info" | "message" | "command" | "command_result";

const thaiDateTimeFormatter = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

export function Console({ serverId }: ConsoleProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [command, setCommand] = useState("");
    const [connected, setConnected] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [consoleHeight, setConsoleHeight] = useState(500);
    const [copySuccess, setCopySuccess] = useState(false);
    const wsRef = useRef<ReturnType<typeof api.console.connect> | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const isResizingRef = useRef(false);

    const CONSOLE_MIN_HEIGHT = 320;
    const CONSOLE_MAX_HEIGHT_OFFSET = 180;

    const scrollToBottom = useCallback(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    const pushLogs = useCallback((entries: LogEntry[]) => {
        if (entries.length === 0) return;
        setLogs((prev) => {
            const next = [...prev, ...entries];
            return next.length > 1000 ? next.slice(-1000) : next;
        });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [logs, scrollToBottom]);

    useEffect(() => {
        const ws = api.console.connect(serverId);
        wsRef.current = ws;

        ws.on("open", () => {
            setConnected(true);
            pushLogs([{ type: "info", data: "Connected to server console", timestamp: new Date().toISOString() }]);
        });

        ws.subscribe((event) => {
            const msg = event.data as ConsoleEvent;
            const timestamp = "timestamp" in msg && msg.timestamp ? msg.timestamp : new Date().toISOString();

            if (msg.type === "log") {
                const lineEntries = msg.data
                    .split("\n")
                    .map((line) => line.trimEnd())
                    .filter((line) => line.length > 0)
                    .map((line) => ({
                        type: "log" as const,
                        data: line,
                        timestamp,
                    }));
                pushLogs(lineEntries);
                return;
            }

            pushLogs([{ ...msg, timestamp }]);
        });

        ws.on("error", () => {
            pushLogs([{ type: "error", data: "WebSocket error", timestamp: new Date().toISOString() }]);
        });

        ws.on("close", () => {
            setConnected(false);
            pushLogs([{ type: "info", data: "Disconnected from server console", timestamp: new Date().toISOString() }]);
        });

        return () => {
            ws.close();
        };
    }, [pushLogs, serverId]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!isResizingRef.current) return;

            const maxHeight = Math.max(CONSOLE_MIN_HEIGHT, window.innerHeight - CONSOLE_MAX_HEIGHT_OFFSET);
            const nextHeight = Math.min(maxHeight, Math.max(CONSOLE_MIN_HEIGHT, window.innerHeight - event.clientY - 40));
            setConsoleHeight(nextHeight);
        };

        const handlePointerUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
        };
    }, []);

    const sendCommand = () => {
        if (!command.trim() || !wsRef.current || wsRef.current.ws.readyState !== WebSocket.OPEN) return;

        wsRef.current.send({ type: "command", command: command.trim() } satisfies ConsoleCommandMessage);
        setLogs((prev) => [
            ...prev,
            { type: "command", data: command.trim(), timestamp: new Date().toISOString() },
        ]);
        setCommandHistory((prev) => [command.trim(), ...prev.slice(0, 50)]);
        setHistoryIndex(-1);
        setCommand("");
        inputRef.current?.focus();
    };

    const copyLogs = async () => {
        if (logs.length === 0) return;

        const text = logs
            .map((entry) => {
                const timestamp = formatThaiTimestamp(entry.timestamp);
                const prefix = timestamp ? `[${timestamp}] ` : "";
                if (entry.type === "command_result" && entry.command) {
                    return `${prefix}[${entry.command}] ${entry.data}`;
                }
                if (entry.type === "command") {
                    return `${prefix}> ${entry.data}`;
                }
                return `${prefix}${entry.data}`;
            })
            .join("\n");

        try {
            await navigator.clipboard.writeText(text);
            setCopySuccess(true);
            window.setTimeout(() => setCopySuccess(false), 1400);
        } catch {
            setCopySuccess(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            sendCommand();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                const newIdx = historyIndex + 1;
                setHistoryIndex(newIdx);
                setCommand(commandHistory[newIdx]);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIdx = historyIndex - 1;
                setHistoryIndex(newIdx);
                setCommand(commandHistory[newIdx]);
            } else {
                setHistoryIndex(-1);
                setCommand("");
            }
        }
    };

    const getLogLevel = (entry: LogEntry): LogLevel => {
        if (entry.type === "command" || entry.type === "command_result") {
            return entry.type;
        }
        if (entry.type === "error") {
            return "error";
        }
        if (entry.type === "info") {
            return "info";
        }

        const lowerData = entry.data.toLowerCase();
        if (/\b(error|exception|fatal|failed)\b/.test(lowerData)) {
            return "error";
        }
        if (/\b(warn|warning)\b/.test(lowerData)) {
            return "warning";
        }
        if (/\b(info|notice|debug)\b/.test(lowerData)) {
            return "info";
        }
        return "message";
    };

    const getLogColor = (entry: LogEntry) => {
        switch (getLogLevel(entry)) {
            case "error":
                return "text-red-300";
            case "warning":
                return "text-amber-300";
            case "info":
                return "text-sky-300";
            case "message":
                return "text-surface-200";
            case "command":
                return "text-amber-400";
            case "command_result":
                return "text-emerald-400";
            default:
                return "text-surface-300";
        }
    };

    const formatThaiTimestamp = (timestamp?: string) => {
        if (!timestamp) return "";
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) return "";
        return thaiDateTimeFormatter.format(parsed);
    };

    const startResize = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
    };

    return (
        <div
            className="flex flex-col overflow-hidden rounded-lg border border-surface-700/50 bg-surface-900/40"
            style={{ height: `${consoleHeight}px` }}
        >
            <button
                type="button"
                onPointerDown={startResize}
                className="group flex h-5 items-center justify-center border-b border-surface-700/50 bg-surface-900/80 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-300"
                aria-label="Resize console"
                title="Drag to resize console"
            >
                <span className="h-1 w-12 rounded-full bg-current/60 transition-colors group-hover:bg-current" />
            </button>
            {/* Log area */}
            <div className="flex-1 overflow-y-auto bg-surface-900 p-3 font-mono text-xs leading-relaxed custom-scrollbar">
                {logs.length === 0 && (
                    <div className="text-surface-600 text-center py-8">
                        {connected ? "Waiting for logs..." : "Connecting to server..."}
                    </div>
                )}
                {logs.map((entry, i) => (
                    <div key={i} className={`${getLogColor(entry)} whitespace-pre-wrap break-all`}>
                        {entry.timestamp && (
                            <span className="mr-2 inline-block text-[10px] text-surface-500">
                                [{formatThaiTimestamp(entry.timestamp)}]
                            </span>
                        )}
                        {entry.type === "command" && (
                            <span className="text-surface-600">&gt; </span>
                        )}
                        {entry.type === "command_result" && entry.command && (
                            <span className="text-surface-600">[{entry.command}] </span>
                        )}
                        {entry.data}
                    </div>
                ))}
                <div ref={logsEndRef} />
            </div>

            {/* Input area */}
            <div className="flex flex-wrap items-center gap-2 border-t border-surface-700/50 bg-surface-800 px-3 py-2">
                <span className="text-surface-600 text-xs font-mono">&gt;</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={connected ? "Enter RCON command..." : "Not connected"}
                    disabled={!connected}
                    className="min-w-[180px] flex-1 bg-transparent text-sm font-mono text-surface-200 placeholder:text-surface-600 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => void copyLogs()}
                        className="btn-icon text-surface-600 hover:text-surface-400 p-1"
                        title={copySuccess ? "Copied" : "Copy logs"}
                        disabled={logs.length === 0}
                    >
                        <ClipboardCopy size={13} />
                    </button>
                    <button
                        onClick={() => setLogs([])}
                        className="btn-icon text-surface-600 hover:text-surface-400 p-1"
                        title="Clear logs"
                    >
                        <Trash2 size={13} />
                    </button>
                    <button
                        onClick={sendCommand}
                        disabled={!connected || !command.trim()}
                        className="btn-icon text-brand-400 hover:text-brand-300 p-1 disabled:opacity-30"
                        title="Send command"
                    >
                        <Send size={13} />
                    </button>
                </div>
                <div
                    className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
                    title={connected ? "Connected" : "Disconnected"}
                />
            </div>
        </div>
    );
}
