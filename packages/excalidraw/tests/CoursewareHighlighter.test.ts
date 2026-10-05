import { pointFrom } from "@excalidraw/math";
import { getFreedrawOutlinePoints, getFreeDrawSvgPath } from "@excalidraw/element";
import { getFreedrawStrokeOptions } from "@excalidraw/element/freedrawGeometry";

import { getOutline } from "../freedrawGeometryWorker";
import { restoreElements } from "../data/restore";

import { API } from "./helpers/api";

describe("courseware highlighter rendering", () => {
  const makeStroke = () => ({ ...API.createElement({
    type: "freedraw",
    points: [pointFrom(0, 0), pointFrom(50, 0), pointFrom(100, 0)],
    strokeWidth: 24 / 4.25,
    strokeColor: "#FFE928",
    opacity: 35,
  }), pressures: [0.05, 1, 0.1], simulatePressure: false,
    customData: { coursewareBrushMode: "highlighter" } });

  it("keeps a constant width even when pen pressure varies", () => {
    const outline = getFreedrawOutlinePoints(makeStroke());
    const body = outline.filter(([x]) => x > 0 && x < 100);
    const top = Math.min(...body.map((point) => point[1]));
    const bottom = Math.max(...body.map((point) => point[1]));
    expect(bottom - top).toBeCloseTo(24);
    expect(getFreedrawOutlinePoints({ ...makeStroke(), pressures: [1, 0.1, 1] })).toEqual(outline);
    const options = getFreedrawStrokeOptions({ strokeWidth: 24 / 4.25, simulatePressure: true, brushMode: "highlighter" });
    expect(options).toMatchObject({ thinning: 0, simulatePressure: false, start: { cap: false }, end: { cap: false } });
  });

  it("uses identical geometry in the worker and synchronous SVG renderer", () => {
    const element = makeStroke();
    const response = getOutline({
      elementId: element.id,
      version: element.version,
      versionNonce: element.versionNonce,
      simulatePressure: element.simulatePressure,
      strokeWidth: element.strokeWidth,
      brushMode: "highlighter",
      points: new Float64Array(element.points.flat()).buffer,
      pressures: new Float64Array(element.pressures).buffer,
      pointCount: element.points.length,
    });
    expect(response.svgPath).toBe(getFreeDrawSvgPath(element));
    expect(Array.from(new Float64Array(response.outline))).toEqual(getFreedrawOutlinePoints(element).flat());
  });

  it("retains highlighter rendering after saving and restoring", () => {
    const element = makeStroke();
    const [restored] = restoreElements(JSON.parse(JSON.stringify([element])), null);
    expect(restored).toMatchObject({ opacity: 35, strokeColor: "#FFE928", customData: { coursewareBrushMode: "highlighter" } });
    expect(getFreeDrawSvgPath(restored as typeof element)).toBe(getFreeDrawSvgPath(element));
  });

  it("keeps the existing pressure-sensitive options for ordinary freedraw", () => {
    expect(getFreedrawStrokeOptions({ strokeWidth: 2, simulatePressure: true })).toMatchObject({
      simulatePressure: true, size: 8.5, thinning: 0.6, smoothing: 0.5, streamline: 0.5,
    });
  });
});
