import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
} from "@excalidraw/element/types";

export const FREEDRAW_MIN_SCREEN_DISTANCE = 0.25;

export type ActiveFreedrawStroke = {
  elementId: ExcalidrawElement["id"];
  points: LocalPoint[];
  pressures: number[];
  /**
   * Preview-only points. The raw arrays above are never simplified so the
   * finalized element retains every sample received from the pointer.
   */
  previewPoints: LocalPoint[];
  previewPointIndices: number[];
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

export type AppendFreedrawPointResult = {
  rawAdded: boolean;
  previewChanged: boolean;
};

const activeFreedrawBounds = new WeakMap<
  ExcalidrawFreeDrawElement,
  ActiveFreedrawBounds
>();

const activeFreedrawStrokes = new WeakMap<
  ExcalidrawFreeDrawElement,
  ActiveFreedrawStroke
>();

export const getActiveFreedrawBounds = (element: ExcalidrawFreeDrawElement) =>
  activeFreedrawBounds.get(element);

export const clearActiveFreedrawBounds = (
  element: ExcalidrawFreeDrawElement,
) => {
  activeFreedrawBounds.delete(element);
};

export const setActiveFreedrawStroke = (
  element: ExcalidrawFreeDrawElement,
  stroke: ActiveFreedrawStroke,
) => {
  activeFreedrawStrokes.set(element, stroke);
};

export const getActiveFreedrawStroke = (element: ExcalidrawFreeDrawElement) =>
  activeFreedrawStrokes.get(element);

export const clearActiveFreedrawStroke = (
  element: ExcalidrawFreeDrawElement,
) => {
  activeFreedrawStrokes.delete(element);
};

export const updateActiveFreedrawBounds = (
  element: ExcalidrawFreeDrawElement,
  stroke: ActiveFreedrawStroke,
) => {
  activeFreedrawBounds.set(element, getActiveFreedrawBoundsFromStroke(stroke));
};

export const getFreedrawPointerEventSamples = (event: PointerEvent) => {
  const coalescedEvents =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];

  // Some browsers include the dispatched event in getCoalescedEvents(),
  // while others expose it only as the outer event. Always append it and let
  // the raw-point dedupe discard an exact repeated coordinate.
  return coalescedEvents.length ? [...coalescedEvents, event] : [event];
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

export const createActiveFreedrawStroke = (
  element: ExcalidrawFreeDrawElement,
): ActiveFreedrawStroke => {
  const points = element.points.length
    ? [...element.points]
    : [pointFrom<LocalPoint>(0, 0)];
  const firstPoint = points[0];
  const previewPoints = [firstPoint];
  const previewPointIndices = [0];

  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    const previousPoint = previewPoints[previewPoints.length - 1];
    if (
      previousPoint &&
      Math.hypot(point[0] - previousPoint[0], point[1] - previousPoint[1]) >=
        FREEDRAW_MIN_SCREEN_DISTANCE
    ) {
      previewPoints.push(point);
      previewPointIndices.push(index);
    }
  }

  return {
    elementId: element.id,
    points,
    pressures: [...element.pressures],
    previewPoints,
    previewPointIndices,
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
  const lastPoint = stroke.previewPoints[stroke.previewPoints.length - 1];
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
): AppendFreedrawPointResult => {
  const lastRawPoint = stroke.points[stroke.points.length - 1];
  if (
    lastRawPoint &&
    lastRawPoint[0] === point[0] &&
    lastRawPoint[1] === point[1]
  ) {
    return { rawAdded: false, previewChanged: false };
  }

  // Keep the raw sample even when it is too close to the previous preview
  // sample. The preview may be decimated, but the final element must not be.
  stroke.points.push(point);
  if (!stroke.simulatePressure) {
    stroke.pressures.push(pressure);
  }

  const previewChanged = shouldAppendFreedrawPoint(stroke, point, zoomValue);
  if (previewChanged) {
    stroke.previewPoints.push(point);
    stroke.previewPointIndices.push(stroke.points.length - 1);
  }

  stroke.minX = Math.min(stroke.minX, point[0]);
  stroke.minY = Math.min(stroke.minY, point[1]);
  stroke.maxX = Math.max(stroke.maxX, point[0]);
  stroke.maxY = Math.max(stroke.maxY, point[1]);
  stroke.dirty = true;

  return { rawAdded: true, previewChanged };
};
