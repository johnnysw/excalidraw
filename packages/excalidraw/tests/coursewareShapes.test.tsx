import React from "react";

import { getCommonBounds, getCoursewareBraceWidthHandles, getCoursewareBraceWidthHandleType, getElementAbsoluteCoords, isLineElement, isTextElement, LinearElementEditor } from "@excalidraw/element";
import { KEYS } from "@excalidraw/common";
import { computeBoundTextPosition } from "@excalidraw/element/textElement";
import { getCoursewareBraceSelection, getCoursewareBraceTextRect, isCoursewareBraceElement } from "@excalidraw/element/coursewareBrace";

import type { ExcalidrawLineElement, ExcalidrawTextElementWithContainer } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { COURSEWARE_SHAPE_PRESETS } from "../coursewareShapes";
import { restoreElements } from "../data/restore";
import { serializeAsJSON } from "../data/json";
import { exportToSvg } from "../scene/export";
import * as RendererHelpers from "../renderer/helpers";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, GlobalTestState, render } from "./test-utils";
import { getTextEditor, updateTextEditor } from "./queries/dom";

const { h } = window;
const mouse = new Pointer("mouse");

const selectShape = (index = COURSEWARE_SHAPE_PRESETS.findIndex(({ id }) => id === "triangle"), locked = false) => {
  act(() => {
    h.app.setActiveTool({
      type: "custom",
      customType: COURSEWARE_SHAPE_PRESETS[index].customType,
      locked,
    });
  });
};

const draw = (start = [100, 100], end = [220, 180]) => {
  mouse.downAt(start[0], start[1]);
  const id = h.state.newElement?.id;
  mouse.moveTo(end[0], end[1]);
  mouse.upAt();
  return h.elements.find((element) => element.id === id) as ExcalidrawLineElement;
};

const resizeBraceWidth = (direction: "e" | "w", deltaWidth: number, fromCenter = false) => {
  const elements = h.app.scene.getSelectedElements(h.state);
  const { container } = getCoursewareBraceSelection(elements)!;
  const handle = getCoursewareBraceWidthHandles(elements, h.state.zoom, h.app.scene.getNonDeletedElementsMap())[direction]!;
  const x = handle[0] + handle[2] / 2;
  const y = handle[1] + handle[3] / 2;
  const delta = deltaWidth * (direction === "e" ? 1 : -1);
  const cos = Math.cos(container.angle);
  const sin = Math.sin(container.angle);
  expect(getCoursewareBraceWidthHandleType(elements, h.app.scene.getNonDeletedElementsMap(), x, y, h.state.zoom, "mouse")).toBe(direction);
  Keyboard.withModifierKeys({ alt: fromCenter }, () => {
    mouse.downAt(x, y);
    mouse.moveTo(x + delta * cos, y + delta * sin);
    mouse.upAt();
  });
};

describe("courseware shape tools", () => {
  beforeEach(async () => {
    await render(<Excalidraw role="teacher" handleKeyboardGlobally />);
    // Rough hand-drawn strokes intentionally overshoot their logical bounds.
    API.setAppState({ currentItemRoughness: 0 });
    mouse.reset();
  });

  it("keeps the drawing crosshair through pointer down and space release", () => {
    selectShape();
    expect(GlobalTestState.interactiveCanvas.style.cursor).toBe("crosshair");
    mouse.downAt(100, 100);
    expect(GlobalTestState.interactiveCanvas.style.cursor).toBe("crosshair");
    mouse.upAt();
    Keyboard.keyDown(" ");
    Keyboard.keyUp(" ");
    expect(GlobalTestState.interactiveCanvas.style.cursor).toBe("crosshair");
  });

  it.each(
    COURSEWARE_SHAPE_PRESETS.map(
      (preset, index) => [preset.id, index] as const,
    ),
  )(
    "draws %s as editable native geometry and restores its serialized scene",
    async (id, index) => {
      selectShape(index);
      const element = draw();
      const openBrace = id === "brace" || id === "brace-right";
      const expectedParts = openBrace ? 3 : id === "cylinder" ? 2 : 1;
      expect(h.elements).toHaveLength(expectedParts);
      const [left, top, right, bottom] = getCommonBounds(h.elements);
      expect(left).toBeCloseTo(100);
      expect(top).toBeCloseTo(100);
      expect(right - left).toBeCloseTo(120);
      expect(bottom - top).toBeCloseTo(id === "circle" ? 120 : 80);
      for (const part of h.elements.filter(isLineElement)) {
        expect(part).toMatchObject({ type: "line", startArrowhead: null, endArrowhead: null });
        expect(part.points[0]).toEqual([0, 0]);
        expect(part.points.length).toBeGreaterThanOrEqual(3);
        if (part.polygon) {
          expect(part.points.at(-1)).toEqual([0, 0]);
        } else {
          expect(part.points.at(-1)).not.toEqual([0, 0]);
          expect(part.backgroundColor).toBe("transparent");
        }
        expect(h.state.selectedElementIds[part.id]).toBe(true);
      }
      expect(element.polygon).toBe(!openBrace);
      if (expectedParts > 1) {
        expect(h.elements.every((part) => part.groupIds[0] === element.groupIds[0])).toBe(true);
        expect(h.state.selectedGroupIds[element.groupIds[0]]).toBe(true);
      }
      expect(h.state.newElement).toBeNull();
      expect(h.state.multiElement).toBeNull();
      expect(h.state.activeTool.type).toBe("selection");
      expect(h.state.selectedElementIds[element.id]).toBe(true);

      const saved = JSON.parse(
        serializeAsJSON(h.elements, h.state, {}, "local"),
      );
      const restored = restoreElements(saved.elements, null);
      expect(restored).toHaveLength(expectedParts);
      restored.forEach((part, partIndex) => {
        const original = h.elements[partIndex];
        expect(part).toMatchObject({ type: original.type, groupIds: original.groupIds });
        if (isLineElement(original)) {
          expect(part).toMatchObject({ polygon: original.polygon, points: original.points });
        }
      });
      const svg = await exportToSvg(restored, { exportBackground: false, viewBackgroundColor: "#fff" }, {});
      expect(svg.querySelectorAll("path").length).toBeGreaterThanOrEqual(h.elements.filter(isLineElement).length);
      expect(svg.querySelector("image")).toBeNull();
      expect(svg.outerHTML).not.toContain("NaN");
    },
  );

  it.each([
    [220, 180],
    [-20, 180],
    [220, 20],
    [-20, 20],
  ])("draws the same bounding dimensions toward (%s, %s)", (x, y) => {
    selectShape();
    const element = draw([100, 100], [x, y]);
    expect(
      getElementAbsoluteCoords(
        element,
        h.app.scene.getNonDeletedElementsMap(),
      ).slice(0, 4),
    ).toEqual([
      Math.min(x, 100),
      Math.min(y, 100),
      Math.max(x, 100),
      Math.max(y, 100),
    ]);
  });

  it("hides contour points and their hover highlight when a closed shape is selected", () => {
    selectShape(
      COURSEWARE_SHAPE_PRESETS.findIndex(({ id }) => id === "rounded-rectangle"),
    );
    const element = draw();
    const [vertex] = LinearElementEditor.getPointsGlobalCoordinates(
      element,
      h.app.scene.getNonDeletedElementsMap(),
    );
    mouse.clickAt(40, 40);
    const renderCircle = vi.spyOn(RendererHelpers, "fillCircle");
    try {
      mouse.clickAt(vertex[0], vertex[1]);
      expect(h.state.selectedLinearElement).toMatchObject({
        elementId: element.id,
        isEditing: false,
      });
      mouse.moveTo(vertex[0], vertex[1]);
      expect(h.state.selectedLinearElement?.hoverPointIndex).toBe(-1);
      expect(
        h.state.selectedLinearElement?.segmentMidPointHoveredCoords,
      ).toBeNull();
      expect(GlobalTestState.interactiveCanvas.style.cursor).toBe("move");
      expect(
        renderCircle.mock.calls.some(
          ([, , , radius]) =>
            radius === LinearElementEditor.POINT_HANDLE_SIZE / 2,
        ),
      ).toBe(false);
      expect(
        renderCircle.mock.calls.some(
          ([, x, y]) => x === vertex[0] && y === vertex[1],
        ),
      ).toBe(false);
    } finally {
      renderCircle.mockRestore();
    }
  });

  it("moves the complete shape when dragging a contour vertex and retains resize and rotation", () => {
    selectShape();
    const element = draw();
    const original = { x: element.x, y: element.y, points: [...element.points] };
    const [vertex] = LinearElementEditor.getPointsGlobalCoordinates(
      element,
      h.app.scene.getNonDeletedElementsMap(),
    );
    mouse.clickAt(40, 40);
    mouse.clickAt(vertex[0], vertex[1]);
    mouse.moveTo(vertex[0], vertex[1]);
    mouse.downAt();
    mouse.moveTo(vertex[0] + 20, vertex[1] + 30);
    mouse.upAt();
    expect(element.points).toEqual(original.points);
    expect(element.x).toBeCloseTo(original.x + 20);
    expect(element.y).toBeCloseTo(original.y + 30);
    expect(h.state.selectedLinearElement?.initialState.lastClickedPoint).toBe(
      -1,
    );
    UI.resize(element, "se", [60, 40]);
    expect(element.width).toBeCloseTo(180);
    expect(element.height).toBeCloseTo(120);
    UI.rotate(element, [40, 20]);
    expect(element.angle).not.toBe(0);
  });

  it("keeps contour points editable explicitly and hides them again on exit", () => {
    selectShape(
      COURSEWARE_SHAPE_PRESETS.findIndex(({ id }) => id === "rounded-rectangle"),
    );
    const element = draw();
    const originalPoints = [...element.points];
    const vertex = LinearElementEditor.getPointsGlobalCoordinates(
      element,
      h.app.scene.getNonDeletedElementsMap(),
    )[1];
    mouse.clickAt(40, 40);
    mouse.clickAt(vertex[0], vertex[1]);
    Keyboard.withModifierKeys({ ctrl: true }, () =>
      Keyboard.keyPress(KEYS.ENTER),
    );
    expect(h.state.selectedLinearElement?.isEditing).toBe(true);
    mouse.moveTo(vertex[0], vertex[1]);
    mouse.downAt();
    mouse.moveTo(vertex[0] + 20, vertex[1] + 30);
    mouse.upAt();
    expect(element.points).not.toEqual(originalPoints);
    Keyboard.keyPress(KEYS.ESCAPE);
    expect(h.state.selectedLinearElement?.isEditing).toBe(false);
    const [nextVertex] = LinearElementEditor.getPointsGlobalCoordinates(
      element,
      h.app.scene.getNonDeletedElementsMap(),
    );
    mouse.moveTo(nextVertex[0], nextVertex[1]);
    expect(h.state.selectedLinearElement?.hoverPointIndex).toBe(-1);
    expect(h.state.selectedLinearElement?.initialState.lastClickedPoint).toBe(
      -1,
    );
    UI.resize(element, "se", [60, 40]);
    expect(h.state.resizingElement).toBeNull();
    expect(element.width).toBeGreaterThan(120);
  });

  it("retains bounding-box resizing for closed shapes on touch devices", () => {
    const editorInterface = h.app.editorInterface;
    h.app.editorInterface = {
      ...editorInterface,
      userAgent: { ...editorInterface.userAgent, isMobileDevice: true },
    };
    try {
      selectShape();
      const element = draw();
      mouse.clickAt(40, 40);
      mouse.clickAt(160, 100);
      UI.resize(element, "se", [60, 40]);
      expect(element.width).toBeCloseTo(180);
      expect(element.height).toBeCloseTo(120);
      expect(h.state.selectedLinearElement?.initialState.lastClickedPoint).toBe(
        -1,
      );
    } finally {
      h.app.editorInterface = editorInterface;
    }
  });

  it("supports Shift proportions and Alt center drawing together", () => {
    selectShape();
    Keyboard.withModifierKeys({ shift: true, alt: true }, () => {
      const element = draw();
      expect(element.width).toBe(240);
      expect(element.height).toBe(240);
      expect(
        getElementAbsoluteCoords(
          element,
          h.app.scene.getNonDeletedElementsMap(),
        ).slice(0, 4),
      ).toEqual([-20, -20, 220, 220]);
    });
  });

  it("updates proportions when Shift is pressed and released mid drag", () => {
    selectShape();
    mouse.downAt(100, 100);
    mouse.moveTo(220, 180);
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyDown("Shift"));
    expect(h.state.newElement?.height).toBe(120);
    Keyboard.keyUp("Shift");
    expect(h.state.newElement?.height).toBe(80);
    mouse.upAt();
  });

  it("supports locked repeated drawing and single-step undo/redo", () => {
    selectShape(2, true);
    const first = draw();
    expect(h.state.activeTool).toMatchObject({
      type: "custom",
      customType: COURSEWARE_SHAPE_PRESETS[2].customType,
      locked: true,
    });
    const second = draw([300, 200], [360, 260]);
    expect(API.getUndoStack()).toHaveLength(2);
    Keyboard.undo();
    expect(h.elements.find(({ id }) => id === first.id)?.isDeleted).toBe(false);
    expect(h.elements.find(({ id }) => id === second.id)?.isDeleted).toBe(true);
    Keyboard.redo();
    expect(h.elements.find(({ id }) => id === second.id)).toMatchObject({
      polygon: true,
      isDeleted: false,
      points: second.points,
    });
  });

  it("retains the frame containing the drawing", () => {
    const frame = API.createElement({
      type: "frame",
      x: 0,
      y: 0,
      width: 500,
      height: 400,
    });
    API.setElements([frame]);
    selectShape();
    expect(draw().frameId).toBe(frame.id);
  });

  it.each(["cylinder", "brace", "brace-right"])("selects, resizes and undoes every part of %s together", (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    draw();
    const original = h.elements.map((element) => ({ ...element }));
    expect(API.getUndoStack()).toHaveLength(1);
    expect(h.app.scene.getSelectedElements({ ...h.state, includeBoundTextElement: true })).toHaveLength(original.length);
    UI.resize([...h.elements], "se", [60, 40]);
    const [left, top, right, bottom] = getCommonBounds(h.elements);
    expect(right - left).toBeCloseTo(180);
    expect(bottom - top).toBeCloseTo(120);
    Keyboard.undo();
    expect(h.elements.map((element) => ({ x: element.x, y: element.y, width: element.width, height: element.height })))
      .toEqual(original.map((element) => ({ x: element.x, y: element.y, width: element.width, height: element.height })));
    Keyboard.undo();
    expect(h.elements.every((element) => element.isDeleted)).toBe(true);
    Keyboard.redo();
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(original.length);
  });

  it.each(["cylinder", "brace", "brace-right"])("cleans up all unfinished parts of %s", (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    draw([100, 100], [100, 100]);
    expect(h.elements).toHaveLength(0);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it.each([
    ["brace", "e"], ["brace", "w"], ["brace-right", "e"], ["brace-right", "w"],
  ] as const)("changes %s text width with the %s handle without scaling the curve or font", async (id, direction) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    const curve = draw([100, 100], [220, 340]);
    const container = h.elements.find(isCoursewareBraceElement)!;
    mouse.doubleClickAt(160, 220);
    const editor = await getTextEditor();
    act(() => updateTextEditor(editor, "你好测试言伯"));
    Keyboard.keyPress("Escape", editor);
    const text = h.elements.find(isTextElement)!;
    const originalCurve = { width: curve.width, height: curve.height, points: curve.points };
    const fontSize = text.fontSize;
    const originalMaxWidth = getCoursewareBraceTextRect(container).width;

    resizeBraceWidth(direction, -60);
    expect(container.width).toBeCloseTo(60);
    expect(container.height).toBe(240);
    expect(curve).toMatchObject(originalCurve);
    expect(text.fontSize).toBe(fontSize);
    expect(text.text.split("\n").length).toBeGreaterThan(1);
    expect(getCoursewareBraceTextRect(container).width).toBeLessThan(originalMaxWidth);
    expect(direction === "e" ? container.x : container.x + container.width).toBeCloseTo(direction === "e" ? 100 : 220);

    resizeBraceWidth(direction, 160);
    expect(container.width).toBeCloseTo(220);
    expect(container.height).toBe(240);
    expect(curve).toMatchObject(originalCurve);
    expect(text.fontSize).toBe(fontSize);
    expect(text.text).toBe("你好测试言伯");
    expect(h.elements.filter(isTextElement)).toHaveLength(1);
    Keyboard.undo();
    expect(h.elements.find(isCoursewareBraceElement)?.width).toBeCloseTo(60);
    Keyboard.redo();
    expect(h.elements.find(isCoursewareBraceElement)?.width).toBeCloseTo(220);
    const restored = restoreElements(JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local")).elements, null);
    expect(getCoursewareBraceTextRect(restored.find(isCoursewareBraceElement)!).width).toBeCloseTo(186);
  });

  it.each(["brace", "brace-right"])("adjusts rotated %s text width from its local side and center", (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    draw([100, 100], [220, 340]);
    UI.rotate([...h.elements], [80, -40]);
    const { container, curve } = getCoursewareBraceSelection(h.elements)!;
    expect(container.angle).not.toBe(0);
    const center = { x: container.x + container.width / 2, y: container.y + container.height / 2 };
    const width = curve.width;
    const height = curve.height;
    const text = h.elements.find(isTextElement)!;
    const fontSize = text.fontSize;

    resizeBraceWidth("e", 40, true);
    expect(container.width).toBeCloseTo(200);
    expect(container.x + container.width / 2).toBeCloseTo(center.x);
    expect(container.y + container.height / 2).toBeCloseTo(center.y);
    expect(curve.width).toBe(width);
    expect(curve.height).toBe(height);
    expect(text.fontSize).toBe(fontSize);

    resizeBraceWidth("w", 40);
    expect(container.width).toBeCloseTo(240);
    expect(container.x + container.width / 2).toBeCloseTo(center.x - 20 * Math.cos(container.angle));
    expect(container.y + container.height / 2).toBeCloseTo(center.y - 20 * Math.sin(container.angle));
    expect(curve.width).toBe(width);
    expect(curve.height).toBe(height);
  });

  it("only adds width handles to one complete brace selection", () => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === "brace"));
    draw();
    const elementsMap = h.app.scene.getNonDeletedElementsMap();
    const handles = getCoursewareBraceWidthHandles(h.elements, h.state.zoom, elementsMap);
    expect(handles.e).toBeDefined();
    expect(handles.w).toBeDefined();
    expect(Object.keys(handles).sort()).toEqual(["e", "w"]);
    const unrelated = API.createElement({ type: "rectangle" });
    expect(getCoursewareBraceWidthHandles([...h.elements, unrelated], h.state.zoom, elementsMap)).toEqual({});
    expect(getCoursewareBraceWidthHandles(h.elements.filter(isLineElement), h.state.zoom, elementsMap)).toEqual({});
  });

  it.each(["brace", "brace-right"])("creates and edits one persistent bound text node for %s", async (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    const curve = draw();
    const container = h.elements.find(isCoursewareBraceElement)!;
    const text = h.elements.find(isTextElement)!;
    expect(container).toMatchObject({ x: 100, y: 100, width: 120, height: 80, strokeColor: "transparent" });
    expect(curve.width).toBeCloseTo(18);
    const [curveLeft, , curveRight] = getElementAbsoluteCoords(curve, h.app.scene.getNonDeletedElementsMap());
    expect(curveLeft).toBeCloseTo(id === "brace" ? 202 : 100);
    expect(curveRight).toBeCloseTo(id === "brace" ? 220 : 118);
    expect(text).toMatchObject({ containerId: container.id, text: "", fontSize: 14, textAlign: "center", verticalAlign: "middle" });
    expect(container.boundElements).toEqual([{ type: "text", id: text.id }]);

    mouse.doubleClickAt(160, 140);
    expect(h.state.editingTextElement?.id).toBe(text.id);
    await getTextEditor();
    Keyboard.keyPress("Escape");
    expect(h.app.scene.getNonDeletedElement(text.id)).not.toBeNull();
    expect(h.app.scene.getNonDeletedElement(container.id)?.boundElements).toEqual([{ type: "text", id: text.id }]);
    const blankScene = restoreElements(
      JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local")).elements,
      null,
      { deleteInvisibleElements: true },
    );
    expect(blankScene.find((item) => item.id === text.id)?.isDeleted).toBe(false);

    mouse.doubleClickAt(160, 140);
    expect(h.state.editingTextElement?.id).toBe(text.id);
    const editor = await getTextEditor();
    expect(editor).not.toBeNull();
    act(() => updateTextEditor(editor, "5565656"));
    Keyboard.keyPress("Escape");
    const editedText = h.app.scene.getNonDeletedElement(text.id)!;
    expect(editedText).toMatchObject({ originalText: "5565656", containerId: container.id });
    expect(h.elements.filter(isTextElement)).toHaveLength(1);
    expect(editedText.x).toBeGreaterThan(id === "brace" ? 100 : curveRight);
    expect(editedText.x + editedText.width).toBeLessThanOrEqual(id === "brace" ? curveLeft : 220);
    const restored = restoreElements(
      JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local")).elements, null,
    );
    const svg = await exportToSvg(restored, { exportBackground: false, viewBackgroundColor: "#fff" }, {});
    expect(svg.textContent).toContain("5565656");
    expect(svg.querySelector(`[clip-path="url(#brace-text-${text.id})"]`)).not.toBeNull();

    mouse.doubleClickAt(160, 140);
    expect(h.state.editingTextElement?.id).toBe(text.id);
    const emptyEditor = await getTextEditor();
    act(() => updateTextEditor(emptyEditor, ""));
    Keyboard.keyPress("Escape");
    expect(h.app.scene.getNonDeletedElement(text.id)).toMatchObject({ text: "", isDeleted: false });
  });

  it.each(["brace", "brace-right"])("keeps the invisible container and text layout of %s stable after style and rotation changes", async (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    draw();
    const container = h.elements.find(isCoursewareBraceElement)!;
    const text = h.elements.find(isTextElement)! as ExcalidrawTextElementWithContainer;
    const previousCenter = { x: text.x + text.width / 2, y: text.y + text.height / 2 };
    act(() => { h.app.scene.mutateElement(container, { backgroundColor: "#ff0000", strokeColor: "#ff0000", strokeWidth: 8 }); });
    const svg = await exportToSvg(h.elements, { exportBackground: false, viewBackgroundColor: "#fff" }, {});
    expect(svg.outerHTML).not.toContain("#ff0000");

    act(() => { h.app.scene.mutateElement(container, { angle: Math.PI / 2 as typeof container.angle }); });
    const position = computeBoundTextPosition(container, text, h.app.scene.getNonDeletedElementsMap());
    expect(position.x + text.width / 2).toBeCloseTo(container.x + container.width / 2);
    expect(position.y + text.height / 2).toBeCloseTo(container.y + container.height / 2 + previousCenter.x - (container.x + container.width / 2));
  });

  it.each(["brace", "brace-right"])("duplicates %s with an independent editable text node", (id) => {
    selectShape(COURSEWARE_SHAPE_PRESETS.findIndex((preset) => preset.id === id));
    draw();
    const originalText = h.elements.find(isTextElement)!;
    Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("d"));
    const duplicateContainer = h.elements.filter(isCoursewareBraceElement).at(-1)!;
    const duplicateText = h.elements.filter(isTextElement).at(-1)!;
    expect(duplicateText.id).not.toBe(originalText.id);
    expect(duplicateText.containerId).toBe(duplicateContainer.id);
    expect(duplicateContainer.boundElements).toEqual([{ type: "text", id: duplicateText.id }]);
    mouse.doubleClickAt(duplicateContainer.x + duplicateContainer.width / 2, duplicateContainer.y + duplicateContainer.height / 2);
    expect(h.state.editingTextElement?.id).toBe(duplicateText.id);
    Keyboard.keyPress("Escape");
  });

  it.each([
    [100, 100],
    [220, 100],
    [100, 180],
  ])(
    "drops clicks or zero-area polygons without starting multi-point mode (%s, %s)",
    (x, y) => {
      selectShape();
      draw([100, 100], [x, y]);
      expect(h.elements).toHaveLength(0);
      expect(h.state.newElement).toBeNull();
      expect(h.state.multiElement).toBeNull();
      expect(API.getUndoStack()).toHaveLength(0);
    },
  );

  it("preserves other custom tools without creating shapes", () => {
    act(() => h.app.setActiveTool({ type: "custom", customType: "comment" }));
    draw();
    expect(h.elements).toHaveLength(0);
  });
});
