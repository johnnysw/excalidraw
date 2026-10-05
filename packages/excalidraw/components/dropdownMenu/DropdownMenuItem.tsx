import React, { useEffect, useRef } from "react";

import { THEME } from "@excalidraw/common";

import type { ValueOf } from "@excalidraw/common/utility-types";

import { useExcalidrawAppState } from "../App";
import { hideTooltip, showTooltip } from "../Tooltip";

import MenuItemContent from "./DropdownMenuItemContent";
import {
  getDropdownMenuItemClassName,
  useHandleDropdownMenuItemClick,
} from "./common";

import type { JSX } from "react";

const DropdownMenuItem = ({
  icon,
  value,
  order,
  children,
  shortcut,
  className,
  hovered,
  selected,
  textStyle,
  tooltipLabel,
  tooltipPosition = "right",
  onSelect,
  onClick,
  ...rest
}: {
  icon?: JSX.Element;
  value?: string | number | undefined;
  order?: number;
  onSelect?: (event: Event) => void;
  children: React.ReactNode;
  shortcut?: string;
  hovered?: boolean;
  selected?: boolean;
  textStyle?: React.CSSProperties;
  className?: string;
  tooltipLabel?: React.ReactNode;
  tooltipPosition?: "bottom" | "top" | "right";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onSelect">) => {
  const handleClick = useHandleDropdownMenuItemClick(onClick, onSelect);
  const ref = useRef<HTMLButtonElement>(null);
  const hasTooltip = tooltipLabel !== undefined && tooltipLabel !== null;

  useEffect(() => {
    const owner = ref.current;
    return () => {
      if (owner) {
        hideTooltip({ immediate: true, owner });
      }
    };
  }, [hasTooltip]);

  useEffect(() => {
    if (hovered) {
      if (order === 0) {
        // scroll into the first item differently, so it's visible what is above (i.e. group title)
        ref.current?.scrollIntoView({ block: "end" });
      } else {
        ref.current?.scrollIntoView({ block: "nearest" });
      }
    }
  }, [hovered, order]);

  return (
    <button
      {...rest}
      ref={ref}
      value={value}
      onClick={handleClick}
      className={getDropdownMenuItemClassName(className, selected, hovered)}
      title={hasTooltip ? undefined : rest.title ?? rest["aria-label"]}
      onPointerEnter={(event) => {
        rest.onPointerEnter?.(event);
        if (hasTooltip) {
          // Custom tools may render a React label; use its displayed text.
          const label =
            typeof tooltipLabel === "string"
              ? tooltipLabel
              : event.currentTarget.textContent?.trim();
          if (label) {
            showTooltip(event.currentTarget, label, false, tooltipPosition);
          }
        }
      }}
      onPointerLeave={(event) => {
        rest.onPointerLeave?.(event);
        if (hasTooltip) {
          hideTooltip({ owner: event.currentTarget });
        }
      }}
      onPointerDownCapture={(event) => {
        rest.onPointerDownCapture?.(event);
        if (hasTooltip) {
          hideTooltip({ immediate: true, owner: event.currentTarget });
        }
      }}
      onClickCapture={(event) => {
        rest.onClickCapture?.(event);
        if (hasTooltip) {
          hideTooltip({ immediate: true, owner: event.currentTarget });
        }
      }}
      onKeyDownCapture={(event) => {
        rest.onKeyDownCapture?.(event);
        if (hasTooltip && event.key === "Escape") {
          hideTooltip({ owner: event.currentTarget });
        }
      }}
    >
      <MenuItemContent textStyle={textStyle} icon={icon} shortcut={shortcut}>
        {children}
      </MenuItemContent>
    </button>
  );
};
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropDownMenuItemBadgeType = {
  GREEN: "green",
  RED: "red",
  BLUE: "blue",
} as const;

export const DropDownMenuItemBadge = ({
  type = DropDownMenuItemBadgeType.BLUE,
  children,
}: {
  type?: ValueOf<typeof DropDownMenuItemBadgeType>;
  children: React.ReactNode;
}) => {
  const { theme } = useExcalidrawAppState();
  const style = {
    display: "inline-flex",
    marginLeft: "auto",
    padding: "2px 4px",
    borderRadius: 6,
    fontSize: 9,
    fontFamily: "Cascadia, monospace",
    border: theme === THEME.LIGHT ? "1.5px solid white" : "none",
  };

  switch (type) {
    case DropDownMenuItemBadgeType.GREEN:
      Object.assign(style, {
        backgroundColor: "var(--background-color-badge)",
        color: "var(--color-badge)",
      });
      break;
    case DropDownMenuItemBadgeType.RED:
      Object.assign(style, {
        backgroundColor: "pink",
        color: "darkred",
      });
      break;
    case DropDownMenuItemBadgeType.BLUE:
    default:
      Object.assign(style, {
        background: "var(--color-promo)",
        color: "var(--color-surface-lowest)",
      });
  }

  return (
    <div className="DropDownMenuItemBadge" style={style}>
      {children}
    </div>
  );
};
DropDownMenuItemBadge.displayName = "DropdownMenuItemBadge";

DropdownMenuItem.Badge = DropDownMenuItemBadge;

export default DropdownMenuItem;
