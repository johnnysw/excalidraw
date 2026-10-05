import React from "react";
import { vi } from "vitest";
import { pointFrom } from "@excalidraw/math";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { hideTooltip } from "../components/Tooltip";
import { restoreElements } from "../data/restore";
import { serializeAsJSON } from "../data/json";
import { actionChangeOpacity, actionChangeStrokeColor, actionChangeStrokeWidth } from "../actions/actionProperties";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, render, screen, unmountComponent, within } from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const renderBrush = async (UIOptions: any = {}) => {
  await render(<Excalidraw role="teacher" handleKeyboardGlobally UIOptions={{ toolbarLayout: "left", formFactor: "desktop", ...UIOptions }} />);
  act(() => { h.app.refreshEditorInterface(); h.app.setActiveTool({ type: "freedraw" }); });
  API.setAppState({ openSidebar: { name: "default", tab: "properties" } });
  await screen.findByText("描边宽度");
};

const panel = () => document.querySelector(".PropertiesMenu") as HTMLElement;
const section = (title: string) => within(panel()).getByText(title).closest(".PropertiesMenu__section") as HTMLElement;
const widthInput = () => within(section("描边宽度")).getByRole("textbox") as HTMLInputElement;
const setWidth = (value: number) => {
  const input = widthInput();
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
};
const draw = () => {
  mouse.downAt(300, 300); mouse.moveTo(450, 300); mouse.upAt();
  return h.elements.at(-1)!;
};

beforeEach(() => {
  unmountComponent(); localStorage.clear(); mouse.reset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  unmountComponent(); hideTooltip({ immediate: true }); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("courseware brush sidebar properties", () => {
  it("restores effective properties without empty tool-only operations", async () => {
    await renderBrush();
    expect(within(panel()).getByText("笔触色")).toBeInTheDocument();
    expect(within(panel()).getByText("填充色")).toBeInTheDocument();
    expect(within(panel()).getAllByText("透明度").length).toBeGreaterThan(0);
    expect(within(panel()).queryByText("笔触形状")).toBeNull();
    expect(within(panel()).queryByText("图层")).toBeNull();
    expect(within(panel()).queryByText("操作")).toBeNull();
    expect(screen.getByTestId("courseware-brush-pen")).toBeInTheDocument();
  });

  it("synchronizes colors and width in both directions without changing shape defaults", async () => {
    await renderBrush();
    const defaults = { color: h.state.currentItemStrokeColor, width: h.state.currentItemStrokeWidth, opacity: h.state.currentItemOpacity };
    const pick = within(section("笔触色")).getAllByRole("button").find((button) => button.dataset.testid?.startsWith("color-top-pick-#"))!;
    const color = pick.title;
    fireEvent.click(pick);
    expect(h.state.coursewareBrush.pen.color).toBe(color);
    expect(screen.getByTestId("courseware-brush-color").querySelector(".Courseware-brush-color-preview")).toHaveStyle({ backgroundColor: color });
    setWidth(0.5);
    fireEvent.click(screen.getByTestId("courseware-brush-width"));
    const slider = await screen.findByRole("slider", { name: "画笔粗细" });
    expect(slider).toHaveValue("0.5");
    expect(slider).toHaveAttribute("min", "0.1");
    expect(slider).toHaveAttribute("max", "6");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(widthInput().value).toBe("2");
    expect(h.state.coursewareBrush.pen.strokeWidth).toBe(2);
    fireEvent.click(screen.getByTestId("courseware-brush-color"));
    fireEvent.click(await screen.findByRole("button", { name: "#F54A45" }));
    expect(h.state.coursewareBrush.pen.color).toBe("#F54A45");
    expect(section("笔触色").querySelector('[data-openpopup="elementStroke"]')).toHaveStyle({ "--swatch-color": "#F54A45" });
    expect({ color: h.state.currentItemStrokeColor, width: h.state.currentItemStrokeWidth, opacity: h.state.currentItemOpacity }).toEqual(defaults);
  });

  it("does not round fractional defaults just by focusing and leaving the width input", async () => {
    await renderBrush();
    const width = h.state.coursewareBrush.pen.strokeWidth;
    fireEvent.focus(widthInput()); fireEvent.blur(widthInput());
    expect(h.state.coursewareBrush.pen.strokeWidth).toBe(width);
    fireEvent.click(screen.getByTestId("courseware-brush-highlighter"));
    fireEvent.focus(widthInput()); fireEvent.blur(widthInput());
    expect(h.state.coursewareBrush.highlighter.strokeWidth).toBe(24 / 4.25);
  });

  it.each([0.1, 0.2, 0.5, 1, 2, 3, 4, 5, 6])("draws the exact native width %s within the shared range", async (width) => {
    await renderBrush(); setWidth(width);
    const stroke = draw();
    expect(stroke.strokeWidth).toBe(width);
    expect(h.state.coursewareBrush.pen.strokeWidth).toBe(width);
  });

  it("limits both brush modes to six and keeps both controls in the same units", async () => {
    await renderBrush();
    for (const mode of ["pen", "highlighter"] as const) {
      fireEvent.click(screen.getByTestId(`courseware-brush-${mode}`));
      setWidth(100);
      expect(widthInput()).toHaveValue("6");
      expect(h.state.coursewareBrush[mode].strokeWidth).toBe(6);
      fireEvent.click(screen.getByTestId("courseware-brush-width"));
      const slider = await screen.findByRole("slider", { name: "画笔粗细" });
      expect(slider).toHaveValue("6");
      expect(slider.closest(".Courseware-brush-width-panel")!.querySelector("output")).toHaveTextContent(/^6$/);
      fireEvent.change(slider, { target: { value: "1.7" } });
      expect(widthInput()).toHaveValue("1.7");
      expect(h.state.coursewareBrush[mode].strokeWidth).toBe(1.7);
      fireEvent.click(screen.getByTestId("courseware-brush-width"));
      expect(draw().strokeWidth).toBe(1.7);
      act(() => h.app.actionManager.executeAction(actionChangeStrokeWidth, "ui", 100));
      expect(h.state.coursewareBrush[mode].strokeWidth).toBe(6);
      expect(draw().strokeWidth).toBe(6);
    }
  });

  it("limits edited courseware strokes without changing loaded strokes or shape defaults", async () => {
    await renderBrush();
    const preferences = structuredClone(h.state.coursewareBrush);
    const stroke = API.createElement({ type: "freedraw", strokeWidth: 10, points: [pointFrom(0, 0), pointFrom(100, 0)] });
    API.updateScene({ elements: [stroke], captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setAppState({ selectedElementIds: { [stroke.id]: true } });
    expect(h.elements[0].strokeWidth).toBe(10);
    setWidth(20);
    expect(h.elements[0].strokeWidth).toBe(6);
    expect(h.state.coursewareBrush).toEqual(preferences);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("z"));
    expect(h.elements[0].strokeWidth).toBe(10);
    const rectangle = API.createElement({ type: "rectangle", strokeWidth: 2 });
    API.setElements([rectangle]);
    API.setAppState({ selectedElementIds: { [rectangle.id]: true } });
    setWidth(20);
    expect(h.elements[0].strokeWidth).toBe(20);
  });

  it.each([
    ["extraThin", 0.5], ["thin", 1], ["bold", 2], ["medium", 3], ["extraBold", 4],
  ] as const)("keeps the %s preset exact", async (id, width) => {
    await renderBrush();
    fireEvent.click(within(section("描边宽度")).getByTestId(`strokeWidth-${id}`));
    expect(widthInput().value).toBe(String(width));
    expect(draw().strokeWidth).toBe(width);
  });

  it("remembers custom opacity independently for pen and highlighter and persists the strokes", async () => {
    await renderBrush();
    fireEvent.change(screen.getByTestId("opacity"), { target: { value: "60" } });
    setWidth(1.5);
    const pen = draw(); expect(pen.opacity).toBe(60);
    fireEvent.click(screen.getByTestId("courseware-brush-highlighter"));
    expect(screen.getByTestId("opacity")).toHaveValue("35");
    fireEvent.change(screen.getByTestId("opacity"), { target: { value: "20" } });
    setWidth(5);
    const highlighter = draw(); expect(highlighter.opacity).toBe(20);
    fireEvent.click(screen.getByTestId("courseware-brush-pen"));
    expect(screen.getByTestId("opacity")).toHaveValue("60");
    expect(widthInput().value).toBe("1.5");
    expect(h.state.coursewareBrush.highlighter.opacity).toBe(20);
    const saved = JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local"));
    expect(saved.appState.coursewareBrush).toBeUndefined();
    const restored = restoreElements(saved.elements, null);
    expect(restored.find((element) => element.id === pen.id)).toMatchObject({ strokeWidth: 1.5, opacity: 60 });
    expect(restored.find((element) => element.id === highlighter.id)).toMatchObject({ strokeWidth: 5, opacity: 20 });
  });

  it("edits existing strokes through ordinary actions without changing brush preferences", async () => {
    await renderBrush();
    const original = structuredClone(h.state.coursewareBrush);
    const stroke = API.createElement({ type: "freedraw", strokeWidth: 2, opacity: 100, points: [pointFrom(0, 0), pointFrom(100, 0)] });
    API.setElements([stroke]);
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setAppState({ selectedElementIds: { [stroke.id]: true } });
    setWidth(6);
    fireEvent.change(screen.getByTestId("opacity"), { target: { value: "40" } });
    expect(h.elements[0]).toMatchObject({ strokeWidth: 6, opacity: 40 });
    expect(h.state.coursewareBrush).toEqual(original);
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("z"));
    expect(h.elements[0].opacity).toBe(100);
    Keyboard.withModifierKeys({ ctrl: true, shift: true }, () => Keyboard.keyPress("z"));
    expect(h.elements[0].opacity).toBe(40);
    expect(h.state.coursewareBrush).toEqual(original);
  });

  it.each([{ toolbarLayout: "top" }, { formFactor: "phone" }])("preserves ordinary property defaults outside the toolbox context (%j)", async (options) => {
    await renderBrush(options);
    const original = structuredClone(h.state.coursewareBrush);
    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeWidth, "ui", 3);
    });
    act(() => {
      h.app.actionManager.executeAction(actionChangeOpacity, "ui", 70);
    });
    act(() => {
      h.app.actionManager.executeAction(actionChangeStrokeColor, "ui", { currentItemStrokeColor: "#ff0000" });
    });
    expect(h.state.currentItemStrokeWidth).toBe(3);
    expect(h.state.currentItemOpacity).toBe(70);
    expect(h.state.currentItemStrokeColor).toBe("#ff0000");
    expect(h.state.coursewareBrush).toEqual(original);
    expect(draw()).toMatchObject({ strokeWidth: 3, opacity: 70, strokeColor: "#ff0000" });
  });

  it("keeps fill settings effective and does not introduce eraser properties", async () => {
    await renderBrush();
    API.setAppState({ currentItemBackgroundColor: "#ffec99", currentItemFillStyle: "solid" });
    expect(within(panel()).getByText("填充样式")).toBeInTheDocument();
    expect(draw()).toMatchObject({ backgroundColor: "#ffec99", fillStyle: "solid" });
    fireEvent.click(screen.getByTestId("courseware-brush-eraser"));
    expect(screen.getByTestId("courseware-brush-width")).toBeDisabled();
    expect(within(panel()).queryByText("描边宽度")).toBeNull();
  });
});
