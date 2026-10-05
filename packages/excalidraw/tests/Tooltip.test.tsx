import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  getTooltipDiv,
  hideTooltip,
  showTooltip,
  Tooltip,
  updateTooltipPosition,
} from "../components/Tooltip";

beforeEach(() => {
  hideTooltip({ immediate: true });
  document.querySelector(".excalidraw-tooltip")?.remove();
});

it("suppresses an open menu owner's tooltip while preserving its trigger", () => {
  const { rerender } = render(
    <Tooltip label="Menu" suppress>
      <button aria-label="Menu" />
    </Tooltip>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Menu" }));
  expect(document.querySelector(".excalidraw-tooltip--visible")).toBeNull();
  rerender(
    <Tooltip label="Menu">
      <button aria-label="Menu" />
    </Tooltip>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Menu" }));
  expect(getTooltipDiv()).toHaveClass("excalidraw-tooltip--visible");
});

afterEach(() => {
  cleanup();
  hideTooltip({ immediate: true });
  vi.restoreAllMocks();
  document.querySelector(".excalidraw-tooltip")?.remove();
});

const tooltipWithSize = () => {
  const tooltip = getTooltipDiv();
  Object.defineProperties(tooltip, {
    offsetWidth: { configurable: true, value: 120 },
    offsetHeight: { configurable: true, value: 40 },
  });
  return tooltip;
};

it.each([
  { position: "right" as const, side: "right", left: 200, top: 200 },
  {
    position: "right" as const,
    side: "left",
    left: window.innerWidth - 44,
    top: 200,
  },
  { position: "top" as const, side: "top", left: 200, top: 200 },
  { position: "top" as const, side: "bottom", left: 200, top: 0 },
  { position: "bottom" as const, side: "bottom", left: 200, top: 200 },
  {
    position: "bottom" as const,
    side: "top",
    left: 200,
    top: window.innerHeight - 44,
  },
])(
  "uses the actual $side side after requesting $position",
  ({ position, side, left, top }) => {
    const tooltip = tooltipWithSize();
    updateTooltipPosition(
      tooltip,
      { left, top, width: 40, height: 40 },
      position,
    );
    expect(tooltip.dataset.side).toBe(side);
    const x = parseFloat(tooltip.style.left);
    const y = parseFloat(tooltip.style.top);
    expect(x).toBeGreaterThanOrEqual(8);
    expect(x + 120).toBeLessThanOrEqual(window.innerWidth - 8);
    expect(y).toBeGreaterThanOrEqual(8);
    expect(y + 40).toBeLessThanOrEqual(window.innerHeight - 8);
    const origin =
      side === "right"
        ? "-8px 20px"
        : side === "left"
        ? "128px 20px"
        : side === "top"
        ? "60px 48px"
        : "60px -8px";
    expect(tooltip.style.transformOrigin).toBe(origin);
  },
);

it("keeps the arrow aimed at the trigger when the bubble shifts at a viewport edge", () => {
  const tooltip = tooltipWithSize();
  // A scaled rect must not affect layout/arrow geometry during an animation.
  vi.spyOn(tooltip, "getBoundingClientRect").mockReturnValue({
    width: 96,
    height: 32,
  } as DOMRect);
  updateTooltipPosition(
    tooltip,
    { left: 30, top: 100, width: 40, height: 40 },
    "top",
  );
  expect(tooltip.style.left).toBe("8px");
  expect(tooltip.style.getPropertyValue("--tooltip-arrow-x")).toBe("42px");
  expect(tooltip.style.transformOrigin).toBe("42px 48px");
});

it("retains the tooltip for a leave animation and dismisses it immediately when activated", () => {
  render(
    <Tooltip label="Draw" position="right">
      <button aria-label="Draw" />
    </Tooltip>,
  );
  const trigger = screen.getByRole("button", { name: "Draw" });
  fireEvent.pointerEnter(trigger);
  const tooltip = getTooltipDiv();
  expect(tooltip).toHaveTextContent("Draw");
  expect(tooltip).toHaveAttribute("role", "tooltip");
  expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
  fireEvent.pointerLeave(trigger);
  expect(tooltip).not.toHaveClass(
    "excalidraw-tooltip--visible",
    "excalidraw-tooltip--instant",
  );
  expect(tooltip).toBeInTheDocument();
  expect(tooltip).toHaveTextContent("Draw");
  fireEvent.pointerEnter(trigger);
  fireEvent.pointerDown(trigger);
  expect(tooltip).toHaveClass("excalidraw-tooltip--instant");
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
  fireEvent.pointerEnter(trigger);
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--instant");
  expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
});

it("does not let a stale owner's leave or unmount dismiss the current tooltip", () => {
  const result = render(
    <>
      <Tooltip label="First">
        <button aria-label="First" />
      </Tooltip>
      <Tooltip label="Second">
        <button aria-label="Second" />
      </Tooltip>
    </>,
  );
  const first = screen.getByRole("button", { name: "First" });
  const second = screen.getByRole("button", { name: "Second" });
  fireEvent.pointerEnter(first);
  fireEvent.pointerEnter(second);
  fireEvent.pointerLeave(first);
  const tooltip = getTooltipDiv();
  expect(tooltip).toHaveTextContent("Second");
  expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
  result.unmount();
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
});

it("suppresses only an open menu trigger while keeping sibling hints available", () => {
  const trigger = document.createElement("button");
  const rail = document.createElement("div");
  rail.append(trigger);
  trigger.setAttribute("aria-expanded", "true");
  showTooltip(trigger, "Menu");
  expect(document.querySelector(".excalidraw-tooltip")).toBeNull();
  const other = document.createElement("button");
  rail.append(other);
  showTooltip(other, "Other tool");
  expect(getTooltipDiv()).toHaveClass("excalidraw-tooltip--visible");
  expect(getTooltipDiv()).toHaveTextContent("Other tool");
  trigger.setAttribute("aria-expanded", "false");
  showTooltip(trigger, "Menu");
  expect(getTooltipDiv()).toHaveClass("excalidraw-tooltip--visible");
});

it("resets immediate dismissal and width constraints for canvas hyperlink hints", () => {
  hideTooltip({ immediate: true });
  showTooltip(
    { left: 200, top: 200, width: 20, height: 20 },
    "https://example.com",
    false,
    "top",
    { maxWidth: "20rem" },
  );
  const tooltip = getTooltipDiv();
  expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--instant");
  expect(tooltip.style.maxWidth).toContain("20rem");
  hideTooltip({ owner: null });
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
});

it("cleans up after dynamically enabling and disabling a tooltip wrapper", () => {
  const result = render(
    <Tooltip label="Draw" disabled>
      <button aria-label="Draw" />
    </Tooltip>,
  );
  result.rerender(
    <Tooltip label="Draw">
      <button aria-label="Draw" />
    </Tooltip>,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "Draw" }));
  const tooltip = getTooltipDiv();
  expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
  result.rerender(
    <Tooltip label="Draw" disabled>
      <button aria-label="Draw" />
    </Tooltip>,
  );
  expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
});

const expectOutsidePanel = (
  tooltip: HTMLDivElement,
  panel: { left: number; top: number; width: number; height: number },
) => {
  const left =
    parseFloat(tooltip.style.left) - (tooltip.dataset.side === "right" ? 8 : 0);
  const top =
    parseFloat(tooltip.style.top) - (tooltip.dataset.side === "bottom" ? 8 : 0);
  const right =
    parseFloat(tooltip.style.left) +
    tooltip.offsetWidth +
    (tooltip.dataset.side === "left" ? 8 : 0);
  const bottom =
    parseFloat(tooltip.style.top) +
    tooltip.offsetHeight +
    (tooltip.dataset.side === "top" ? 8 : 0);
  const overlap =
    Math.max(
      0,
      Math.min(right, panel.left + panel.width) - Math.max(left, panel.left),
    ) *
    Math.max(
      0,
      Math.min(bottom, panel.top + panel.height) - Math.max(top, panel.top),
    );
  expect(overlap).toBe(0);
};

it("keeps another rail tool's tooltip visible beside an open palette without overlap", () => {
  const tooltip = tooltipWithSize();
  const panel = { left: 130, top: 200, width: 160, height: 50 };
  updateTooltipPosition(
    tooltip,
    { left: 80, top: 200, width: 40, height: 40 },
    "right",
    { obstacles: [panel] },
  );
  expect(tooltip.dataset.side).toBe("top");
  expectOutsidePanel(tooltip, panel);
  updateTooltipPosition(
    tooltip,
    { left: 80, top: 280, width: 40, height: 40 },
    "right",
    { obstacles: [panel] },
  );
  expect(tooltip.dataset.side).toBe("right");
  expectOutsidePanel(tooltip, panel);
});

it.each([
  { panelTop: 200, side: "top" },
  { panelTop: 0, side: "bottom" },
])(
  "places a wrapped submenu row outside its panel at $side",
  ({ panelTop, side }) => {
    const tooltip = tooltipWithSize();
    const panel = { left: 140, top: panelTop, width: 120, height: 88 };
    updateTooltipPosition(
      tooltip,
      { left: 150, top: panelTop + 44, width: 32, height: 32 },
      "top",
      { obstacles: [panel], anchor: panel },
    );
    expect(tooltip.dataset.side).toBe(side);
    expectOutsidePanel(tooltip, panel);
    const x =
      parseFloat(tooltip.style.left) +
      parseFloat(tooltip.style.getPropertyValue("--tooltip-arrow-x"));
    expect(x).toBe(166);
  },
);

it("only avoids panels in the current editor and ignores closing panels", () => {
  render(
    <>
      <div className="excalidraw">
        <button aria-label="First tool" />
      </div>
      <div className="excalidraw">
        <div data-testid="other-palette" data-tooltip-obstacle />
      </div>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "First tool" });
  const panelElement = screen.getByTestId("other-palette");
  const tooltip = tooltipWithSize();
  const panel = new DOMRect(130, 200, 160, 50);
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
    new DOMRect(80, 200, 40, 40),
  );
  vi.spyOn(panelElement, "getBoundingClientRect").mockReturnValue(panel);
  showTooltip(trigger, "First tool", false, "right");
  expect(tooltip.dataset.side).toBe("right");
  trigger.parentElement!.append(panelElement);
  showTooltip(trigger, "First tool", false, "right");
  expectOutsidePanel(tooltip, panel);
  panelElement.dataset.state = "closed";
  showTooltip(trigger, "First tool", false, "right");
  expect(tooltip.dataset.side).toBe("right");
});
