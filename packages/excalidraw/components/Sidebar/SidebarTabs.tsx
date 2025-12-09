import * as RadixTabs from "@radix-ui/react-tabs";

import { useUIAppState } from "../../context/ui-appState";
import { useExcalidrawSetAppState } from "../App";

// localStorage key for caching last selected tab per sidebar
const SIDEBAR_TAB_CACHE_KEY = "excalidraw-sidebar-tab-cache";

// Get cached tab for a sidebar
export const getCachedSidebarTab = (sidebarName: string): string | null => {
  try {
    const cache = localStorage.getItem(SIDEBAR_TAB_CACHE_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      return parsed[sidebarName] || null;
    }
  } catch {
    // ignore
  }
  return null;
};

// Save tab to cache
const setCachedSidebarTab = (sidebarName: string, tab: string) => {
  try {
    const cache = localStorage.getItem(SIDEBAR_TAB_CACHE_KEY);
    const parsed = cache ? JSON.parse(cache) : {};
    parsed[sidebarName] = tab;
    localStorage.setItem(SIDEBAR_TAB_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
};

export const SidebarTabs = ({
  children,
  ...rest
}: {
  children: React.ReactNode;
} & Omit<React.RefAttributes<HTMLDivElement>, "onSelect">) => {
  const appState = useUIAppState();
  const setAppState = useExcalidrawSetAppState();

  if (!appState.openSidebar) {
    return null;
  }

  const { name } = appState.openSidebar;

  return (
    <RadixTabs.Root
      className="sidebar-tabs-root"
      value={appState.openSidebar.tab}
      onValueChange={(tab) => {
        // 保存到本地缓存
        setCachedSidebarTab(name, tab);
        setAppState((state) => ({
          ...state,
          openSidebar: { ...state.openSidebar, name, tab },
        }));
      }}
      {...rest}
    >
      {children}
    </RadixTabs.Root>
  );
};
SidebarTabs.displayName = "SidebarTabs";
