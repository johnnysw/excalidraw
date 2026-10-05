import clsx from "clsx";
import { useEffect, useRef } from "react";

import { useEditorInterface } from "../App";
import { hideTooltip, showTooltip } from "../Tooltip";

const MenuTrigger = ({
  className = "",
  children,
  onToggle,
  title,
  ...rest
}: {
  className?: string;
  children: React.ReactNode;
  onToggle: () => void;
  title?: string;
  tooltipPosition?: "bottom" | "top" | "right";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">) => {
  const { tooltipPosition, ...buttonProps } = rest;
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const owner = triggerRef.current;
    return () => {
      if (owner) {
        hideTooltip({ immediate: true, owner });
      }
    };
  }, []);
  const editorInterface = useEditorInterface();
  const classNames = clsx(
    `dropdown-menu-button ${className}`,
    "zen-mode-transition",
    {
      "dropdown-menu-button--mobile": editorInterface.formFactor === "phone",
    },
  ).trim();
  return (
    <button
      className={classNames}
      ref={triggerRef}
      type="button"
      data-testid="dropdown-menu-button"
      title={tooltipPosition ? undefined : title}
      {...buttonProps}
      onClick={(event) => {
        if (tooltipPosition) {
          hideTooltip({ immediate: true });
        }
        if (buttonProps.onClick) {
          buttonProps.onClick(event);
        } else {
          onToggle();
        }
      }}
      onPointerDownCapture={(event) => {
        buttonProps.onPointerDownCapture?.(event);
        if (tooltipPosition) {
          hideTooltip({ immediate: true });
        }
      }}
      onKeyDownCapture={(event) => {
        buttonProps.onKeyDownCapture?.(event);
        if (tooltipPosition && event.key === "Escape") {
          hideTooltip({ owner: event.currentTarget });
        }
      }}
      onPointerEnter={(event) => {
        buttonProps.onPointerEnter?.(event);
        if (tooltipPosition && title) {
          showTooltip(event.currentTarget, title, false, tooltipPosition);
        }
      }}
      onPointerLeave={(event) => {
        buttonProps.onPointerLeave?.(event);
        if (tooltipPosition) {
          hideTooltip({ owner: event.currentTarget });
        }
      }}
    >
      {children}
    </button>
  );
};

export default MenuTrigger;
MenuTrigger.displayName = "DropdownMenuTrigger";
