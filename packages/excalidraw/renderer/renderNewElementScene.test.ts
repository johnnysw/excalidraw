import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import {
  appendFreedrawPoint,
  clearActiveFreedrawStroke,
  createActiveFreedrawStroke,
  setActiveFreedrawStroke,
} from "../freedrawPerf";

import { renderNewElementScene } from "./renderNewElementScene";

const createFreedrawElement = () =>
  ({
    id: "active-freedraw-test",
    type: "freedraw",
    x: 10,
    y: 20,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "#000000",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    index: "a0",
    customData: undefined,
    points: [pointFrom<LocalPoint>(0, 0)],
    pressures: [0.5],
    simulatePressure: false,
  } as unknown as ExcalidrawFreeDrawElement);

const renderActiveStroke = (
  canvas: HTMLCanvasElement,
  element: ExcalidrawFreeDrawElement,
) => {
  const elementsMap = new Map([[element.id, element]]);
  renderNewElementScene({
    canvas,
    rc: {} as any,
    newElement: element,
    elementsMap: elementsMap as any,
    allElementsMap: elementsMap as any,
    scale: 1,
    appState: {
      zoom: { value: 1 },
      scrollX: 0,
      scrollY: 0,
      frameToHighlight: null,
      frameRendering: { enabled: true, clip: true },
    } as any,
    renderConfig: {
      isExporting: false,
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
    } as any,
  });
};

describe("active freedraw renderer", () => {
  it("draws only appended preview segments without constructing Path2D", () => {
    const element = createFreedrawElement();
    const stroke = createActiveFreedrawStroke(element);
    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(4, 2), 0.6, 1);
    setActiveFreedrawStroke(element, stroke);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    const strokeSpy = vi.spyOn(context, "stroke");
    const originalPath2D = globalThis.Path2D;
    const path2DSpy = vi.fn();
    globalThis.Path2D = path2DSpy as unknown as typeof Path2D;

    try {
      renderActiveStroke(canvas, element);
      expect(strokeSpy).toHaveBeenCalledTimes(1);
      expect(path2DSpy).not.toHaveBeenCalled();

      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(8, 5), 0.7, 1);
      renderActiveStroke(canvas, element);

      expect(strokeSpy).toHaveBeenCalledTimes(2);
      expect(path2DSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.Path2D = originalPath2D;
      clearActiveFreedrawStroke(element);
    }
  });

  it("uses a full active preview after incremental rendering fails", () => {
    const element = createFreedrawElement();
    const originalPoints = element.points;
    const stroke = createActiveFreedrawStroke(element);
    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(4, 2), 0.6, 1);
    setActiveFreedrawStroke(element, stroke);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    const strokeSpy = vi.spyOn(context, "stroke").mockImplementationOnce(() => {
      throw new Error("incremental preview failed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalPath2D = globalThis.Path2D;
    const path2DSpy = vi.fn();
    globalThis.Path2D = path2DSpy as unknown as typeof Path2D;

    try {
      expect(() => renderActiveStroke(canvas, element)).not.toThrow();
      const firstPreviewPathCount = path2DSpy.mock.calls.length;
      expect(firstPreviewPathCount).toBeGreaterThan(0);
      expect(element.points).toBe(originalPoints);

      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(8, 5), 0.7, 1);
      expect(() => renderActiveStroke(canvas, element)).not.toThrow();
      expect(path2DSpy.mock.calls.length).toBeGreaterThan(
        firstPreviewPathCount,
      );
      expect(element.points).toBe(originalPoints);
    } finally {
      strokeSpy.mockRestore();
      warnSpy.mockRestore();
      globalThis.Path2D = originalPath2D;
      clearActiveFreedrawStroke(element);
    }
  });

  it("preserves active stroke data when every preview renderer fails", () => {
    const element = createFreedrawElement();
    const originalPoints = element.points;
    const originalPressures = element.pressures;
    const stroke = createActiveFreedrawStroke(element);
    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(4, 2), 0.6, 1);
    setActiveFreedrawStroke(element, stroke);

    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 600;
    const context = canvas.getContext("2d")!;
    const fillSpy = vi.spyOn(context, "fill").mockImplementation(() => {
      throw new Error("preview render failed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(() => renderActiveStroke(canvas, element)).not.toThrow();
      expect(element.points).toBe(originalPoints);
      expect(element.pressures).toBe(originalPressures);
      expect(stroke.points).toHaveLength(2);
      expect(stroke.pressures).toEqual([0.5, 0.6]);
    } finally {
      fillSpy.mockRestore();
      warnSpy.mockRestore();
      clearActiveFreedrawStroke(element);
    }
  });
});
