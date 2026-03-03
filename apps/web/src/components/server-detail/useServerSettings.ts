import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { type NavigateFunction } from "react-router-dom";
import { api, type ServerWithStatus, type UpdateServerData } from "@/lib/api";
import { normalizeSettingsForComparison } from "@/components/server-detail/properties-config";

type UseServerSettingsOptions = {
  id?: string;
  navigate: NavigateFunction;
  memoryMinMb: number;
  pendingServerIconFile: File | null;
  uploadPendingServerIcon: () => Promise<boolean>;
  clearPendingServerIcon: () => void;
  setActionLoading: Dispatch<SetStateAction<string | null>>;
};

export function useServerSettings({
  id,
  navigate,
  memoryMinMb,
  pendingServerIconFile,
  uploadPendingServerIcon,
  clearPendingServerIcon,
  setActionLoading,
}: UseServerSettingsOptions) {
  const [server, setServer] = useState<ServerWithStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<UpdateServerData>({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [restartNotice, setRestartNotice] = useState("");
  const [usedPorts, setUsedPorts] = useState<number[]>([]);
  const [connectionIp, setConnectionIp] = useState("localhost");

  const settingsBaselineRef = useRef<UpdateServerData | null>(null);
  const settingsRef = useRef<UpdateServerData>({});

  const fetchServer = useCallback(async () => {
    if (!id) return;
    try {
      const { server: nextServer } = await api.servers.get(id);
      const nextSettings: UpdateServerData = {
        name: nextServer.name,
        port: nextServer.port,
        version: nextServer.version,
        type: nextServer.type,
        memoryMb: nextServer.memoryMb,
        autoBackupEnabled: nextServer.autoBackupEnabled,
        autoBackupIntervalHours: nextServer.autoBackupIntervalHours,
        autoBackupRetentionCount: 5,
      };

      setServer(nextServer);
      const hasLocalUnsavedSettings =
        settingsBaselineRef.current !== null &&
        JSON.stringify(normalizeSettingsForComparison(settingsRef.current, memoryMinMb)) !==
        JSON.stringify(normalizeSettingsForComparison(settingsBaselineRef.current, memoryMinMb));

      settingsBaselineRef.current = nextSettings;

      if (!hasLocalUnsavedSettings) {
        setSettings(nextSettings);
      }
    } catch {
      navigate("/", { replace: true });
    }
  }, [id, memoryMinMb, navigate]);

  const fetchUsedPorts = useCallback(async () => {
    if (!id) return;
    try {
      const { servers } = await api.servers.list();
      setUsedPorts(servers.filter((server) => server.id !== id).map((server) => server.port));
    } catch {
      setUsedPorts([]);
    }
  }, [id]);

  const fetchConfig = useCallback(async () => {
    try {
      const { connectionIp } = await api.config();
      setConnectionIp(connectionIp || "localhost");
    } catch {
      setConnectionIp("localhost");
    }
  }, []);

  const handleSaveSettings = useCallback(async () => {
    if (!id) return;

    setSettingsError("");
    setRestartNotice("");
    setActionLoading("save");
    try {
      const res = await api.servers.update(id, settingsRef.current);
      settingsBaselineRef.current = settingsRef.current;
      await uploadPendingServerIcon();
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      if (res.restartRequired && server?.status === "running") {
        setRestartNotice("Settings saved. Restart the server to apply port, memory, version, or type changes.");
      }
      await Promise.all([fetchServer(), fetchUsedPorts()]);
    } catch (err: any) {
      setSettingsError(err.message || (pendingServerIconFile ? "Failed to save settings or upload server icon" : "Failed to save settings"));
    } finally {
      setActionLoading(null);
    }
  }, [fetchServer, fetchUsedPorts, id, pendingServerIconFile, server?.status, setActionLoading, uploadPendingServerIcon]);

  const updateSettingsField = useCallback(<K extends keyof UpdateServerData>(key: K, value: NonNullable<UpdateServerData[K]>) => {
    setSettings((current) => {
      if (current[key] === value) {
        return current;
      }

      return {
        ...current,
        [key]: value,
      };
    });
  }, []);

  const handleUndoSettingsChange = useCallback(() => {
    if (!settingsBaselineRef.current) return;
    setSettings(settingsBaselineRef.current);
    clearPendingServerIcon();
  }, [clearPendingServerIcon]);

  const hasUnsavedSettings =
    settingsBaselineRef.current !== null &&
    JSON.stringify(normalizeSettingsForComparison(settings, memoryMinMb)) !==
    JSON.stringify(normalizeSettingsForComparison(settingsBaselineRef.current, memoryMinMb));

  const canUndoSettingsChange = hasUnsavedSettings || pendingServerIconFile !== null;
  const isDuplicatePort = settings.port !== undefined && usedPorts.includes(settings.port);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchServer(), fetchUsedPorts(), fetchConfig()]);
      setLoading(false);
    };

    void init();
    const interval = setInterval(() => {
      void Promise.all([fetchServer(), fetchUsedPorts()]);
    }, 10_000);

    return () => clearInterval(interval);
  }, [fetchConfig, fetchServer, fetchUsedPorts]);

  return {
    server,
    loading,
    settings,
    settingsSaved,
    settingsError,
    restartNotice,
    connectionIp,
    fetchServer,
    handleSaveSettings,
    updateSettingsField,
    handleUndoSettingsChange,
    hasUnsavedSettings,
    canUndoSettingsChange,
    isDuplicatePort,
    settingsBaselineRef,
    setSettings,
  };
}
