import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from "@excalidraw/element/types";
import type { Mutable } from "@excalidraw/common/utility-types";

export const FREEDRAW_MIN_SCREEN_DISTANCE = 0.25;

export type ActiveFreedrawStroke = {
  elementId: ExcalidrawElement["id"];
  startVersion: ExcalidrawElement["version"];
  points: LocalPoint[];
  pressures: number[];
  simulatePressure: ExcalidrawFreeDrawElement["simulatePressure"];
  dirty: boolean;
  rafId: number | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ActiveFreedrawBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const activeFreedrawBounds = new WeakMap<
  ExcalidrawFreeDrawElement,
  ActiveFreedrawBounds
>();

export const getActiveFreedrawBounds = (element: ExcalidrawFreeDrawElement) =>
  activeFreedrawBounds.get(element);

export const clearActiveFreedrawBounds = (
  element: ExcalidrawFreeDrawElement,
) => {
  activeFreedrawBounds.delete(element);
};

export const getActiveFreedrawBoundsFromStroke = (
  stroke: ActiveFreedrawStroke,
): ActiveFreedrawBounds => ({
  minX: stroke.minX,
  minY: stroke.minY,
  maxX: stroke.maxX,
  maxY: stroke.maxY,
  width: stroke.maxX - stroke.minX,
  height: stroke.maxY - stroke.minY,
});

export const applyActiveFreedrawStroke = (
  element: ExcalidrawFreeDrawElement,
  stroke: ActiveFreedrawStroke,
) => {
  const mutableElement = element as Mutable<ExcalidrawFreeDrawElement>;
  const bounds = getActiveFreedrawBoundsFromStroke(stroke);

  mutableElement.points = stroke.points.slice();
  mutableElement.pressures = element.simulatePressure
    ? []
    : stroke.pressures.slice();
  mutableElement.width = bounds.width;
  mutableElement.height = bounds.height;
  activeFreedrawBounds.set(element, bounds);

  return element;
};

export const createActiveFreedrawStroke = (
  element: ExcalidrawFreeDrawElement,
): ActiveFreedrawStroke => {
  const firstPoint = element.points[0] ?? pointFrom<LocalPoint>(0, 0);

  return {
    elementId: element.id,
    startVersion: element.version,
    points: [firstPoint],
    pressures: [...element.pressures],
    simulatePressure: element.simulatePressure,
    dirty: false,
    rafId: null,
    minX: firstPoint[0],
    minY: firstPoint[1],
    maxX: firstPoint[0],
    maxY: firstPoint[1],
  };
};

export const shouldAppendFreedrawPoint = (
  stroke: ActiveFreedrawStroke,
  point: LocalPoint,
  zoomValue: number,
) => {
  const lastPoint = stroke.points[stroke.points.length - 1];
  if (!lastPoint) {
    return true;
  }

  const dx = point[0] - lastPoint[0];
  const dy = point[1] - lastPoint[1];

  if (dx === 0 && dy === 0) {
    return false;
  }

  return Math.hypot(dx, dy) * zoomValue >= FREEDRAW_MIN_SCREEN_DISTANCE;
};

export const appendFreedrawPoint = (
  stroke: ActiveFreedrawStroke,
  point: LocalPoint,
  pressure: number,
  zoomValue: number,
) => {
  if (!shouldAppendFreedrawPoint(stroke, point, zoomValue)) {
    return false;
  }

  stroke.points.push(point);
  if (!stroke.simulatePressure) {
    stroke.pressures.push(pressure);
  }
  stroke.minX = Math.min(stroke.minX, point[0]);
  stroke.minY = Math.min(stroke.minY, point[1]);
  stroke.maxX = Math.max(stroke.maxX, point[0]);
  stroke.maxY = Math.max(stroke.maxY, point[1]);
  stroke.dirty = true;

  return true;
};
