import clsx from "clsx";

import { useUIAppState } from "../../context/ui-appState";
import { useExcalidrawSetAppState } from "../App";

import "./SidebarTrigger.scss";

import type { SidebarTriggerProps } from "./common";
import { getCachedSidebarTab } from "./SidebarTabs";

export const SidebarTrigger = ({
  name,
  tab,
  icon,
  title,
  children,
  onToggle,
  className,
  style,
}: SidebarTriggerProps) => {
  const setAppState = useExcalidrawSetAppState();
  const appState = useUIAppState();

  return (
    <label title={title} className="sidebar-trigger__label-element">
      <input
        className="ToolIcon_type_checkbox"
        type="checkbox"
        onChange={(event) => {
          document
            .querySelector(".layer-ui__wrapper")
            ?.classList.remove("animate");
          const isOpen = event.target.checked;
          // 打开时优先使用缓存的标签，如果没有则使用传入的 tab
          const cachedTab = getCachedSidebarTab(name);
          const effectiveTab = cachedTab || tab;
          setAppState({
            openSidebar: isOpen ? { name, tab: effectiveTab } : null,
            openMenu: null,
            openPopup: null,
          });
          onToggle?.(isOpen);
        }}
        checked={appState.openSidebar?.name === name}
        aria-label={title}
        aria-keyshortcuts="0"
      />
      <div className={clsx("sidebar-trigger", className)} style={style}>
        {icon && <div>{icon}</div>}
        {children && <div className="sidebar-trigger__label">{children}</div>}
      </div>
    </label>
  );
};
SidebarTrigger.displayName = "SidebarTrigger";
