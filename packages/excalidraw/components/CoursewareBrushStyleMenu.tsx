import React from "react";
import * as Popover from "@radix-ui/react-popover";

import { Tooltip, hideTooltip } from "./Tooltip";

interface CoursewareBrushStyleMenuProps {
  name: "width" | "color";
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shouldRestoreFocus: () => boolean;
  container: HTMLDivElement | null;
}

export const CoursewareBrushStyleMenu = ({
  name,
  label,
  icon,
  children,
  disabled,
  open,
  onOpenChange,
  shouldRestoreFocus,
  container,
}: CoursewareBrushStyleMenuProps) => (
  <Popover.Root
    open={open}
    onOpenChange={(nextOpen) => {
      hideTooltip({ immediate: true });
      onOpenChange(nextOpen && !disabled);
    }}
  >
    <Tooltip label={label} position="top">
      <Popover.Trigger asChild>
        <button
          type="button"
          className="Courseware-brush-button Courseware-brush-style"
          disabled={disabled}
          aria-label={label}
          aria-expanded={open}
          data-testid={`courseware-brush-${name}`}
        >
          {icon}
          <svg
            className="Courseware-brush-chevron"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path
              d="m4 6 4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </Popover.Trigger>
    </Tooltip>
    <Popover.Portal container={container ?? undefined}>
      <Popover.Content
        className={`Courseware-brush-panel Courseware-brush-${name}-panel`}
        side="top"
        sideOffset={10}
        collisionBoundary={container ?? undefined}
        collisionPadding={8}
        data-tooltip-obstacle
        onWheel={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          hideTooltip({ immediate: true });
        }}
        onCloseAutoFocus={(event) => {
          // A dismissed palette must not steal focus from its replacement.
          if (!shouldRestoreFocus()) {
            event.preventDefault();
          }
        }}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);
