import React from "react";

import { FONT_FAMILY, ROUNDNESS, SVG_NS, getFontString } from "@excalidraw/common";
import { layoutTextElement, newElement, newElementWith, newTextElement } from "@excalidraw/element";
import {
  COURSEWARE_STICKY_STYLE,
} from "@excalidraw/element/coursewareSticky";
import { drawCoursewareSticky } from "@excalidraw/element/coursewareStickyCanvas";
import { createCoursewareStickySvgNode } from "@excalidraw/element/coursewareStickySvg";
import {
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  getContainerCoords,
} from "@excalidraw/element/textElement";

import type { ExcalidrawTextElementWithContainer } from "@excalidraw/element/types";

import { COURSEWARE_STICKY_CUSTOM_TYPE } from "../coursewareInsertTools";
import { getDefaultAppState } from "../appState";
import { restoreElements } from "../data/restore";
import { Excalidraw } from "../index";
import { exportToCanvas, exportToSvg } from "../scene/export";

import { Keyboard, Pointer } from "./helpers/ui";
import { getTextEditor, updateTextEditor } from "./queries/dom";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;
const savedAuthor = {
  id: "teacher",
  name: "张老师",
  avatar: "https://example.test/stored-sticky-avatar.png",
  color: "#f57c9c",
};
const createSticky = (withStoredAuthor = false) => newElement({
  type: "rectangle", x: 100, y: 200, width: 160, height: 160,
  backgroundColor: "#fff7cc", strokeColor: "transparent", strokeWidth: 0,
  roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS, value: 4 },
  customData: {
    coursewareObjectType: "sticky",
    ...(withStoredAuthor ? { coursewareStickyAuthor: savedAuthor } : {}),
  },
});

beforeEach(() => {
  unmountComponent();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  unmountComponent();
  vi.unstubAllGlobals();
});

describe("whiteboard sticky appearance", () => {
  it("uses the whiteboard's clean note padding", () => {
    const sticky = createSticky();
    const text = newTextElement({ x: 112, y: 212, text: "笔记", containerId: sticky.id }) as ExcalidrawTextElementWithContainer;
    expect(getContainerCoords(sticky)).toEqual({ x: 112, y: 212 });
    expect(getBoundTextMaxWidth(sticky, text)).toBe(136);
    expect(getBoundTextMaxHeight(sticky, text)).toBe(136);
    expect(getBoundTextMaxHeight(createSticky(true), text)).toBe(136);
  });

  it("uses the same font for measured, drawn and edited sticky text", () => {
    expect(getFontString({
      fontSize: 16, fontFamily: FONT_FAMILY.Helvetica,
      customData: { coursewareObjectType: "sticky-text" },
    })).toBe("16px PingFang SC, Source Han Sans CN, sans-serif");
  });

  it.each([false, true])("draws a clean card with the whiteboard shadow (stored author: %s)", (withStoredAuthor) => {
    const createImage = vi.fn();
    vi.stubGlobal("Image", createImage);
    const drawnFills: { color: string; blur: number; offsetY: number }[] = [];
    const context = {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), arc: vi.fn(),
      getTransform: () => ({ a: 2, b: 0 }),
      fillStyle: "", shadowBlur: 0, shadowOffsetY: 0,
      fill(this: CanvasRenderingContext2D) { drawnFills.push({ color: this.fillStyle as string, blur: this.shadowBlur, offsetY: this.shadowOffsetY }); },
      measureText: () => ({ width: 36 }), fillText: vi.fn(), drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawCoursewareSticky(createSticky(withStoredAuthor), context);
    expect(context.roundRect).toHaveBeenCalledWith(0, 0, 160, 160, 4);
    expect(drawnFills[0]).toEqual({ color: "#fff7cc", blur: 32, offsetY: 16 });
    expect(context.arc).not.toHaveBeenCalled();
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(createImage).not.toHaveBeenCalled();
    expect(drawnFills).toHaveLength(1);
  });

  it.each([false, true])("exports a clean card with the same corner, fill and shadow (stored author: %s)", (withStoredAuthor) => {
    const svg = document.createElementNS(SVG_NS, "svg");
    const node = createCoursewareStickySvgNode(createSticky(withStoredAuthor), svg);
    expect(node.querySelector("rect[rx]")).toHaveAttribute("rx", "4");
    expect(node.querySelector("rect[rx]")).toHaveAttribute("stroke", "none");
    expect(node.querySelector("rect[rx]")).toHaveAttribute("fill", "#fff7cc");
    const shadow = node.querySelector("feDropShadow");
    expect(shadow).toHaveAttribute("dy", "8");
    expect(shadow).toHaveAttribute("stdDeviation", "8");
    expect(shadow).toHaveAttribute("flood-opacity", "0.16");
    expect(node.querySelector("text")).toBeNull();
    expect(node.querySelector("image")).toBeNull();
    expect(node.querySelector("circle")).toBeNull();
  });

  it("restores blank notes with stored author data without reserving an author footer", () => {
    const sticky = createSticky(true);
    const text = newTextElement({
      x: 112, y: 212, text: "", width: 136, autoResize: false, containerId: sticky.id,
      fontFamily: FONT_FAMILY.Helvetica, lineHeight: COURSEWARE_STICKY_STYLE.lineHeight as ExcalidrawTextElementWithContainer["lineHeight"],
      customData: { coursewareObjectType: "sticky-text" },
    });
    const restored = restoreElements(JSON.parse(JSON.stringify([
      newElementWith(sticky, { boundElements: [{ type: "text", id: text.id }] }), text,
    ])), null, { deleteInvisibleElements: true, repairBindings: true });
    expect(restored[0].customData?.coursewareStickyAuthor).toEqual(savedAuthor);
    expect(restored[0].boundElements).toEqual([{ type: "text", id: text.id }]);
    expect(restored[1]).toMatchObject({ text: "", isDeleted: false, containerId: sticky.id });
    expect(getFontString(restored[1] as ExcalidrawTextElementWithContainer)).toContain("PingFang SC");
    expect(getBoundTextMaxHeight(restored[0], restored[1] as ExcalidrawTextElementWithContainer)).toBe(136);
    const svg = document.createElementNS(SVG_NS, "svg");
    const node = createCoursewareStickySvgNode(restored[0], svg);
    expect(node.querySelector("text, image, circle")).toBeNull();
  });

  it("exports stored notes without loading their former avatars", async () => {
    const createImage = vi.fn(function () { return document.createElement("img"); });
    vi.stubGlobal("Image", createImage);
    const sticky = createSticky(true);
    const canvas = await exportToCanvas(
      [sticky], { ...getDefaultAppState(), width: 300, height: 200, offsetLeft: 0, offsetTop: 0 }, {},
      { exportBackground: false, viewBackgroundColor: "#fff" },
      undefined, async () => {},
    );
    expect(canvas.width).toBeGreaterThanOrEqual(160);
    const svg = await exportToSvg(
      [sticky], { exportBackground: false, viewBackgroundColor: "#fff" }, {},
    );
    expect(svg.querySelector("text, image, circle")).toBeNull();
    expect(createImage).not.toHaveBeenCalled();
  });

  it("keeps sticky rendering and font rules in the actual SVG export path", async () => {
    const sticky = createSticky();
    const text = newTextElement({
      x: 112, y: 212, text: "课堂笔记", width: 136, autoResize: false,
      containerId: sticky.id, fontSize: 16, fontFamily: FONT_FAMILY.Helvetica,
      customData: { coursewareObjectType: "sticky-text" },
    });
    const svg = await exportToSvg([
      newElementWith(sticky, { boundElements: [{ type: "text", id: text.id }] }), text,
    ], { exportBackground: false, viewBackgroundColor: "#fff" }, {});
    expect(svg.querySelector("rect[rx='4']")).toHaveAttribute("stroke", "none");
    expect(svg.querySelector("feDropShadow")).toHaveAttribute("dy", "8");
    const exportedText = Array.from(svg.querySelectorAll("text"))
      .find((item) => item.textContent === "课堂笔记");
    expect(exportedText).toHaveAttribute("font-family", COURSEWARE_STICKY_STYLE.fontFamily);
    expect(exportedText?.parentElement).toHaveAttribute("clip-path", `url(#sticky-text-${text.id})`);
  });

  it("uses the same font in styled text layout and SVG export", async () => {
    const sticky = createSticky();
    const text = newTextElement({
      x: 112, y: 212, text: "课堂笔记", width: 136, autoResize: false,
      containerId: sticky.id, fontSize: 16, fontFamily: FONT_FAMILY.Helvetica,
      textStyleRanges: [{ start: 0, end: 2, color: "#ff0000" }],
      customData: { coursewareObjectType: "sticky-text" },
    });
    const layout = layoutTextElement(text, { maxWidth: 136 });
    expect(layout.lines.flatMap((line) => line.runs).map((run) => getFontString(run.style)))
      .toEqual([`16px ${COURSEWARE_STICKY_STYLE.fontFamily}`, `16px ${COURSEWARE_STICKY_STYLE.fontFamily}`]);
    const svg = await exportToSvg([
      newElementWith(sticky, { boundElements: [{ type: "text", id: text.id }] }), text,
    ], { exportBackground: false, viewBackgroundColor: "#fff" }, {});
    const spans = [...svg.querySelectorAll("tspan")];
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span).toHaveAttribute("font-family", COURSEWARE_STICKY_STYLE.fontFamily);
    }
  });

  it("creates the matching blank note and edits its existing text when double clicked", async () => {
    await render(<Excalidraw UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }} />);
    act(() => h.app.setActiveTool({ type: "custom", customType: COURSEWARE_STICKY_CUSTOM_TYPE }));
    const pointer = new Pointer("mouse");
    pointer.clickAt(100, 200);
    const sticky = h.app.scene.getNonDeletedElements().find((item) => item.customData?.coursewareObjectType === "sticky")!;
    const text = h.app.scene.getNonDeletedElements().find((item) => item.customData?.coursewareObjectType === "sticky-text")!;
    expect(sticky).toMatchObject({ width: 160, height: 160, strokeWidth: 0, strokeColor: "transparent", customData: { coursewareObjectType: "sticky" } });
    expect(sticky.customData).not.toHaveProperty("coursewareStickyAuthor");
    expect(text).toMatchObject({ fontSize: 16, fontFamily: FONT_FAMILY.Helvetica, lineHeight: 1.35, text: "", x: sticky.x + 12, y: sticky.y + 12 });
    expect(sticky.groupIds).toEqual([]);
    expect(text.groupIds).toEqual([]);
    pointer.clickAt(180, 280);
    pointer.doubleClickAt(180, 280);
    expect(h.state.editingTextElement?.id).toBe(text.id);
    Keyboard.keyPress("Escape");
    expect(h.app.scene.getNonDeletedElement(text.id)).not.toBeNull();
    expect(h.app.scene.getNonDeletedElement(sticky.id)?.boundElements).toEqual([{ type: "text", id: text.id }]);
  });

  it("keeps long text within the fixed note while editing with the whiteboard font", async () => {
    await render(<Excalidraw UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }} />);
    act(() => h.app.setActiveTool({ type: "custom", customType: COURSEWARE_STICKY_CUSTOM_TYPE }));
    const pointer = new Pointer("mouse");
    pointer.clickAt(100, 200);
    const sticky = h.app.scene.getNonDeletedElements().find((item) => item.customData?.coursewareObjectType === "sticky")!;
    const text = h.app.scene.getNonDeletedElements().find((item) => item.customData?.coursewareObjectType === "sticky-text")!;
    pointer.doubleClickAt(180, 280);
    const editor = await getTextEditor();
    const longText = Array.from({ length: 20 }, (_, index) => `第${index + 1}行课堂笔记`).join("\n");

    act(() => updateTextEditor(editor, longText));

    expect(h.app.scene.getNonDeletedElement(sticky.id)).toMatchObject({ width: 160, height: 160 });
    expect(editor.style.overflow).toBe("hidden");
    expect(Number.parseFloat(editor.style.height)).toBeLessThanOrEqual(136);
    expect(Number.parseFloat(editor.style.maxHeight)).toBeLessThanOrEqual(136);
    expect(editor.querySelector("span")?.style.fontFamily).toContain("PingFang SC");
    expect(editor.querySelector("span")?.style.fontFamily).not.toContain("Helvetica");

    Keyboard.keyPress("Escape");
    expect(h.app.scene.getNonDeletedElement(text.id)).toMatchObject({ originalText: longText });
    expect(h.app.scene.getNonDeletedElement(sticky.id)).toMatchObject({ width: 160, height: 160 });

    pointer.doubleClickAt(180, 280);
    const reopenedEditor = await getTextEditor();
    act(() => updateTextEditor(reopenedEditor, "短笔记"));
    expect(h.app.scene.getNonDeletedElement(sticky.id)).toMatchObject({ width: 160, height: 160 });
    expect(reopenedEditor.querySelector("span")?.style.fontFamily).toContain("PingFang SC");
    Keyboard.keyPress("Escape");
  });
});
