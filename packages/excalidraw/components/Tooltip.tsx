import React, { useEffect, useRef } from "react";

import "./Tooltip.scss";

type TooltipPosition = "bottom" | "top" | "right";
type TooltipSide = TooltipPosition | "left";
type TooltipTarget = {
  left: number;
  top: number;
  width: number;
  height: number;
};
let tooltipOwner: HTMLElement | null = null;

export const getTooltipDiv = () => {
  const existingDiv = document.querySelector<HTMLDivElement>(
    ".excalidraw-tooltip",
  );
  if (existingDiv) {
    return existingDiv;
  }
  const div = document.createElement("div");
  document.body.appendChild(div);
  div.classList.add("excalidraw-tooltip");
  div.setAttribute("role", "tooltip");
  return div;
};

export const updateTooltipPosition = (
  tooltip: HTMLDivElement,
  item: TooltipTarget,
  position: TooltipPosition = "bottom",
  options: { obstacles?: TooltipTarget[]; anchor?: TooltipTarget } = {},
) => {
  // Layout dimensions stay stable while the tooltip is scaling in/out.
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 8;
  // Leave room for the 8px arrow and a 4px gap to the trigger.
  const gap = 12;
  const centerX = item.left + item.width / 2;
  const centerY = item.top + item.height / 2;
  const clamp = (value: number, max: number) =>
    Math.max(margin, Math.min(value, Math.max(margin, max)));
  // In a palette, place the bubble beyond the whole panel, while the arrow
  // continues to point to the hovered option on the other axis.
  const anchor = options.anchor ?? item;
  const sides: TooltipSide[] =
    position === "right"
      ? ["right", "left", "top", "bottom"]
      : position === "top"
      ? ["top", "bottom", "right", "left"]
      : ["bottom", "top", "right", "left"];
  const candidates = sides.map((side) => {
    const rawLeft =
      side === "right"
        ? anchor.left + anchor.width + gap
        : side === "left"
        ? anchor.left - width - gap
        : centerX - width / 2;
    const rawTop =
      side === "bottom"
        ? anchor.top + anchor.height + gap
        : side === "top"
        ? anchor.top - height - gap
        : centerY - height / 2;
    const left = clamp(rawLeft, viewportWidth - width - margin);
    const top = clamp(rawTop, viewportHeight - height - margin);
    // Include the arrow in collision checks, using the final clamped position.
    const visualLeft = left - (side === "right" ? 8 : 0);
    const visualTop = top - (side === "bottom" ? 8 : 0);
    const visualRight = left + width + (side === "left" ? 8 : 0);
    const visualBottom = top + height + (side === "top" ? 8 : 0);
    const overlap = (options.obstacles ?? []).reduce(
      (area, obstacle) =>
        area +
        Math.max(
          0,
          Math.min(visualRight, obstacle.left + obstacle.width) -
            Math.max(visualLeft, obstacle.left),
        ) *
          Math.max(
            0,
            Math.min(visualBottom, obstacle.top + obstacle.height) -
              Math.max(visualTop, obstacle.top),
          ),
      0,
    );
    const overflow =
      side === "right" || side === "left"
        ? Math.abs(rawLeft - left) * height
        : Math.abs(rawTop - top) * width;
    return { side, left, top, score: overlap * 10 + overflow };
  });
  const { side, left, top } = candidates.reduce((best, candidate) =>
    candidate.score < best.score ? candidate : best,
  );
  const arrowX = Math.max(12, Math.min(centerX - left, width - 12));
  const arrowY = Math.max(12, Math.min(centerY - top, height - 12));
  tooltip.dataset.side = side;
  tooltip.style.setProperty("--tooltip-arrow-x", `${arrowX}px`);
  tooltip.style.setProperty("--tooltip-arrow-y", `${arrowY}px`);
  tooltip.style.transformOrigin =
    side === "top"
      ? `${arrowX}px ${height + 8}px`
      : side === "bottom"
      ? `${arrowX}px -8px`
      : side === "right"
      ? `-8px ${arrowY}px`
      : `${width + 8}px ${arrowY}px`;
  Object.assign(tooltip.style, {
    top: `${top}px`,
    left: `${left}px`,
  });
};

export const showTooltip = (
  item: HTMLElement | TooltipTarget,
  label: string,
  long = false,
  position: TooltipPosition = "bottom",
  options: { maxWidth?: string } = {},
) => {
  const owner = item instanceof HTMLElement ? item : null;
  if (owner?.closest('[aria-expanded="true"]')) {
    return;
  }
  const tooltip = getTooltipDiv();
  tooltipOwner = owner;
  tooltip.classList.remove("excalidraw-tooltip--instant");
  tooltip.style.minWidth = `min(${long ? "50ch" : "10ch"}, calc(100vw - 16px))`;
  tooltip.style.maxWidth = `min(${
    options.maxWidth ?? (long ? "50ch" : "15ch")
  }, calc(100vw - 16px))`;
  tooltip.textContent = label;
  const itemRect = owner
    ? owner.getBoundingClientRect()
    : (item as TooltipTarget);
  const panel = owner?.closest<HTMLElement>("[data-tooltip-obstacle]");
  const obstacles = Array.from(
    owner
      ?.closest(".excalidraw")
      ?.querySelectorAll<HTMLElement>("[data-tooltip-obstacle]") ?? [],
  )
    .filter((element) => element.dataset.state !== "closed")
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  updateTooltipPosition(tooltip, itemRect, position, {
    obstacles,
    anchor: panel?.getBoundingClientRect(),
  });
  // Commit the hidden style before entering, including when this div is new.
  // No animation timer can reopen a tooltip after its menu takes priority.
  tooltip.getBoundingClientRect();
  tooltip.classList.add("excalidraw-tooltip--visible");
};

export const hideTooltip = (
  options: { immediate?: boolean; owner?: HTMLElement | null } = {},
) => {
  if (options.owner !== undefined && options.owner !== tooltipOwner) {
    return;
  }
  const tooltip = document.querySelector<HTMLDivElement>(".excalidraw-tooltip");
  tooltip?.classList.toggle("excalidraw-tooltip--instant", !!options.immediate);
  tooltip?.classList.remove("excalidraw-tooltip--visible");
  tooltipOwner = null;
};

type TooltipProps = {
  children: React.ReactNode;
  label: string;
  long?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
  suppress?: boolean;
  position?: TooltipPosition;
};

export const Tooltip = ({
  children,
  label,
  long = false,
  style,
  disabled,
  suppress = false,
  position = "bottom",
}: TooltipProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const owner = wrapperRef.current;
    return () => {
      if (owner) {
        hideTooltip({ immediate: true, owner });
      }
    };
  }, [disabled]);
  if (disabled) {
    return null;
  }
  return (
    <div
      className="excalidraw-tooltip-wrapper"
      ref={wrapperRef}
      onPointerEnter={(event) =>
        !suppress &&
        showTooltip(
          event.currentTarget as HTMLDivElement,
          label,
          long,
          position,
        )
      }
      onPointerLeave={(event) => hideTooltip({ owner: event.currentTarget })}
      onPointerDownCapture={() => hideTooltip({ immediate: true })}
      onClickCapture={() => hideTooltip({ immediate: true })}
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") {
          hideTooltip();
        }
      }}
      style={style}
    >
      {children}
    </div>
  );
};
