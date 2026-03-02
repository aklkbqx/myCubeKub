import { useState, useEffect, useCallback } from "react";
import { api, type ServerWithStatus, type CreateServerData } from "@/lib/api";
import { ServerCard } from "@/components/ServerCard";
import { CreateServerModal } from "@/components/CreateServerModal";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { StatusBadge } from "@/components/StatusBadge";
import SelectDropdown from "@/components/SelectDropdown";
import { RefreshCw, LogOut, Server, Plus, Search, LayoutGrid, Rows3, Play, Square, RotateCcw, ArrowUpDown, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

type DashboardViewMode = "grid" | "table";
type DashboardStatusFilter = "all" | "running" | "stopped" | "error" | "not_found";
type DashboardMemoryFilter = "all" | "low" | "medium" | "high";
type DashboardSortKey = "name" | "status" | "type" | "port" | "memory";

function getStatusPriority(status: ServerWithStatus["status"]) {
  switch (status) {
    case "running":
      return 0;
    case "stopped":
      return 1;
    case "not_found":
      return 2;
    default:
      return 3;
  }
}

export function Dashboard() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [connectionIp, setConnectionIp] = useState("localhost");
  const [actionError, setActionError] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DashboardViewMode>("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [memoryFilter, setMemoryFilter] = useState<DashboardMemoryFilter>("all");
  const [sortKey, setSortKey] = useState<DashboardSortKey>("status");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [mobileHeaderOpen, setMobileHeaderOpen] = useState(false);

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
    const { server } = await api.servers.create(data);
    setShowCreate(false);
    await fetchServers();
    navigate(`/servers/${server.id}`);
  };

  const handleDelete = async (id: string) => {
    setActionError("");
    setDeleteTargetId(id);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await api.servers.delete(deleteTargetId);
      await fetchServers();
      setDeleteTargetId(null);
    } catch (err: any) {
      setActionError(err.message || "Failed to delete server");
    }
  };

  const deleteTarget = deleteTargetId
    ? servers.find((server) => server.id === deleteTargetId) ?? null
    : null;

  const runningCount = servers.filter((s) => s.status === "running").length;
  const totalCount = servers.length;
  const missingCount = servers.filter((s) => s.status === "not_found").length;
  const stoppedCount = servers.filter((s) => s.status === "stopped").length;
  const errorCount = servers.filter((s) => s.status === "error").length;
  const typeOptions = Array.from(new Set(servers.map((server) => server.type))).sort((a, b) => a.localeCompare(b));
  const versionOptions = Array.from(new Set(servers.map((server) => server.version))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
  const statusFilterOptions = [
    { label: "All statuses", value: "all" },
    { label: "Running", value: "running" },
    { label: "Stopped", value: "stopped" },
    { label: "Error", value: "error" },
    { label: "Missing", value: "not_found" },
  ];
  const typeFilterOptions = [
    { label: "All types", value: "all" },
    ...typeOptions.map((type) => ({ label: type, value: type })),
  ];
  const versionFilterOptions = [
    { label: "All versions", value: "all" },
    ...versionOptions.map((version) => ({ label: version, value: version })),
  ];
  const memoryFilterOptions = [
    { label: "All memory", value: "all" },
    { label: "Up to 4 GB", value: "low" },
    { label: "4 GB to 8 GB", value: "medium" },
    { label: "8 GB and above", value: "high" },
  ];
  const sortOptions = [
    { label: "Status: healthy first", value: "status:asc" },
    { label: "Status: issues first", value: "status:desc" },
    { label: "Name: A to Z", value: "name:asc" },
    { label: "Name: Z to A", value: "name:desc" },
    { label: "Port: low to high", value: "port:asc" },
    { label: "Port: high to low", value: "port:desc" },
    { label: "Memory: high to low", value: "memory:desc" },
    { label: "Memory: low to high", value: "memory:asc" },
    { label: "Type: A to Z", value: "type:asc" },
    { label: "Type: Z to A", value: "type:desc" },
  ];
  const filteredServers = [...servers]
    .filter((server) => {
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        server.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        server.version.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        `${connectionIp}:${server.port}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchesStatus = statusFilter === "all" || server.status === statusFilter;
      const matchesType = typeFilter === "all" || server.type === typeFilter;
      const matchesVersion = versionFilter === "all" || server.version === versionFilter;
      const matchesMemory =
        memoryFilter === "all" ||
        (memoryFilter === "low" && server.memoryMb <= 4096) ||
        (memoryFilter === "medium" && server.memoryMb > 4096 && server.memoryMb < 8192) ||
        (memoryFilter === "high" && server.memoryMb >= 8192);
      return matchesSearch && matchesStatus && matchesType && matchesVersion && matchesMemory;
    })
    .sort((left, right) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return left.name.localeCompare(right.name) * direction;
        case "type":
          return left.type.localeCompare(right.type) * direction;
        case "port":
          return (left.port - right.port) * direction;
        case "memory":
          return (left.memoryMb - right.memoryMb) * direction;
        case "status":
        default:
          return (getStatusPriority(left.status) - getStatusPriority(right.status)) * direction;
      }
    });

  const handleSort = (key: DashboardSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

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
          <div className="flex min-h-[76px] items-center justify-between gap-3 py-3 sm:flex-nowrap">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-300 shadow-lg shadow-brand-900/20 sm:h-12 sm:w-12">
                <img
                  src="/logo-only.png"
                  alt="myCubeKub"
                  className="h-5 w-5 sm:h-8 sm:w-8 rounded-xl"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/80 hidden md:block">Minecraft Control Panel</p>
                <h1 className="text-xl font-bold text-surface-50 sm:text-2xl">
                  my<span className="text-brand-400">Cube</span>Kub
                </h1>
              </div>
            </div>

            <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:justify-end sm:gap-3">
              <div className="relative sm:hidden">
                <button
                  type="button"
                  onClick={() => setMobileHeaderOpen((current) => !current)}
                  className="btn-secondary inline-flex min-h-[44px] items-center gap-2 px-3"
                >
                  <span className="text-sm">Menu</span>
                  <ChevronDown size={16} className={`transition-transform ${mobileHeaderOpen ? "rotate-180" : ""}`} />
                </button>

                {mobileHeaderOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-64 rounded-2xl border border-surface-700/70 bg-surface-900/95 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
                    <div className="rounded-xl border border-surface-700/60 bg-surface-950/60 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-surface-500">Operator</p>
                      <p className="mt-1 text-sm font-medium text-surface-200">{user?.username}</p>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleRefresh();
                          setMobileHeaderOpen(false);
                        }}
                        className="btn-secondary inline-flex min-h-[42px] items-center justify-center gap-2 text-sm"
                      >
                        <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleLogout();
                          setMobileHeaderOpen(false);
                        }}
                        className="btn-secondary inline-flex min-h-[42px] items-center justify-center gap-2 text-sm text-red-200 hover:text-red-100"
                      >
                        <LogOut size={16} />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="hidden btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-surface-200 sm:inline-flex"
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
                className="hidden btn-icon border border-surface-700/70 bg-surface-900/70 text-surface-400 hover:text-red-400 sm:inline-flex"
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
        <section className="hero-panel mb-8 p-5 sm:p-8">
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
              <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.22em] text-amber-200/80">Attention</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                  <p className="text-2xl font-bold text-amber-100">{missingCount + stoppedCount}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-6 rounded-[28px] border border-surface-700/70 bg-surface-900/45 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-5">
          <div className="grid gap-4">
            <div className="relative w-full">
              <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-surface-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by server name, version, or address"
                className="input-field h-12 w-full pl-11"
              />
            </div>

            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="min-w-0">
                  <SelectDropdown
                    options={statusFilterOptions}
                    value={statusFilter}
                    onChange={(value) => setStatusFilter(value as DashboardStatusFilter)}
                    placeholder="Filter by status"
                  />
                </div>
                <div className="min-w-0">
                  <SelectDropdown
                    options={typeFilterOptions}
                    value={typeFilter}
                    onChange={setTypeFilter}
                    placeholder="Filter by type"
                  />
                </div>
                <div className="min-w-0">
                  <SelectDropdown
                    options={versionFilterOptions}
                    value={versionFilter}
                    onChange={setVersionFilter}
                    placeholder="Filter by version"
                  />
                </div>
                <div className="min-w-0">
                  <SelectDropdown
                    options={memoryFilterOptions}
                    value={memoryFilter}
                    onChange={(value) => setMemoryFilter(value as DashboardMemoryFilter)}
                    placeholder="Filter by memory"
                  />
                </div>
                <div className="min-w-0">
                  <SelectDropdown
                    options={sortOptions}
                    value={`${sortKey}:${sortDirection}`}
                    onChange={(value) => {
                      const [nextKey, nextDirection] = value.split(":") as [DashboardSortKey, "asc" | "desc"];
                      setSortKey(nextKey);
                      setSortDirection(nextDirection);
                    }}
                    placeholder="Sort servers"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] xl:flex xl:flex-wrap xl:items-center xl:justify-end">
                <div className="inline-flex w-full rounded-2xl border border-surface-700/70 bg-surface-950/55 p-1 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${viewMode === "table" ? "bg-brand-500/15 text-brand-100" : "text-surface-400 hover:text-surface-200"}`}
                  >
                    <Rows3 size={15} />
                    Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${viewMode === "grid" ? "bg-brand-500/15 text-brand-100" : "text-surface-400 hover:text-surface-200"}`}
                  >
                    <LayoutGrid size={15} />
                    Grid
                  </button>
                </div>

                <button
                  onClick={() => setShowCreate(true)}
                  className="btn-primary inline-flex h-11 w-full items-center justify-center gap-2 sm:w-auto"
                >
                  <Plus size={16} />
                  New Server
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-surface-400">
              <span className="rounded-full border border-surface-700/70 bg-surface-950/60 px-3 py-1">
                Showing {filteredServers.length} of {servers.length}
              </span>
              <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                {runningCount} running
              </span>
              <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-amber-200">
                {stoppedCount} stopped
              </span>
              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-orange-200">
                {errorCount} error
              </span>
              <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-200">
                {missingCount} missing
              </span>
            </div>
          </div>
        </section>

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
        ) : filteredServers.length === 0 ? (
          <div className="card text-center py-16">
            <Search size={42} className="mx-auto mb-4 text-surface-600" />
            <h3 className="mb-2 text-lg font-medium text-surface-300">
              No servers match this filter
            </h3>
            <p className="text-sm text-surface-500">
              Try a different search, status, or type filter.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filteredServers.map((server, i) => (
              <div
                key={server.id}
                className="animate-slide-up cursor-pointer"
                style={{ animationDelay: `${i * 40}ms` }}
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
        ) : (
          <section className="overflow-hidden rounded-[28px] border border-surface-700/70 bg-surface-900/45 shadow-2xl shadow-black/10 backdrop-blur-xl">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="min-w-full border-collapse text-left">
                <thead className="bg-surface-950/70">
                  <tr className="border-b border-surface-800 text-xs uppercase tracking-[0.18em] text-surface-500">
                    <th className="px-5 py-4">
                      <button type="button" onClick={() => handleSort("name")} className="inline-flex items-center gap-2 hover:text-surface-200">
                        Name
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th className="hidden px-5 py-4 sm:table-cell">
                      <button type="button" onClick={() => handleSort("status")} className="inline-flex items-center gap-2 hover:text-surface-200">
                        Status
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th className="hidden px-5 py-4 md:table-cell">
                      <button type="button" onClick={() => handleSort("type")} className="inline-flex items-center gap-2 hover:text-surface-200">
                        Type
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th className="hidden px-5 py-4 lg:table-cell">Version</th>
                    <th className="px-5 py-4">
                      <button type="button" onClick={() => handleSort("port")} className="inline-flex items-center gap-2 hover:text-surface-200">
                        Connection
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th className="hidden px-5 py-4 sm:table-cell">
                      <button type="button" onClick={() => handleSort("memory")} className="inline-flex items-center gap-2 hover:text-surface-200">
                        Memory
                        <ArrowUpDown size={13} />
                      </button>
                    </th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.map((server) => {
                    const isRunning = server.status === "running";
                    const isMissing = server.status === "not_found";
                    return (
                      <tr
                        key={server.id}
                        className="group border-b border-surface-800/80 transition-colors hover:bg-surface-800/35"
                      >
                        <td className="px-4 py-4 sm:px-5">
                          <button
                            type="button"
                            onClick={() => navigate(`/servers/${server.id}`)}
                            className="text-left"
                          >
                            <div className="font-medium text-surface-100 transition-colors group-hover:text-brand-100">
                              {server.name}
                            </div>
                            <div className="mt-1 text-xs text-surface-500 sm:hidden">
                              {server.type} · {server.version}
                            </div>
                            <div className="mt-1 text-xs text-surface-500">
                              {server.id}
                            </div>
                          </button>
                        </td>
                        <td className="hidden px-5 py-4 sm:table-cell">
                          <StatusBadge status={server.status} />
                        </td>
                        <td className="hidden px-5 py-4 text-sm text-surface-300 md:table-cell">{server.type}</td>
                        <td className="hidden px-5 py-4 text-sm text-surface-300 lg:table-cell">{server.version}</td>
                        <td className="px-4 py-4 sm:px-5">
                          <div className="font-mono text-sm text-brand-200">
                            {connectionIp}:{server.port}
                          </div>
                          <div className="mt-1 sm:hidden">
                            <StatusBadge status={server.status} />
                          </div>
                        </td>
                        <td className="hidden px-5 py-4 text-sm text-surface-300 sm:table-cell">
                          {Math.round(server.memoryMb / 1024)} GB
                        </td>
                        <td className="px-4 py-4 sm:px-5">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => navigate(`/servers/${server.id}`)}
                              className="btn-secondary px-3 py-2 text-sm"
                            >
                              Open
                            </button>
                            {isMissing ? (
                              <button
                                type="button"
                                onClick={() => void handleStart(server.id)}
                                className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm"
                              >
                                <Play size={14} />
                                Recreate
                              </button>
                            ) : isRunning ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleStop(server.id)}
                                  className="btn-danger inline-flex items-center gap-2 px-3 py-2 text-sm"
                                >
                                  <Square size={14} />
                                  Stop
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRestart(server.id)}
                                  className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm"
                                >
                                  <RotateCcw size={14} />
                                  Restart
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleStart(server.id)}
                                className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm"
                              >
                                <Play size={14} />
                                Start
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <CreateServerModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          usedPorts={servers.map((server) => server.port)}
        />

        {deleteTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-surface-950/75 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-surface-700/70 bg-surface-900 p-6 shadow-2xl shadow-black/40">
              <h3 className="text-lg font-semibold text-surface-100">Delete server?</h3>
              <p className="mt-2 text-sm leading-6 text-surface-400">
                This will remove "{deleteTarget.name}" and all generated server files.
              </p>
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTargetId(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDelete()}
                  className="btn-danger"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
