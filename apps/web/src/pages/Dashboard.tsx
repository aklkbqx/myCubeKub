import { useState, useEffect, useCallback } from "react";
import { api, type ServerWithStatus, type CreateServerData } from "@/lib/api";
import { ServerCard } from "@/components/ServerCard";
import { CreateServerModal } from "@/components/CreateServerModal";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { Blocks, RefreshCw, LogOut, Server, Plus, ShieldCheck, Wrench, RadioTower } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function Dashboard() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [connectionIp, setConnectionIp] = useState("localhost");
  const [actionError, setActionError] = useState("");

  const fetchServers = useCallback(async () => {
    try {
      const { servers } = await api.servers.list();
      setServers(servers);
    } catch {
      // If 401, redirect to login
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const fetchUser = useCallback(async () => {
    try {
      const { user } = await api.auth.me();
      setUser(user);
    } catch {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

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
      await fetchConfig();
      await fetchUser();
      await fetchServers();
      setLoading(false);
    };
    init();

    // Auto-refresh every 10s
    const interval = setInterval(fetchServers, 10_000);
    return () => clearInterval(interval);
  }, [fetchConfig, fetchUser, fetchServers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchServers();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await api.auth.logout();
    navigate("/login", { replace: true });
  };

  const handleStart = async (id: string) => {
    setActionError("");
    try {
      await api.servers.start(id);
      await fetchServers();
    } catch (err: any) {
      setActionError(err.message || "Failed to start server");
    }
  };

  const handleStop = async (id: string) => {
    setActionError("");
    try {
      await api.servers.stop(id);
      await fetchServers();
    } catch (err: any) {
      setActionError(err.message || "Failed to stop server");
    }
  };

  const handleRestart = async (id: string) => {
    setActionError("");
    try {
      await api.servers.restart(id);
      await fetchServers();
    } catch (err: any) {
      setActionError(err.message || "Failed to restart server");
    }
  };

  const handleCreate = async (data: CreateServerData) => {
    setActionError("");
    await api.servers.create(data);
    await fetchServers();
  };

  const handleDelete = async (id: string) => {
    setActionError("");
    const target = servers.find((server) => server.id === id);
    const confirmed = window.confirm(
      `Delete server "${target?.name || id}"? This will remove the record and all generated files.`
    );
    if (!confirmed) return;

    try {
      await api.servers.delete(id);
      await fetchServers();
    } catch (err: any) {
      setActionError(err.message || "Failed to delete server");
    }
  };

  const runningCount = servers.filter((s) => s.status === "running").length;
  const totalCount = servers.length;

  if (loading) {
    return (
      <div className="min-h-screen">
        <LoadingOverlay mode="fixed" message="Loading dashboard" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-brand-600/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 left-0 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-surface-800/80 bg-surface-950/80 backdrop-blur-2xl">
        <div className="page-shell">
          <div className="flex min-h-[76px] items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-300 shadow-lg shadow-brand-900/20">
                <Blocks size={24} />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/80">Minecraft Control Panel</p>
                <h1 className="text-2xl font-bold text-surface-50">
                  my<span className="text-brand-400">Cube</span>Kub
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-200"
                title="Refresh"
              >
                <RefreshCw
                  size={18}
                  className={refreshing ? "animate-spin" : ""}
                />
              </button>

              <div className="hidden h-8 w-px bg-surface-700 md:block" />

              <div className="hidden rounded-2xl border border-surface-700/60 bg-surface-900/70 px-4 py-2 md:block">
                <p className="text-[10px] uppercase tracking-[0.22em] text-surface-500">Operator</p>
                <p className="text-sm font-medium text-surface-200">{user?.username}</p>
              </div>

              <button
                onClick={handleLogout}
                className="btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-red-400"
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="page-shell relative py-8">
        {refreshing && <LoadingOverlay message="Refreshing servers" subtle />}
        {actionError && (
          <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {actionError}
          </div>
        )}
        <section className="hero-panel mb-8 p-6 sm:p-8">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-500/10 to-transparent" />
          <div className="absolute -top-16 right-12 h-40 w-40 rounded-full bg-brand-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="panel-label mb-3">
                <span className="h-2 w-2 rounded-full bg-brand-400" />
                Server Overview
              </p>
              <h2 className="text-3xl font-bold text-surface-50 sm:text-4xl">Minecraft Server Controller</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-surface-300">
                {runningCount} of {totalCount} server{totalCount !== 1 ? "s" : ""} are live. Start, stop, and manage every world from one panel.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[540px]">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-emerald-200/80">Online</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse-slow" />
                  <p className="text-2xl font-bold text-emerald-100">{runningCount}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-surface-700/70 bg-surface-800/60 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-surface-500">Total Servers</p>
                <div className="mt-2 flex items-center gap-2">
                  <Server size={16} className="text-surface-400" />
                  <p className="text-2xl font-bold text-surface-100">{totalCount}</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(true)}
                className="flex min-h-[92px] items-center justify-center gap-2 rounded-2xl border border-brand-500/30 bg-brand-500/15 px-4 py-4 text-left text-brand-50 transition-all hover:bg-brand-500/25"
              >
                <Plus size={18} />
                <span className="text-base font-semibold">New Server</span>
              </button>
            </div>
          </div>
        </section>

        {/* <section className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="minecraft-card p-5">
            <div className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
                <ShieldCheck size={18} />
              </div>
              <h3 className="text-lg font-semibold text-surface-50">Protected Runtime</h3>
              <p className="mt-2 text-sm leading-6 text-surface-300">
                Unique ports, isolated server instances, and quick state visibility keep each world safer to operate.
              </p>
            </div>
          </div>
          <div className="minecraft-card p-5">
            <div className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
                <RadioTower size={18} />
              </div>
              <h3 className="text-lg font-semibold text-surface-50">Fast Deployment</h3>
              <p className="mt-2 text-sm leading-6 text-surface-300">
                Spin up a new server, assign memory, pick a version, and start playing without leaving the panel.
              </p>
            </div>
          </div>
          <div className="minecraft-card p-5">
            <div className="relative">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
                <Wrench size={18} />
              </div>
              <h3 className="text-lg font-semibold text-surface-50">Live Configuration</h3>
              <p className="mt-2 text-sm leading-6 text-surface-300">
                Tune settings, inspect files, and manage console workflows from a single workspace designed for operators.
              </p>
            </div>
          </div>
        </section> */}

        {/* Server Grid */}
        {servers.length === 0 ? (
          <div className="card text-center py-16">
            <Server size={48} className="text-surface-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-surface-300 mb-2">
              No servers yet
            </h3>
            <p className="text-surface-500 text-sm mb-4">
              Create your first Minecraft server to get started.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus size={16} /> Create Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {servers.map((server, i) => (
              <div
                key={server.id}
                className="animate-slide-up cursor-pointer"
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => navigate(`/servers/${server.id}`)}
              >
                <ServerCard
                  server={server}
                  onStart={handleStart}
                  onStop={handleStop}
                  onRestart={handleRestart}
                  onDelete={handleDelete}
                  connectionIp={connectionIp}
                />
              </div>
            ))}
          </div>
        )}

        <CreateServerModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          usedPorts={servers.map((server) => server.port)}
        />
      </main>
    </div>
  );
}
