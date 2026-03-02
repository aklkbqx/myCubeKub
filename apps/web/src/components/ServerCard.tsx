import { Play, Square, RotateCcw, Server, AlertTriangle, Trash2, Hammer } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { ServerWithStatus } from "@/lib/api";
import { useState } from "react";

interface ServerCardProps {
  server: ServerWithStatus;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  connectionIp?: string;
}

export function ServerCard({ server, onStart, onStop, onRestart, onDelete, connectionIp }: ServerCardProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleAction = async (action: string, fn: (id: string) => Promise<void>) => {
    setLoading(action);
    try {
      await fn(server.id);
    } catch (err) {
      throw err;
    } finally {
      setLoading(null);
    }
  };

  const isRunning = server.status === "running";
  const isServerMissing = server.status === "not_found";
  const connectionAddress = `${connectionIp || "localhost"}:${server.port}`;

  return (
    <div className="minecraft-card glass-hover group h-full p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-emerald-400 to-cyan-400 opacity-80" />

      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/20 bg-brand-600/15 text-brand-300 group-hover:bg-brand-600/25 transition-colors">
              <Server size={20} />
            </div>
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-surface-50">{server.name}</h3>
            <p className="mt-1 break-all text-xs uppercase tracking-[0.2em] text-surface-400">
              {server.type} · v{server.version} · {connectionAddress}
            </p>
          </div>
        </div>
        <StatusBadge status={server.status} className="self-start sm:self-auto" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="block-chip">{connectionAddress}</div>
        <div className="block-chip">Memory {Math.round(server.memoryMb / 1024)} GB</div>
        <div className="block-chip">
          {isServerMissing ? "Server Missing" : isRunning ? "Live Session" : "Offline World"}
        </div>
      </div>

      {/* Stats */}
      {isServerMissing ? (
        <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-amber-200">
            <AlertTriangle size={16} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]">Server instance not found</p>
          </div>
          <p className="text-sm leading-6 text-amber-100/85">
            The Minecraft server record still exists, but the running server instance is missing. You can recreate it or remove the record.
          </p>
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-1 rounded-xl border border-surface-800 bg-surface-950/40 px-3 py-3 text-xs text-surface-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Allocated: {server.memoryMb} MB</span>
          <span>{isRunning ? "Server online" : "Ready to start"}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 border-t border-surface-700/50 pt-4" onClick={(e) => e.stopPropagation()}>
        {isServerMissing ? (
          <>
            <button
              onClick={() => handleAction("recreate", onStart)}
              disabled={loading !== null}
              className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {loading === "recreate" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Hammer size={14} />
              )}
              Recreate
            </button>
            <button
              onClick={() => onDelete && handleAction("delete", onDelete)}
              disabled={loading !== null || !onDelete}
              className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {loading === "delete" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          </>
        ) : !isRunning ? (
          <button
            onClick={() => handleAction("start", onStart)}
            disabled={loading !== null}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading === "start" ? (
              <span className="animate-spin">⟳</span>
            ) : (
              <Play size={14} />
            )}
            Start
          </button>
        ) : (
          <>
            <button
              onClick={() => handleAction("stop", onStop)}
              disabled={loading !== null}
              className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {loading === "stop" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <Square size={14} />
              )}
              Stop
            </button>
            <button
              onClick={() => handleAction("restart", onRestart)}
              disabled={loading !== null}
              className="btn-secondary flex min-w-[52px] items-center justify-center gap-2 text-sm px-3 disabled:opacity-50"
            >
              {loading === "restart" ? (
                <span className="animate-spin">⟳</span>
              ) : (
                <RotateCcw size={14} />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
