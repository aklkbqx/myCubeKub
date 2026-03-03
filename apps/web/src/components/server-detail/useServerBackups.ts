import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { api, type BackupInfo } from "@/lib/api";
import type { BackupConfirmState, ServerDetailTab } from "@/components/server-detail/server-detail-types";

type UseServerBackupsOptions = {
  serverId?: string;
  activeTab: ServerDetailTab;
  fetchServer: () => Promise<void>;
  fetchProperties: () => Promise<void>;
  refreshServerIconPreview: () => void;
  setActionError: Dispatch<SetStateAction<string>>;
  setActionLoading: Dispatch<SetStateAction<string | null>>;
};

export function useServerBackups({
  serverId,
  activeTab,
  fetchServer,
  fetchProperties,
  refreshServerIconPreview,
  setActionError,
  setActionLoading,
}: UseServerBackupsOptions) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupConfirm, setBackupConfirm] = useState<BackupConfirmState>(null);

  const fetchBackups = useCallback(async () => {
    if (!serverId) {
      setBackups([]);
      setBackupsLoaded(true);
      return;
    }

    setBackupsLoaded(false);
    try {
      const { backups: nextBackups } = await api.servers.listBackups(serverId);
      setBackups(nextBackups);
    } catch (err: any) {
      setActionError(err.message || "Failed to load backups");
      setBackups([]);
    } finally {
      setBackupsLoaded(true);
    }
  }, [serverId, setActionError]);

  const handleCreateBackup = useCallback(async () => {
    if (!serverId) return;

    setActionError("");
    setBackupNotice("");
    setActionLoading("creating backup");
    try {
      const { backup } = await api.servers.createBackup(serverId);
      await fetchBackups();
      setBackupNotice(`Backup "${backup.filename}" created successfully.`);
    } catch (err: any) {
      setActionError(err.message || "Failed to create backup");
    } finally {
      setActionLoading(null);
    }
  }, [fetchBackups, serverId, setActionError, setActionLoading]);

  const handleConfirmBackupAction = useCallback(async () => {
    if (!serverId || !backupConfirm) return;

    setActionError("");
    setBackupNotice("");
    setActionLoading(backupConfirm.kind === "restore" ? "restoring backup" : "deleting backup");
    try {
      if (backupConfirm.kind === "restore") {
        await api.servers.restoreBackup(serverId, backupConfirm.backup.id);
        await Promise.all([fetchBackups(), fetchServer(), fetchProperties()]);
        refreshServerIconPreview();
        setBackupNotice(`Backup "${backupConfirm.backup.filename}" restored successfully.`);
      } else {
        await api.servers.deleteBackup(serverId, backupConfirm.backup.id);
        await fetchBackups();
        setBackupNotice(`Backup "${backupConfirm.backup.filename}" deleted.`);
      }
      setBackupConfirm(null);
    } catch (err: any) {
      setActionError(err.message || `Failed to ${backupConfirm.kind} backup`);
    } finally {
      setActionLoading(null);
    }
  }, [
    backupConfirm,
    fetchBackups,
    fetchProperties,
    fetchServer,
    refreshServerIconPreview,
    serverId,
    setActionError,
    setActionLoading,
  ]);

  useEffect(() => {
    if (activeTab !== "settings") return;
    void fetchBackups();
  }, [activeTab, fetchBackups]);

  return {
    backups,
    backupsLoaded,
    backupNotice,
    backupConfirm,
    setBackupConfirm,
    fetchBackups,
    handleCreateBackup,
    handleConfirmBackupAction,
  };
}
