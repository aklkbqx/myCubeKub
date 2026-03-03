import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import type { ServerDetailTab, UnsavedChangesState } from "@/components/server-detail/server-detail-types";

type UseServerDetailNavigationOptions = {
  activeTab: ServerDetailTab;
  setActiveTab: Dispatch<SetStateAction<ServerDetailTab>>;
  hasUnsavedChanges: boolean;
  propertiesLoaded: boolean;
  resourcePacksLoaded: boolean;
  onDiscardChanges: () => void;
  onLeavePage: () => void;
};

export function useServerDetailNavigation({
  activeTab,
  setActiveTab,
  hasUnsavedChanges,
  propertiesLoaded,
  resourcePacksLoaded,
  onDiscardChanges,
  onLeavePage,
}: UseServerDetailNavigationOptions) {
  const [unsavedChangesConfirm, setUnsavedChangesConfirm] = useState<UnsavedChangesState>(null);

  const tabScrollPositionsRef = useRef<Record<ServerDetailTab, number>>({
    settings: 0,
    properties: 0,
    resourcePacks: 0,
    files: 0,
    console: 0,
  });
  const pendingScrollRestoreRef = useRef<ServerDetailTab | null>(null);

  const restoreTabScrollPosition = useCallback((tab: ServerDetailTab) => {
    const top = tabScrollPositionsRef.current[tab] ?? 0;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top, behavior: "auto" });
      });
    });
  }, []);

  const continueTabChange = useCallback((nextTab: ServerDetailTab) => {
    tabScrollPositionsRef.current[activeTab] = window.scrollY;
    pendingScrollRestoreRef.current = nextTab;
    setActiveTab(nextTab);
  }, [activeTab]);

  const handleTabChange = useCallback((nextTab: ServerDetailTab) => {
    if (nextTab === activeTab) return;

    if (hasUnsavedChanges) {
      setUnsavedChangesConfirm({ kind: "tab", nextTab });
      return;
    }

    continueTabChange(nextTab);
  }, [activeTab, continueTabChange, hasUnsavedChanges]);

  const handleBackNavigation = useCallback(() => {
    if (hasUnsavedChanges) {
      setUnsavedChangesConfirm({ kind: "leave" });
      return;
    }

    onLeavePage();
  }, [hasUnsavedChanges, onLeavePage]);

  const handleConfirmDiscardChanges = useCallback(() => {
    const confirmState = unsavedChangesConfirm;
    setUnsavedChangesConfirm(null);
    if (!confirmState) return;

    onDiscardChanges();

    if (confirmState.kind === "tab") {
      continueTabChange(confirmState.nextTab);
      return;
    }

    onLeavePage();
  }, [continueTabChange, onDiscardChanges, onLeavePage, unsavedChangesConfirm]);

  useEffect(() => {
    const handleScroll = () => {
      tabScrollPositionsRef.current[activeTab] = window.scrollY;
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [activeTab]);

  useEffect(() => {
    if (pendingScrollRestoreRef.current !== activeTab) return;

    const ready =
      activeTab === "properties"
        ? propertiesLoaded
        : activeTab === "resourcePacks"
          ? resourcePacksLoaded
          : true;

    if (!ready) return;

    restoreTabScrollPosition(activeTab);
    pendingScrollRestoreRef.current = null;
  }, [activeTab, propertiesLoaded, resourcePacksLoaded, restoreTabScrollPosition]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  return {
    unsavedChangesConfirm,
    setUnsavedChangesConfirm,
    handleTabChange,
    handleBackNavigation,
    handleConfirmDiscardChanges,
  };
}
