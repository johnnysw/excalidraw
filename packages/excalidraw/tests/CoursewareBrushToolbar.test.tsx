import React from "react";
import { vi } from "vitest";
import { pointFrom } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { hideTooltip } from "../components/Tooltip";
import { serializeAsJSON } from "../data/json";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  unmountComponent,
  waitFor,
} from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const renderBrush = async (UIOptions: any = {}) => {
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left", formFactor: "desktop", ...UIOptions }}
    />,
  );
  act(() => {
    h.app.refreshEditorInterface();
    h.app.setActiveTool({ type: "freedraw" });
  });
};

beforeEach(() => {
  unmountComponent();
  localStorage.clear();
  mouse.reset();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  unmountComponent();
  hideTooltip({ immediate: true });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("courseware brush toolbox", () => {
  it("keeps independent pen/highlighter settings without changing shape defaults", async () => {
    await renderBrush();
    const defaults = {
      color: h.state.currentItemStrokeColor,
      width: h.state.currentItemStrokeWidth,
      opacity: h.state.currentItemOpacity,
    };
    expect(defaults.width).toBe(2);
    fireEvent.click(screen.getByTestId("courseware-brush-width"));
    fireEvent.change(await screen.findByRole("slider", { name: "画笔粗细" }), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("courseware-brush-color"));
    fireEvent.click(await screen.findByRole("button", { name: "#F54A45" }));
    expect(h.state.coursewareBrush.pen).toEqual({ color: "#F54A45", strokeWidth: 2, opacity: 100 });
    fireEvent.click(screen.getByTestId("courseware-brush-highlighter"));
    expect(h.state.coursewareBrush.highlighter).toEqual({ color: "#FFE928", strokeWidth: 24 / 4.25, opacity: 35 });
    fireEvent.click(screen.getByTestId("courseware-brush-pen"));
    expect(h.state.coursewareBrush.pen).toEqual({ color: "#F54A45", strokeWidth: 2, opacity: 100 });
    expect(h.state.currentItemStrokeColor).toBe(defaults.color);
    expect(h.state.currentItemStrokeWidth).toBe(defaults.width);
    expect(h.state.currentItemOpacity).toBe(defaults.opacity);
  });

  it("draws highlighter strokes and switches back to a solid pen with keyboard shortcuts", async () => {
    await renderBrush();
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress("P"));
    expect(screen.getByTestId("courseware-brush-highlighter")).toHaveAttribute("aria-pressed", "true");
    mouse.downAt(300, 200);
    mouse.moveTo(500, 200);
    mouse.upAt();
    expect(h.elements.at(-1)).toMatchObject({
      type: "freedraw", strokeColor: "#FFE928", strokeWidth: 24 / 4.25,
      opacity: 35, customData: { coursewareBrushMode: "highlighter" },
    });
    Keyboard.keyPress("p");
    mouse.downAt(300, 300);
    mouse.moveTo(500, 300);
    mouse.upAt();
    expect(h.elements.at(-1)).toMatchObject({
      type: "freedraw", strokeColor: "#2B2F36", strokeWidth: 4 / 4.25,
      opacity: 100, customData: { coursewareBrushMode: "pen" },
    });
    const saved = JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local"));
    expect(saved.elements.at(-2).customData.coursewareBrushMode).toBe("highlighter");
    expect(saved.appState.coursewareBrush).toBeUndefined();
  });

  it("disables style controls while erasing and closes back to selection", async () => {
    await renderBrush();
    fireEvent.click(screen.getByTestId("courseware-brush-eraser"));
    expect(h.state.activeTool.type).toBe("eraser");
    expect(h.state.preferredEraserMode).toBe("path");
    expect(screen.getByTestId("courseware-brush-width")).toBeDisabled();
    expect(screen.getByTestId("courseware-brush-color")).toBeDisabled();
    fireEvent.click(screen.getByTestId("courseware-brush-close"));
    expect(h.state.activeTool.type).toBe("selection");
    expect(screen.queryByTestId("courseware-brush-pen")).toBeNull();
  });

  it("keeps style menus mutually exclusive and dismisses only the menu on first Escape", async () => {
    await renderBrush();
    fireEvent.click(screen.getByTestId("courseware-brush-width"));
    await screen.findByRole("slider", { name: "画笔粗细" });
    fireEvent.click(screen.getByTestId("courseware-brush-color"));
    expect(screen.queryByRole("slider", { name: "画笔粗细" })).toBeNull();
    await screen.findByRole("button", { name: "#FFE928" });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "#FFE928" })).toBeNull());
    expect(h.state.activeTool.type).toBe("freedraw");
    await waitFor(() => expect(screen.getByTestId("courseware-brush-color")).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("keeps new brush and existing stroke properties available in the sidebar", async () => {
    await renderBrush();
    API.setAppState({ openSidebar: { name: "default", tab: "properties" } });
    await screen.findByText("描边宽度");
    expect(screen.queryByText("在底部画笔工具箱中调整颜色和粗细")).toBeNull();
    const stroke = API.createElement({ type: "freedraw", points: [pointFrom(0, 0), pointFrom(100, 0)] });
    API.setElements([stroke]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setAppState({ selectedElementIds: { [stroke.id]: true } });
    await screen.findByText("描边宽度");
    expect(screen.queryByText("在底部画笔工具箱中调整颜色和粗细")).toBeNull();
  });

  it.each([
    { toolbarLayout: "top" },
    { formFactor: "phone" },
  ])("keeps the original toolbar outside desktop courseware (%j)", async (options) => {
    await renderBrush(options);
    expect(screen.queryByTestId("courseware-brush-pen")).toBeNull();
  });

  it("filters disabled tools", async () => {
    await renderBrush({ tools: { eraser: false } });
    expect(screen.getByTestId("courseware-brush-highlighter")).toBeInTheDocument();
    expect(screen.queryByTestId("courseware-brush-eraser")).toBeNull();
  });
});
