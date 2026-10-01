import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { useShareMode } from "../context/share-mode";
import { useRole } from "../context/role";

import DropdownMenu from "./dropdownMenu/DropdownMenu";
import { PlaySquareIcon, Presentation05Icon, PresenterModeIcon } from "./icons";

import "./PresentationMenuButton.scss";

export type PresentationViewMode = "viewer" | "presenter";

export const usePresentationMenuVisibility = (viewModeEnabled: boolean) => {
  const presentation = useShareMode()?.footer?.presentation;
  return presentation?.visible !== false &&
    (!viewModeEnabled || presentation?.visible === true);
};

interface PresentationMenuButtonProps {
  canPresent: boolean;
  viewModeEnabled: boolean;
  onPresent: (mode: PresentationViewMode) => void;
  inToolbar?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/** One presentation command menu shared by the footer and courseware rail. */
const PresentationMenuButton = ({
  canPresent,
  viewModeEnabled,
  onPresent,
  inToolbar = false,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: PresentationMenuButtonProps) => {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = open ?? localOpen;
  const visible = usePresentationMenuVisibility(viewModeEnabled);
  const allowedViews = useShareMode()?.footer?.presentation?.allowedViews;
  const role = useRole();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const changeOpen = (nextOpen: boolean) => {
    setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  useEffect(() => {
    if (isOpen && (!canPresent || !visible)) {
      setLocalOpen(false);
      onOpenChangeRef.current?.(false);
    }
  }, [canPresent, visible, isOpen]);

  useEffect(() => {
    if (!isOpen || inToolbar) {
      return;
    }
    const close = () => {
      setLocalOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close();
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onOutsideClick);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("mousedown", onOutsideClick);
      document.removeEventListener("keydown", onEscape, true);
    };
  }, [inToolbar, isOpen]);

  if (!visible) {
    return null;
  }
  const title = canPresent ? "演示模式" : "没有可播放的幻灯片";
  const choices = [
    { key: "viewer" as const, viewType: "normal" as const, label: "普通视图", icon: Presentation05Icon },
    { key: "presenter" as const, viewType: "presenter" as const, label: "演讲者视图", icon: PresenterModeIcon },
  ].filter((item) =>
    (role !== "member" || item.viewType !== "presenter") &&
    (!allowedViews || allowedViews.includes(item.viewType)),
  );
  const choose = (mode: PresentationViewMode) => {
    if (canPresent) {
      onPresent(mode);
      changeOpen(false);
    }
  };

  if (inToolbar) {
    return (
      <DropdownMenu open={isOpen} placement="right">
        <DropdownMenu.Trigger
          className="ToolIcon Courseware-toolbar__presentation"
          onToggle={() => changeOpen(!isOpen)}
          disabled={!canPresent}
          title={title}
          aria-label={title}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          tooltipPosition="right"
          data-testid="toolbar-presentation"
        >
          <span className="ToolIcon__icon">{PlaySquareIcon}</span>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className="Presentation-mode-menu--toolbar"
          portal
          onClickOutside={() => changeOpen(false)}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {choices.map((item) => (
            <DropdownMenu.Item
              key={item.key}
              icon={item.icon}
              onSelect={() => choose(item.key)}
              data-testid={`presentation-${item.key}`}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        ref={triggerRef}
        className={clsx("App-menu__left-btn", "help-icon")}
        disabled={!canPresent}
        onClick={() => changeOpen(!isOpen)}
        title={title}
        aria-label={title}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        data-testid="footer-presentation"
      >
        {PlaySquareIcon}
      </button>
      {isOpen && (
        <div ref={menuRef} className="Presentation-mode-menu" role="menu">
          {choices.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => choose(item.key)}
              data-testid={`presentation-${item.key}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PresentationMenuButton;
