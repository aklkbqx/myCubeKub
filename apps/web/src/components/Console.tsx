import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Trash2 } from "lucide-react";

interface ConsoleProps {
    serverId: string;
}

interface LogEntry {
    type: "log" | "error" | "info" | "command" | "command_result";
    data: string;
    timestamp?: string;
    command?: string;
}

export function Console({ serverId }: ConsoleProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [command, setCommand] = useState("");
    const [connected, setConnected] = useState(false);
    const [commandHistory, setCommandHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [logs, scrollToBottom]);

    useEffect(() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/api/servers/${serverId}/console`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setLogs((prev) => [...prev, { type: "info", data: "Connected to server console" }]);
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as LogEntry;
                setLogs((prev) => {
                    const next = [...prev, msg];
                    // Keep last 1000 lines
                    return next.length > 1000 ? next.slice(-1000) : next;
                });
            } catch {
                setLogs((prev) => [...prev, { type: "log", data: event.data }]);
            }
        };

        ws.onerror = () => {
            setLogs((prev) => [...prev, { type: "error", data: "WebSocket error" }]);
        };

        ws.onclose = () => {
            setConnected(false);
            setLogs((prev) => [...prev, { type: "info", data: "Disconnected from server console" }]);
        };

        return () => {
            ws.close();
        };
    }, [serverId]);

    const sendCommand = () => {
        if (!command.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        wsRef.current.send(JSON.stringify({ type: "command", command: command.trim() }));
        setLogs((prev) => [
            ...prev,
            { type: "command", data: command.trim(), timestamp: new Date().toISOString() },
        ]);
        setCommandHistory((prev) => [command.trim(), ...prev.slice(0, 50)]);
        setHistoryIndex(-1);
        setCommand("");
        inputRef.current?.focus();
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

    const getLogColor = (entry: LogEntry) => {
        switch (entry.type) {
            case "error":
                return "text-red-400";
            case "info":
                return "text-blue-400";
            case "command":
                return "text-amber-400";
            case "command_result":
                return "text-emerald-400";
            default:
                return "text-surface-300";
        }
    };

    return (
        <div className="flex flex-col h-[500px]">
            {/* Log area */}
            <div className="flex-1 bg-surface-900 rounded-t-lg overflow-y-auto p-3 font-mono text-xs leading-relaxed custom-scrollbar">
                {logs.length === 0 && (
                    <div className="text-surface-600 text-center py-8">
                        {connected ? "Waiting for logs..." : "Connecting to server..."}
                    </div>
                )}
                {logs.map((entry, i) => (
                    <div key={i} className={`${getLogColor(entry)} whitespace-pre-wrap break-all`}>
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
            <div className="flex items-center gap-2 bg-surface-800 rounded-b-lg px-3 py-2 border-t border-surface-700/50">
                <span className="text-surface-600 text-xs font-mono">&gt;</span>
                <input
                    ref={inputRef}
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={connected ? "Enter RCON command..." : "Not connected"}
                    disabled={!connected}
                    className="flex-1 bg-transparent text-surface-200 font-mono text-sm placeholder:text-surface-600 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center gap-1">
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
