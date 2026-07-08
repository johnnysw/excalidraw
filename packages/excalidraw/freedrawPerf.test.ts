import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";

import {
  applyActiveFreedrawStroke,
  appendFreedrawPoint,
  clearActiveFreedrawBounds,
  createActiveFreedrawStroke,
  FREEDRAW_MIN_SCREEN_DISTANCE,
  getActiveFreedrawBounds,
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
  it("discards exact duplicate points", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());

    expect(
      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(0, 0), 0.7, 1),
    ).toBe(false);
    expect(stroke.points).toHaveLength(1);
    expect(stroke.pressures).toEqual([0.5]);
  });

  it("discards tiny screen-space noise", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());

    expect(
      appendFreedrawPoint(
        stroke,
        pointFrom<LocalPoint>(FREEDRAW_MIN_SCREEN_DISTANCE / 2, 0),
        0.7,
        1,
      ),
    ).toBe(false);
    expect(stroke.points).toHaveLength(1);
  });

  it("keeps real movement and matching pressure samples", () => {
    const stroke = createActiveFreedrawStroke(createFreedrawElement());

    expect(
      appendFreedrawPoint(stroke, pointFrom<LocalPoint>(2, 3), 0.8, 1),
    ).toBe(true);
    expect(stroke.points).toEqual([
      pointFrom<LocalPoint>(0, 0),
      pointFrom<LocalPoint>(2, 3),
    ]);
    expect(stroke.pressures).toEqual([0.5, 0.8]);
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

  it("applies active points and bounds without bumping element version", () => {
    const element = createFreedrawElement({
      version: 11,
      points: [pointFrom<LocalPoint>(3, 4)],
      pressures: [0.4],
      width: 0,
      height: 0,
    });
    const stroke = createActiveFreedrawStroke(element);

    appendFreedrawPoint(stroke, pointFrom<LocalPoint>(8, -2), 0.9, 1);
    applyActiveFreedrawStroke(element, stroke);

    expect(element.version).toBe(11);
    expect(element.points).toEqual([
      pointFrom<LocalPoint>(3, 4),
      pointFrom<LocalPoint>(8, -2),
    ]);
    expect(element.pressures).toEqual([0.4, 0.9]);
    expect(element.width).toBe(5);
    expect(element.height).toBe(6);
    expect(getActiveFreedrawBounds(element)).toEqual({
      minX: 3,
      minY: -2,
      maxX: 8,
      maxY: 4,
      width: 5,
      height: 6,
    });

    clearActiveFreedrawBounds(element);
    expect(getActiveFreedrawBounds(element)).toBe(undefined);
  });
});
