import React from "react";

import {
  getCommonBounds,
  isArrowElement,
  isLineElement,
  LinearElementEditor,
} from "@excalidraw/element";
import { isCoursewareBraceElement } from "@excalidraw/element/coursewareBrace";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { COURSEWARE_SHAPE_PRESETS } from "../coursewareShapes";
import { COURSEWARE_WHITEBOARD_SHAPE_KINDS } from "../coursewareShapePaths";
import { serializeAsJSON } from "../data/json";
import { restoreElements } from "../data/restore";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, render } from "./test-utils";

import type { ShapeKind } from "../coursewareShapePaths";

const { h } = window;
const mouse = new Pointer("mouse");
const arrowTypes = ["sharp", "round", "elbow"] as const;

const current = <T extends ExcalidrawElement>(element: T): T =>
  h.elements.find(({ id }) => id === element.id) as T;

const arrowEnd = (arrow: ExcalidrawArrowElement) =>
  LinearElementEditor.getPointAtIndexGlobalCoordinates(
    current(arrow),
    -1,
    h.app.scene.getNonDeletedElementsMap()
  );

const drawShape = (kind: ShapeKind) => {
  const preset = COURSEWARE_SHAPE_PRESETS.find((item) => item.kind === kind);
  act(() => {
    h.app.setActiveTool(
      preset
        ? { type: "custom", customType: preset.customType }
        : { type: kind as "rectangle" | "diamond" | "ellipse" }
    );
  });
  const existing = new Set(h.elements.map(({ id }) => id));
  mouse.downAt(100, 100);
  mouse.moveTo(260, 220);
  mouse.upAt();
  const parts = h.elements.filter(({ id }) => !existing.has(id));
  const target = parts.find(isCoursewareBraceElement) ?? parts[0];
  const [left, top, right, bottom] = getCommonBounds(parts);
  return {
    target,
    parts,
    center: [(left + right) / 2, (top + bottom) / 2] as const,
    // Start on a visible outline while the shape is not selected, so the
    // gesture moves the whole object rather than a resize/point handle.
    dragPoint: isLineElement(parts[0])
      ? ([parts[0].x, parts[0].y] as const)
      : ([left + (right - left) / 2, top] as const),
  };
};

const drawArrow = (
  endpoint: readonly [number, number],
  type: (typeof arrowTypes)[number] = "sharp"
) => {
  API.setAppState({ currentItemArrowType: type });
  UI.clickTool("arrow");
  mouse.downAt(450, 300);
  mouse.moveTo(endpoint[0], endpoint[1]);
  const suggested = h.state.suggestedBinding;
  mouse.upAt();
  const arrow = h.elements.filter(isArrowElement).at(-1)!;
  return { arrow, suggested };
};

const dragShape = (shape: ReturnType<typeof drawShape>) => {
  UI.clickTool("selection");
  mouse.clickAt(20, 20);
  mouse.downAt(shape.dragPoint[0], shape.dragPoint[1]);
  mouse.moveTo(shape.dragPoint[0] + 35, shape.dragPoint[1] + 25);
  mouse.upAt();
};

describe("courseware shape connector integration", () => {
  beforeEach(async () => {
    await render(<Excalidraw role="teacher" handleKeyboardGlobally />);
    API.setAppState({
      currentItemRoughness: 0,
      currentItemBackgroundColor: "transparent",
    });
    mouse.reset();
  });

  it.each(COURSEWARE_WHITEBOARD_SHAPE_KINDS)(
    "offers an inside binding for %s and follows a complete-object drag",
    (kind) => {
      const shape = drawShape(kind);
      const { arrow, suggested } = drawArrow(shape.center);
      expect(suggested?.id).toBe(shape.target.id);
      expect(arrow.endBinding?.elementId).toBe(shape.target.id);
      expect(current(shape.target).boundElements).toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      const before = arrowEnd(arrow);
      const positions = shape.parts.map(({ x, y }) => ({ x, y }));

      dragShape(shape);

      shape.parts.forEach((part, index) => {
        expect(current(part).x).toBeCloseTo(positions[index].x + 35);
        expect(current(part).y).toBeCloseTo(positions[index].y + 25);
      });
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      expect(arrowEnd(arrow)).not.toEqual(before);
      expect(current(arrow).points.flat().every(Number.isFinite)).toBe(true);
    }
  );

  it.each(
    (["rectangle", "star", "cylinder", "brace"] as const).flatMap((kind) =>
      arrowTypes.map((type) => [kind, type] as const)
    )
  )(
    "binds an existing endpoint dragged into unfilled %s with a %s connector",
    (kind, type) => {
      const shape = drawShape(kind);
      const { arrow } = drawArrow([330, 300], type);
      expect(arrow.endBinding).toBeNull();
      const end = arrowEnd(arrow);
      mouse.downAt(end[0], end[1]);
      mouse.moveTo(shape.center[0], shape.center[1]);
      expect(h.state.suggestedBinding?.id).toBe(shape.target.id);
      mouse.upAt();
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      const before = arrowEnd(arrow);
      dragShape(shape);
      expect(arrowEnd(arrow)).not.toEqual(before);
    }
  );

  it.each(["triangle", "cylinder", "brace", "brace-right"] as const)(
    "preserves %s bindings through save, restore, drag and one undo/redo",
    (kind) => {
      const shape = drawShape(kind);
      const { arrow } = drawArrow(shape.center);
      const saved = JSON.parse(
        serializeAsJSON(h.elements, h.state, {}, "local")
      );
      API.setElements(restoreElements(saved.elements, null));
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      const before = arrowEnd(arrow);
      const targetBefore = {
        x: current(shape.target).x,
        y: current(shape.target).y,
      };
      dragShape(shape);

      const after = arrowEnd(arrow);
      expect(after).not.toEqual(before);
      Keyboard.undo();
      expect(current(shape.target)).toMatchObject(targetBefore);
      expect(arrowEnd(arrow)).toEqual(before);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      Keyboard.redo();
      expect(arrowEnd(arrow)).toEqual(after);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
    }
  );

  it.each(["sharp", "round", "elbow"] as const)(
    "binds a %s connector to a previously saved polygon without custom metadata",
    (type) => {
      const shape = drawShape("star");
      expect(shape.target.customData).toBeUndefined();
      API.setElements(
        restoreElements(
          JSON.parse(serializeAsJSON(h.elements, h.state, {}, "local"))
            .elements,
          null
        )
      );
      const { arrow } = drawArrow(shape.center, type);
      expect(arrow.endBinding?.elementId).toBe(shape.target.id);
      const before = arrowEnd(arrow);
      dragShape(shape);
      expect(arrowEnd(arrow)).not.toEqual(before);
      expect(current(arrow).points.flat().every(Number.isFinite)).toBe(true);
    }
  );

  it.each(["triangle", "circle", "star", "cross"] as const)(
    "does not bind within an empty bounding-box corner of %s",
    (kind) => {
      drawShape(kind);
      const { arrow, suggested } = drawArrow([105, 105]);
      expect(suggested).toBeNull();
      expect(arrow.endBinding).toBeNull();
    }
  );

  it("keeps a normal open line from becoming a binding target", () => {
    UI.createElement("line", { x: 100, y: 100, width: 160, height: 120 });
    const { arrow, suggested } = drawArrow([180, 160]);
    expect(suggested).toBeNull();
    expect(arrow.endBinding).toBeNull();
  });

  it.each(["rectangle", "rounded-rectangle", "star"] as const)(
    "keeps the connector attached when %s is resized and rotated",
    (kind) => {
      const shape = drawShape(kind);
      const { arrow } = drawArrow([shape.center[0] + 15, shape.center[1] + 5]);
      expect(arrow.endBinding?.elementId).toBe(shape.target.id);
      const beforeResize = arrowEnd(arrow);
      const widthBefore = shape.target.width;
      const heightBefore = shape.target.height;

      UI.resize(current(shape.target), "se", [80, 60]);

      expect(current(shape.target).width).toBeCloseTo(widthBefore + 80);
      expect(current(shape.target).height).toBeCloseTo(heightBefore + 60);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      const beforeRotate = arrowEnd(arrow);
      expect(beforeRotate).not.toEqual(beforeResize);

      UI.rotate(current(shape.target), [65, 35]);

      expect(current(shape.target).angle).not.toBe(0);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
      expect(arrowEnd(arrow)).not.toEqual(beforeRotate);
      expect(current(arrow).points.flat().every(Number.isFinite)).toBe(true);
      Keyboard.undo();
      expect(current(shape.target).angle).toBe(0);
      expect(arrowEnd(arrow)).toEqual(beforeRotate);
      Keyboard.redo();
      expect(current(shape.target).angle).not.toBe(0);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
    }
  );

  it.each(["rectangle", "rounded-rectangle", "star", "circle"] as const)(
    "binds to a rotated %s using its real visual center and follows later movement",
    (kind) => {
      const shape = drawShape(kind);
      UI.rotate(current(shape.target), [55, 25]);
      const rotated = current(shape.target);
      expect(rotated.angle).not.toBe(0);
      UI.clickTool("arrow");
      mouse.downAt(shape.center[0] - 10, shape.center[1] - 5);
      mouse.moveTo(shape.center[0] + 15, shape.center[1] + 5);
      mouse.upAt();
      const arrow = h.elements.filter(isArrowElement).at(-1)!;
      expect(arrow.endBinding?.elementId).toBe(rotated.id);
      expect(arrow.endBinding?.mode).toBe("inside");
      const before = arrowEnd(arrow);
      expect(before[0]).toBeCloseTo(shape.center[0] + 15);
      expect(before[1]).toBeCloseTo(shape.center[1] + 5);
      const originalTargetPosition = { x: rotated.x, y: rotated.y };
      const vertex = isLineElement(rotated)
        ? LinearElementEditor.getPointAtIndexGlobalCoordinates(
            rotated,
            0,
            h.app.scene.getNonDeletedElementsMap()
          )
        : ([
            shape.center[0] + (rotated.height / 2) * Math.sin(rotated.angle),
            shape.center[1] - (rotated.height / 2) * Math.cos(rotated.angle),
          ] as const);

      dragShape({
        ...shape,
        target: rotated,
        dragPoint: vertex,
      });

      expect(current(rotated).x).toBeCloseTo(originalTargetPosition.x + 35);
      expect(current(rotated).y).toBeCloseTo(originalTargetPosition.y + 25);
      expect(current(arrow).endBinding?.elementId).toBe(rotated.id);
      expect(arrowEnd(arrow)[0]).toBeCloseTo(before[0] + 35);
      expect(arrowEnd(arrow)[1]).toBeCloseTo(before[1] + 25);
      expect(current(arrow).points.flat().every(Number.isFinite)).toBe(true);
    }
  );

  it.each(["rectangle", "rounded-rectangle", "star", "cylinder"] as const)(
    "remaps %s and its connector when duplicating and moves only the copy",
    (kind) => {
      const shape = drawShape(kind);
      const { arrow } = drawArrow(shape.center);
      const originalIds = new Set(h.elements.map(({ id }) => id));
      const originalEnd = arrowEnd(arrow);
      const originalPosition = { x: shape.target.x, y: shape.target.y };
      API.setSelectedElements([...shape.parts, current(arrow)]);
      Keyboard.withModifierKeys({ ctrl: true }, () => Keyboard.keyPress("d"));

      const copies = h.elements.filter(({ id }) => !originalIds.has(id));
      const arrowCopy = copies.find(isArrowElement)!;
      const shapeCopies = copies.filter((element) => !isArrowElement(element));
      const targetCopy = shapeCopies.find(
        ({ id }) => id === arrowCopy.endBinding?.elementId
      )!;
      expect(copies).toHaveLength(shape.parts.length + 1);
      expect(targetCopy).toBeDefined();
      expect(targetCopy.id).not.toBe(shape.target.id);
      expect(targetCopy.boundElements).toContainEqual({
        id: arrowCopy.id,
        type: "arrow",
      });
      expect(targetCopy.boundElements).not.toContainEqual({
        id: arrow.id,
        type: "arrow",
      });
      const copiedEnd = arrowEnd(arrowCopy);
      const copyOffset = {
        x: targetCopy.x - shape.target.x,
        y: targetCopy.y - shape.target.y,
      };

      dragShape({
        ...shape,
        target: targetCopy,
        parts: shapeCopies,
        dragPoint: [
          shape.dragPoint[0] + copyOffset.x,
          shape.dragPoint[1] + copyOffset.y,
        ],
      });

      expect(current(arrowCopy).endBinding?.elementId).toBe(targetCopy.id);
      expect(arrowEnd(arrowCopy)).not.toEqual(copiedEnd);
      expect(current(shape.target)).toMatchObject(originalPosition);
      expect(arrowEnd(arrow)).toEqual(originalEnd);
      expect(current(arrow).endBinding?.elementId).toBe(shape.target.id);
    }
  );
});
