import { ArrowLeft, Check, ChevronDown, Copy, Cpu, FileText, FolderOpen, Layers3, MemoryStick, Play, RotateCcw, Server, Settings, Square, Terminal } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { cn, formatBytes } from "@/lib/utils";
import type { ServerWithStatus } from "@/lib/api";
import type { ServerDetailTab } from "@/components/server-detail/server-detail-types";

interface UsageTone {
  label: string;
  textClassName: string;
  fillClassName: string;
}

interface ServerDetailShellSectionProps {
  server: ServerWithStatus;
  connectionAddress: string;
  connectionCopied: boolean;
  restartNotice: string;
  mobileHeaderOpen: boolean;
  setMobileHeaderOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  handleBackNavigation: () => void;
  handleCopyConnection: () => void | Promise<void>;
  isRunning: boolean;
  actionLoading: string | null;
  onStart: () => void;
  onRestart: () => void;
  onStop: () => void;
  formatPercent: (value: number) => string;
  cpuUsageTone: UsageTone | null;
  memoryUsageTone: UsageTone | null;
  activeTab: ServerDetailTab;
  onTabChange: (tab: ServerDetailTab) => void;
}

export function ServerDetailShellSection({
  server,
  connectionAddress,
  connectionCopied,
  restartNotice,
  mobileHeaderOpen,
  setMobileHeaderOpen,
  handleBackNavigation,
  handleCopyConnection,
  isRunning,
  actionLoading,
  onStart,
  onRestart,
  onStop,
  formatPercent,
  cpuUsageTone,
  memoryUsageTone,
  activeTab,
  onTabChange,
}: ServerDetailShellSectionProps) {
  const showRestartCallout = isRunning && restartNotice.trim().length > 0;

  return (
    <>
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
                  <Server size={28} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/75">Server Workspace</p>
                      <h1 className="truncate text-xl font-bold leading-tight text-surface-50 sm:text-3xl">{server.name}</h1>
                    </div>

                    <div className="hidden max-w-full items-center gap-2 rounded-xl border border-brand-500/15 bg-brand-500/8 px-3 py-2 text-xs sm:text-sm md:inline-flex">
                      <span className="text-surface-500">Address</span>
                      <span className="min-w-0 truncate font-mono text-brand-200">{connectionAddress}</span>
                    </div>
                    <StatusBadge status={server.status} className="hidden shrink-0 md:block" />
                  </div>

                  <div className="mt-2 hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs text-surface-400 sm:gap-x-3 sm:text-sm md:flex">
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
                      {showRestartCallout && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                          Changes detected. Restart to apply them.
                        </div>
                      )}
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
                            onStart();
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
                              onRestart();
                              setMobileHeaderOpen(false);
                            }}
                            disabled={actionLoading !== null}
                            className={cn(
                              "inline-flex min-h-[42px] items-center justify-center gap-2 text-sm",
                              showRestartCallout
                                ? "btn-restart-alert animate-restart-nudge"
                                : "btn-secondary"
                            )}
                          >
                            <RotateCcw size={14} />
                            {showRestartCallout ? "Restart Required" : "Restart"}
                          </button>
                          <button
                            onClick={() => {
                              onStop();
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
                  onClick={onStart}
                  disabled={actionLoading !== null}
                  className="hidden btn-primary min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex"
                >
                  <Play size={14} />
                  Start Server
                </button>
              ) : (
                <>
                  <div className="relative hidden sm:flex">
                    {showRestartCallout && (
                      <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+0.35rem)]">
                        <div className="panel-label whitespace-nowrap border-amber-500/35 bg-amber-500/12 text-amber-100 shadow-lg shadow-amber-950/20">
                          <span className="h-2 w-2 rounded-full bg-amber-300 animate-pulse" />
                          Restart Needed
                        </div>
                      </div>
                    )}
                    <button
                      onClick={onRestart}
                      disabled={actionLoading !== null}
                      className={cn(
                        "min-h-[44px] items-center justify-center gap-2 text-sm sm:inline-flex",
                        showRestartCallout
                          ? "btn-restart-alert animate-restart-nudge"
                          : "btn-secondary"
                      )}
                    >
                      <RotateCcw size={14} />
                      {showRestartCallout ? "Apply Changes With Restart" : "Restart"}
                    </button>
                  </div>
                  <button
                    onClick={onStop}
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

      <div className="page-shell py-8">
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
                  <p className="min-w-0 break-all text-sm font-semibold text-surface-100 sm:text-lg">{connectionAddress}</p>
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

        {isRunning && server.stats && (
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card space-y-3">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-2 text-blue-300">
                  <Cpu size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-surface-500">CPU Usage</p>
                  <p className="text-2xl font-semibold text-surface-100">{formatPercent(server.stats.cpuPercent)}</p>
                  <p className={cn("text-sm font-medium", cpuUsageTone?.textClassName)}>{cpuUsageTone?.label} load right now</p>
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
                  <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Memory Usage</p>
                  <p className="text-2xl font-semibold text-surface-100">{formatBytes(server.stats.memoryUsage)}</p>
                  <p className="text-sm text-surface-400">of {formatBytes(server.stats.memoryLimit)} allocated</p>
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

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-fit sm:px-0">
          <div className="flex min-w-max gap-2 rounded-2xl border border-surface-700/60 bg-surface-900/55 p-2 backdrop-blur-xl">
            <button onClick={() => onTabChange("settings")} className={`game-tab ${activeTab === "settings" ? "game-tab-active" : "game-tab-idle"}`}>
              <Settings size={14} /> Settings
            </button>
            <button onClick={() => onTabChange("properties")} className={`game-tab ${activeTab === "properties" ? "game-tab-active" : "game-tab-idle"}`}>
              <FileText size={14} /> Properties
            </button>
            <button onClick={() => onTabChange("resourcePacks")} className={`game-tab ${activeTab === "resourcePacks" ? "game-tab-active" : "game-tab-idle"}`}>
              <Layers3 size={14} /> Resource Packs
            </button>
            <button onClick={() => onTabChange("files")} className={`game-tab ${activeTab === "files" ? "game-tab-active" : "game-tab-idle"}`}>
              <FolderOpen size={14} /> Files
            </button>
            <button onClick={() => onTabChange("console")} className={`game-tab ${activeTab === "console" ? "game-tab-active" : "game-tab-idle"}`}>
              <Terminal size={14} /> Console
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
