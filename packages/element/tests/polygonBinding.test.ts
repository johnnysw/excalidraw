import { arrayToMap } from "@excalidraw/common";
import { pointFrom, pointRotateRads, type Radians } from "@excalidraw/math";

import { API } from "../../excalidraw/tests/helpers/api";
import { getHoveredElementForBinding } from "../src/collision";
import { elementCenterPoint } from "../src/bounds";
import { isBindableElement } from "../src/typeChecks";

import type {
  ExcalidrawElement,
  ExcalidrawPolygonElement,
  NonDeletedSceneElementsMap,
  Ordered,
} from "../src/types";

// A U-shaped polygon deliberately has its bounding-box center outside its fill.
const polygon = (angle = 0): ExcalidrawPolygonElement => ({
  ...API.createElement({
    type: "line",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    angle,
    roundness: null,
    points: [
      pointFrom(0, 0),
      pointFrom(100, 0),
      pointFrom(100, 100),
      pointFrom(70, 100),
      pointFrom(70, 30),
      pointFrom(30, 30),
      pointFrom(30, 100),
      pointFrom(0, 100),
      pointFrom(0, 0),
    ],
  }),
  type: "line",
  polygon: true,
});

const hovered = (
  target: ExcalidrawElement,
  x: number,
  y: number,
  tolerance = 0,
  others: ExcalidrawElement[] = []
) =>
  getHoveredElementForBinding(
    pointFrom(x, y),
    [target] as Ordered<ExcalidrawElement>[],
    arrayToMap([...others, target]) as NonDeletedSceneElementsMap,
    () => tolerance
  );

describe("polygon binding geometry", () => {
  it("recognizes saved polygons without customData but excludes open lines and arrows", () => {
    const target = polygon();
    expect(target.customData).toBeUndefined();
    expect(isBindableElement(target)).toBe(true);
    const openLine = { ...target, polygon: false };
    expect(isBindableElement(openLine)).toBe(false);
    expect(isBindableElement(API.createElement({ type: "arrow" }))).toBe(false);
  });

  it.each([0, Math.PI / 4, Math.PI / 2])(
    "uses the concave contour at angle %s instead of its bounding box or center",
    (angle) => {
      const target = polygon(angle);
      const center = elementCenterPoint(target, arrayToMap([target]));
      const hit = (x: number, y: number) => {
        const p = pointRotateRads(pointFrom(x, y), center, angle as Radians);
        return hovered(target, p[0], p[1]);
      };
      expect(hit(115, 170)?.id).toBe(target.id);
      expect(hit(185, 170)?.id).toBe(target.id);
      expect(hit(150, 115)?.id).toBe(target.id);
      expect(hit(150, 150)).toBeNull();
      expect(hit(150, 195)).toBeNull();
      expect(hit(80, 115)).toBeNull();
    }
  );

  it("accepts edges and nearby points only within the binding tolerance", () => {
    const target = polygon();
    expect(hovered(target, 100, 150)?.id).toBe(target.id);
    expect(hovered(target, 96, 150, 5)?.id).toBe(target.id);
    expect(hovered(target, 94, 150, 5)).toBeNull();
    expect(hovered(target, 150, 150, 5)).toBeNull();
  });

  it("respects locked shapes and enclosing frame clipping", () => {
    const target = polygon();
    expect(hovered({ ...target, locked: true }, 115, 170)).toBeNull();
    const frame = API.createElement({
      type: "frame",
      x: 90,
      y: 90,
      width: 120,
      height: 50,
    });
    const child = { ...target, frameId: frame.id };
    expect(hovered(child, 115, 170, 0, [frame])).toBeNull();
    expect(hovered(child, 115, 115, 0, [frame])?.id).toBe(target.id);
  });
});
