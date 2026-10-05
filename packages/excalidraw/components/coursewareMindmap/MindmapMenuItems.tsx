import React, { useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import * as Popover from "@radix-ui/react-popover";
import { useExcalidrawContainer } from "../App";
import { getShortcutKey } from "../../shortcut";

export interface MindmapMenuItemProps {
  label: string;
  icon: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  run: () => void;
}
export const MindmapMenuItem = ({
  label,
  icon,
  shortcut,
  disabled,
  danger,
  run,
}: MindmapMenuItemProps) => (
  <button
    type="button"
    role="menuitem"
    disabled={disabled}
    className={danger ? "is-danger" : undefined}
    onClick={run}
  >
    <Icon icon={icon} />
    <span>{label}</span>
    {shortcut && <kbd>{getShortcutKey(shortcut)}</kbd>}
  </button>
);
export const MindmapMenuSeparator = () => (
  <span className="Courseware-mindmap-menu-separator" role="separator" />
);
export const MindmapMenuList = ({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) => (
  <div
    className="Courseware-mindmap-menu"
    role="menu"
    aria-label={label}
    onKeyDown={(event) => {
      if (
        !(event.target instanceof HTMLButtonElement) ||
        !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
      )
        return;
      const items = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
          ":scope > button:not(:disabled)",
        ),
      ];
      if (!items.length) return;
      event.preventDefault();
      event.stopPropagation();
      const current = items.indexOf(event.target);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    }}
  >
    {children}
  </div>
);
export const MindmapMenuSubmenu = ({
  label,
  icon,
  children,
  open,
  onOpenChange,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { container } = useExcalidrawContainer();
  const focusRequested = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const setOpen = onOpenChange;
  const delay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = () => clearTimeout(delay.current);
  const openMenu = () => {
    cancelClose();
    setOpen(true);
  };
  const closeLater = () => {
    delay.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(delay.current), []);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        focusRequested.current = value;
        setOpen(value);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          onPointerEnter={openMenu}
          onPointerLeave={closeLater}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              focusRequested.current = true;
              if (open)
                content.current
                  ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                  ?.focus();
              else openMenu();
            }
          }}
        >
          <Icon icon={icon} />
          <span>{label}</span>
          <Icon
            className="Courseware-mindmap-menu-chevron"
            icon="lucide:chevron-right"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={container}>
        <Popover.Content
          ref={content}
          className="Courseware-mindmap-popover Courseware-mindmap-submenu"
          data-tooltip-obstacle
          side="right"
          align="start"
          sideOffset={4}
          collisionBoundary={container}
          collisionPadding={12}
          onPointerEnter={cancelClose}
          onPointerLeave={closeLater}
          onOpenAutoFocus={(event) => {
            if (!focusRequested.current) event.preventDefault();
            focusRequested.current = false;
          }}
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
