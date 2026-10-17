import { arrayToMap, FONT_FAMILY } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import rough from "roughjs/bin/rough";

import type { NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "@excalidraw/excalidraw/scene/types";

import {
  elementWithCanvasCache,
  fillTextWithWeight,
  getFreeDrawPath2D,
  renderElement,
} from "../src/renderElement";
import { newFreeDrawElement } from "../src/newElement";
import { mutateElement } from "../src/mutateElement";
import { ShapeCache } from "../src/shape";

describe("fillTextWithWeight", () => {
  it("applies the resolved run color before filling normal-weight text", () => {
    const context = {
      fillStyle: "#000000",
      fillText: vi.fn(),
      strokeText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    fillTextWithWeight(
      context,
      "哈哈",
      0,
      20,
      20,
      FONT_FAMILY.Helvetica,
      "normal",
      "#2f9e44",
    );

    expect(context.fillStyle).toBe("#2f9e44");
    expect(context.fillText).toHaveBeenCalledWith("哈哈", 0, 20);
    expect(context.strokeText).not.toHaveBeenCalled();
  });
});

describe("retained presentation ink geometry", () => {
  it.each(["pen", "highlighter"])(
    "paints retained %s ink immediately when exiting presentation restores the zoom",
    (brushMode) => {
      const ink = newFreeDrawElement({
        type: "freedraw",
        x: 10,
        y: 20,
        points: [pointFrom(0, 0), pointFrom(20, 30), pointFrom(80, 0)],
        simulatePressure: true,
        customData: {
          annotationSessionId: "presentation",
          coursewareBrushMode: brushMode,
        },
      });
      const elementsMap = arrayToMap([ink]);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      const config: StaticCanvasRenderConfig = {
        canvasBackgroundColor: "#ffffff",
        imageCache: new Map(),
        renderGrid: false,
        isExporting: false,
        embedsValidationStatus: new Map(),
        elementsPendingErasure: new Set(),
        pendingFlowchartNodes: null,
      };
      const appState = getDefaultAppState();
      const paint = () =>
        renderElement(
          ink,
          elementsMap as RenderableElementsMap,
          elementsMap,
          rough.canvas(canvas),
          context,
          config,
          appState,
        );
      appState.zoom = { value: 2 as NormalizedZoomValue };
      paint();
      const presentationBitmap = elementWithCanvasCache.get(ink)!;

      mutateElement(ink, elementsMap, {
        customData: { coursewareBrushMode: brushMode },
      });
      appState.zoom = { value: 1 as NormalizedZoomValue };
      paint();

      const editingBitmap = elementWithCanvasCache.get(ink)!;
      const fill = editingBitmap.canvas!.getContext("2d")!.fill;
      expect(editingBitmap).not.toBe(presentationBitmap);
      expect(getFreeDrawPath2D(ink)).toBeDefined();
      expect(fill).toHaveBeenCalledWith(getFreeDrawPath2D(ink));
    },
  );

  it.each(["pen", "highlighter"])(
    "rebuilds the %s path and invalidates its bitmap after retention metadata changes",
    (brushMode) => {
      const ink = newFreeDrawElement({
        type: "freedraw",
        x: 10,
        y: 20,
        points: [pointFrom(0, 0), pointFrom(20, 30), pointFrom(80, 0)],
        simulatePressure: true,
        customData: {
          annotationSessionId: "presentation",
          coursewareBrushMode: brushMode,
        },
      });
      ShapeCache.generateElementShape(ink, null);
      const originalPath = getFreeDrawPath2D(ink);
      expect(originalPath).toBeDefined();
      // A cached bitmap still displays during presentation. Leaving presentation
      // changes zoom and redraws that bitmap from the versioned path cache.
      const bitmap = {} as NonNullable<
        ReturnType<typeof elementWithCanvasCache.get>
      >;
      elementWithCanvasCache.set(ink, bitmap);
      const originalPoints = ink.points;
      mutateElement(ink, arrayToMap([ink]), {
        customData: { coursewareBrushMode: brushMode },
      });
      expect(getFreeDrawPath2D(ink)).toBeUndefined();

      ShapeCache.generateElementShape(ink, null);

      expect(getFreeDrawPath2D(ink)).toBeDefined();
      expect(getFreeDrawPath2D(ink)).not.toBe(originalPath);
      expect(elementWithCanvasCache.has(ink)).toBe(false);
      expect(ink.points).toBe(originalPoints);
      // With no further edits, keep both caches reusable on subsequent renders.
      const retainedPath = getFreeDrawPath2D(ink);
      elementWithCanvasCache.set(ink, bitmap);
      ShapeCache.generateElementShape(ink, null);
      expect(getFreeDrawPath2D(ink)).toBe(retainedPath);
      expect(elementWithCanvasCache.get(ink)).toBe(bitmap);
    },
  );
});
