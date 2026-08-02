import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import {
  appendFreedrawPoint,
  clearActiveFreedrawStroke,
  createActiveFreedrawStroke,
  FREEDRAW_MIN_SCREEN_DISTANCE,
  getActiveFreedrawBounds,
  getActiveFreedrawStroke,
  getFreedrawPointerEventSamples,
  setActiveFreedrawStroke,
  updateActiveFreedrawBounds,
} from "./freedrawPerf";

const createFreedrawElement = (
  overrides: Partial<ExcalidrawFreeDrawElement> = {},
) =>
  ({
    id: "freedraw-test",
    type: "freedraw",
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    strokeColor: "#000",
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
    ...overrides,
  } as ExcalidrawFreeDrawElement);

describe("freedraw perf buffer", () => {
  it("does not accumulate exact duplicate raw points", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());

    expect(
      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(0, 0), 0.7, 1),
    ).toEqual({ rawAdded: false, previewChanged: false });
    expect(stroke.points).toHaveLength(1);
    expect(stroke.pressures).toEqual([0.5]);
  });

  it("keeps non-identical raw samples without redrawing tiny movement", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());
    const tinyPoint = pointFrom<LocalPoint>(
      FREEDRAW_MIN_SCREEN_DISTANCE / 2,
      0,
    );

    expect(appendFreedrawPoint(stroke, tinyPoint, 0.7, 1)).toEqual({
      rawAdded: true,
      previewChanged: false,
    });
    expect(stroke.points).toEqual([pointFrom<LocalPoint>(0, 0), tinyPoint]);
    expect(stroke.previewPoints).toEqual([pointFrom<LocalPoint>(0, 0)]);
  });

  it("keeps real movement and matching pressure samples", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());

    expect(
      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(2, 3), 0.8, 1),
    ).toEqual({ rawAdded: true, previewChanged: true });
    expect(stroke.points).toEqual([
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(2, 3),
    ]);
    expect(stroke.pressures).toEqual([0.5, 0.8]);
    expect(stroke.previewPointIndices).toEqual([0, 1]);
    expect(stroke.minX).toBe(0);
    expect(stroke.maxX).toBe(2);
    expect(stroke.minY).toBe(0);
    expect(stroke.maxY).toBe(3);
  });

  it("keeps simulated-pressure strokes pressureless", () => {
    const stroke = createActiveFreedrawStroke(
      createFreedrawElement({ simulatePressure: true, pressures: [] }),
    );

    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(1, 1), 0.8, 1);

    expect(stroke.pressures).toEqual([]);
  });

  it("keeps the dispatched trailing event after coalesced samples", () => {
    const coalesced = [{ clientX: 1 }, { clientX: 2 }] as PointerEvent[];
    const trailing = {
      clientX: 3,
      getCoalescedEvents: () => coalesced,
    } as unknown as PointerEvent;

    expect(getFreedrawPointerEventSamples(trailing)).toEqual([
      ...coalesced,
      trailing,
    ]);
  });

  it("registers and clears the active stroke without copying its buffers", () => {
    const element = createFreedrawElement();
    const stroke = createActiveFreedrawStroke(element);

    setActiveFreedrawStroke(element, stroke);
    expect(getActiveFreedrawStroke(element)).toBe(stroke);

    clearActiveFreedrawStroke(element);
    expect(getActiveFreedrawStroke(element)).toBe(undefined);
  });

  it("updates transient bounds without replacing element point arrays", () => {
    const element = createFreedrawElement();
    const originalPoints = element.points;
    const originalPressures = element.pressures;
    const stroke = createActiveFreedrawStroke(element);

    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(5, -3), 0.8, 1);
    updateActiveFreedrawBounds(element, stroke);

    expect(element.points).toBe(originalPoints);
    expect(element.pressures).toBe(originalPressures);
    expect(getActiveFreedrawBounds(element)).toEqual({
      minX: 0,
      minY: -3,
      maxX: 5,
      maxY: 0,
      width: 5,
      height: 3,
    });
  });
});
