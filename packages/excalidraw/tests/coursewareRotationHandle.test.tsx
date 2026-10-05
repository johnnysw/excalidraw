import React from "react";

import { arrayToMap } from "@excalidraw/common";
import {
  getCommonBounds,
  getElementAbsoluteCoords,
  getTransformHandles,
  getTransformHandlesFromCoords,
  isPointInRotationHandle,
  newElement,
  newFrameElement,
  newArrowElement,
  resizeTest,
} from "@excalidraw/element";
import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { TransformHandle } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { Radians } from "@excalidraw/math";

import { COURSEWARE_EMOJI_CUSTOM_TYPE } from "../coursewareInsertTools";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, render } from "./test-utils";

import type { Zoom } from "../types";

const { h } = window;
const mouse = new Pointer("mouse");
const handleCenter = ([x, y, width, height]: TransformHandle) =>
  pointFrom(x + width / 2, y + height / 2);
const zoomAt = (value: number) => ({ value } as Zoom);
const radians = (degrees: number) => ((degrees * Math.PI) / 180) as Radians;

describe("courseware rotation handle geometry", () => {
  it.each(
    [0.5, 1, 2].flatMap((zoom) => [0, 45, 120].map((angle) => [zoom, angle]))
  )(
    "keeps the icon at the rotated lower-left corner at zoom %s and angle %s",
    (zoom, angle) => {
      const element = newElement({
        type: "rectangle",
        x: 200,
        y: 180,
        width: 240,
        height: 120,
        angle: radians(angle),
      });
      const handles = getTransformHandles(
        element,
        zoomAt(zoom),
        arrayToMap([element]),
        "mouse",
        undefined,
        "bottom-left"
      );
      const center = handleCenter(handles.rotation!);
      const expected = pointRotateRads(
        pointFrom(200 - 14 / zoom, 300 + 14 / zoom),
        pointFrom(320, 240),
        radians(angle)
      );
      expect(center[0]).toBeCloseTo(expected[0]);
      expect(center[1]).toBeCloseTo(expected[1]);
      expect(handles.rotation![2] * zoom).toBe(24);
      expect(
        isPointInRotationHandle(
          handles.rotation!,
          center[0],
          center[1],
          element.angle,
          "bottom-left"
        )
      ).toBe(true);
    }
  );

  it("preserves the default bottom-center handle for other canvases", () => {
    const element = newElement({
      type: "rectangle",
      x: 200,
      y: 180,
      width: 240,
      height: 120,
    });
    const defaultHandles = getTransformHandles(
      element,
      zoomAt(1),
      arrayToMap([element])
    );
    const explicitHandles = getTransformHandles(
      element,
      zoomAt(1),
      arrayToMap([element]),
      "mouse",
      undefined,
      "bottom"
    );
    expect(defaultHandles).toEqual(explicitHandles);
    expect(handleCenter(defaultHandles.rotation!)[0]).toBe(320);
    expect(handleCenter(defaultHandles.rotation!)[1]).toBeGreaterThan(300);
  });

  it("preserves frame, locked and elbow-arrow restrictions", () => {
    const elements = [
      newElement({
        type: "rectangle",
        x: 200,
        y: 180,
        width: 240,
        height: 120,
        locked: true,
      }),
      newFrameElement({ x: 200, y: 180, width: 240, height: 120 }),
      newArrowElement({
        type: "arrow",
        x: 200,
        y: 180,
        width: 240,
        height: 120,
        points: [pointFrom(0, 0), pointFrom(240, 120)],
        elbowed: true,
      }),
    ];
    for (const element of elements) {
      expect(
        getTransformHandles(
          element,
          zoomAt(1),
          arrayToMap(elements),
          "mouse",
          undefined,
          "bottom-left"
        ).rotation
      ).toBeUndefined();
    }
  });
});

describe("courseware rotation interactions", () => {
  beforeEach(async () => {
    await render(
      <Excalidraw
        role="teacher"
        handleKeyboardGlobally
        UIOptions={{ toolbarLayout: "left" }}
      />
    );
  });

  const drawElement = (
    type: "rectangle" | "ellipse",
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    act(() => h.app.setActiveTool({ type }));
    mouse.downAt(bounds.x, bounds.y);
    mouse.moveTo(bounds.x + bounds.width, bounds.y + bounds.height);
    mouse.upAt();
    return h.elements[h.elements.length - 1];
  };

  const rotate = (
    elements: ExcalidrawElement[],
    degrees: number,
    shift = false
  ) => {
    act(() => h.app.setActiveTool({ type: "selection" }));
    API.setSelectedElements(elements);
    const map = h.app.scene.getNonDeletedElementsMap();
    const [x1, y1, x2, y2, cx, cy] =
      elements.length === 1
        ? getElementAbsoluteCoords(elements[0], map, true)
        : (() => {
            const bounds = getCommonBounds(elements);
            return [
              ...bounds,
              (bounds[0] + bounds[2]) / 2,
              (bounds[1] + bounds[3]) / 2,
            ] as const;
          })();
    const handles =
      elements.length === 1
        ? getTransformHandles(
            elements[0],
            h.state.zoom,
            map,
            "mouse",
            undefined,
            "bottom-left"
          )
        : getTransformHandlesFromCoords(
            [x1, y1, x2, y2, cx, cy],
            0 as Radians,
            h.state.zoom,
            "mouse",
            undefined,
            undefined,
            undefined,
            "bottom-left"
          );
    const start = handleCenter(handles.rotation!);
    const end = pointRotateRads(start, pointFrom(cx, cy), radians(degrees));
    const toViewport = ([x, y]: readonly number[]) =>
      [
        (x + h.state.scrollX) * h.state.zoom.value + h.state.offsetLeft,
        (y + h.state.scrollY) * h.state.zoom.value + h.state.offsetTop,
      ] as const;
    mouse.downAt(...toViewport(start));
    Keyboard.withModifierKeys({ shift }, () =>
      mouse.moveTo(...toViewport(end))
    );
    expect(h.state.isRotating).toBe(true);
    mouse.upAt();
  };

  it.each(["mouse", "touch", "pen"] as const)(
    "hits the new handle while keeping lower-left resize reachable with %s",
    (pointerType) => {
      const element = drawElement("rectangle", {
        x: 200,
        y: 180,
        width: 240,
        height: 120,
      });
      API.setSelectedElements([element]);
      const map = h.app.scene.getNonDeletedElementsMap();
      const handles = getTransformHandles(
        element,
        h.state.zoom,
        map,
        pointerType,
        {},
        "bottom-left"
      );
      for (const type of ["rotation", "sw"] as const) {
        const [x, y] = handleCenter(handles[type]!);
        expect(
          resizeTest(
            element,
            map,
            h.state,
            x,
            y,
            h.state.zoom,
            pointerType,
            h.app.editorInterface,
            "bottom-left"
          )
        ).toBe(type);
      }
      const [oldX, oldY] = handleCenter(
        getTransformHandles(element, h.state.zoom, map, pointerType).rotation!
      );
      expect(
        resizeTest(
          element,
          map,
          h.state,
          oldX,
          oldY,
          h.state.zoom,
          pointerType,
          h.app.editorInterface,
          "bottom-left"
        )
      ).not.toBe("rotation");
    }
  );

  it.each([0, 70, 350])(
    "rotates a %s degree object without jumping on drag start",
    (angle) => {
      const rectangle = drawElement("rectangle", {
        x: 200,
        y: 180,
        width: 240,
        height: 120,
      });
      API.updateElement(rectangle, { angle: radians(angle) });
      rotate([rectangle], 0.25);
      expect(API.getElement(rectangle).angle).toBeCloseTo(
        radians(angle + 0.25)
      );
    }
  );

  it("rotates the native emoji and supports one undo/redo", () => {
    act(() =>
      h.app.setActiveTool({
        type: "custom",
        customType: COURSEWARE_EMOJI_CUSTOM_TYPE,
      })
    );
    mouse.clickAt(400, 300);
    const emoji = h.elements[0];
    expect(emoji.type).toBe("text");
    rotate([emoji], 30);
    expect(API.getElement(emoji).angle).toBeCloseTo(radians(30));
    Keyboard.undo();
    expect(API.getElement(emoji).angle).toBeCloseTo(0);
    Keyboard.redo();
    expect(API.getElement(emoji).angle).toBeCloseTo(radians(30));
  });

  it("keeps Shift angle snapping", () => {
    const rectangle = drawElement("rectangle", {
      x: 200,
      y: 180,
      width: 240,
      height: 120,
    });
    rotate([rectangle], 28, true);
    expect(API.getElement(rectangle).angle).toBeCloseTo(radians(30));
  });

  it("rotates multiple objects around the same center and restores with undo", () => {
    const first = drawElement("rectangle", {
      x: 200,
      y: 180,
      width: 120,
      height: 100,
    });
    const second = drawElement("ellipse", {
      x: 400,
      y: 240,
      width: 100,
      height: 80,
    });
    const originals = [first, second].map(({ x, y, angle }) => ({
      x,
      y,
      angle,
    }));
    rotate([first, second], 30);
    for (const element of [first, second]) {
      expect(API.getElement(element).angle).toBeCloseTo(radians(30));
    }
    Keyboard.undo();
    [first, second].forEach((element, i) =>
      expect(API.getElement(element)).toMatchObject(originals[i])
    );
    Keyboard.redo();
    for (const element of [first, second]) {
      expect(API.getElement(element).angle).toBeCloseTo(radians(30));
    }
  });

  it("rotates accurately when a grid and zoom are active", () => {
    const rectangle = drawElement("rectangle", {
      x: 200,
      y: 180,
      width: 240,
      height: 120,
    });
    API.setAppState({ gridSize: 20, gridStep: 5, zoom: zoomAt(2) });
    rotate([rectangle], 20);
    expect(API.getElement(rectangle).angle).toBeCloseTo(radians(20));
  });
});
