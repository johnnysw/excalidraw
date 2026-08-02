import React from "react";
import { vi } from "vitest";

import {
  getFreedrawPendingPreview,
  getFreeDrawPath2D,
  ShapeCache,
} from "@excalidraw/element";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import type { FreedrawGeometryWorkerResponse } from "../freedrawGeometryWorker";

const geometryMock = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("../freedrawGeometry", () => ({
  prepareFreedrawGeometryWorker: vi.fn(),
  requestFreedrawGeometry: geometryMock.request,
}));

import { Excalidraw } from "../index";

import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;
const pointer = new Pointer("mouse", 1);

type PendingGeometry = {
  element: ExcalidrawFreeDrawElement;
  resolve: (result: FreedrawGeometryWorkerResponse | null) => void;
};

const pendingGeometry: PendingGeometry[] = [];

const createGeometryResult = (
  element: ExcalidrawFreeDrawElement,
): FreedrawGeometryWorkerResponse => ({
  elementId: element.id,
  version: element.version,
  versionNonce: element.versionNonce,
  outline: new Float64Array([0, 0, 2, 0, 2, 2, 0, 2]).buffer,
  svgPath: "M 0 0 Q 2 0 2 2 0 2 L 0 0 Z",
});

const drawStroke = (offset: number) => {
  UI.clickTool("freedraw");
  pointer.downAt(100 + offset, 100 + offset);
  for (let index = 1; index <= 12; index++) {
    pointer.moveTo(100 + offset + index * 3, 100 + offset + index * 2);
  }
  pointer.upAt();

  return h.elements.at(-1) as ExcalidrawFreeDrawElement;
};

const resolveGeometry = async (
  pending: PendingGeometry,
  result: FreedrawGeometryWorkerResponse | null,
) => {
  await act(async () => {
    pending.resolve(result);
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  });
};

describe("freedraw geometry finalization", () => {
  beforeEach(() => {
    unmountComponent();
    pointer.reset();
    pendingGeometry.length = 0;
    geometryMock.request.mockReset();
    geometryMock.request.mockImplementation(
      (element: ExcalidrawFreeDrawElement) =>
        new Promise<FreedrawGeometryWorkerResponse | null>((resolve) => {
          pendingGeometry.push({ element, resolve });
        }),
    );
  });

  it("keeps concurrent stroke jobs independent", async () => {
    await render(<Excalidraw />);

    const firstElement = drawStroke(0);
    const secondElement = drawStroke(80);

    expect(pendingGeometry).toHaveLength(2);
    expect(getFreedrawPendingPreview(firstElement)).toBeDefined();
    expect(getFreedrawPendingPreview(secondElement)).toBeDefined();
    expect(getFreeDrawPath2D(firstElement)).toBeUndefined();
    expect(getFreeDrawPath2D(secondElement)).toBeUndefined();

    await resolveGeometry(
      pendingGeometry[0],
      createGeometryResult(pendingGeometry[0].element),
    );

    expect(getFreeDrawPath2D(firstElement)).toBeDefined();
    expect(getFreedrawPendingPreview(firstElement)).toBeUndefined();
    expect(getFreedrawPendingPreview(secondElement)).toBeDefined();
    expect((h.app as any).freedrawGeometryJobs.size).toBe(1);

    await resolveGeometry(
      pendingGeometry[1],
      createGeometryResult(pendingGeometry[1].element),
    );
    expect(getFreeDrawPath2D(secondElement)).toBeDefined();
    expect((h.app as any).freedrawGeometryJobs.size).toBe(0);
  });

  it("does not emit another scene change or increment on Worker completion", async () => {
    const onChange = vi.fn();
    const onIncrement = vi.fn();
    await render(<Excalidraw onChange={onChange} onIncrement={onIncrement} />);

    drawStroke(0);
    const changeCount = onChange.mock.calls.length;
    const incrementCount = onIncrement.mock.calls.length;

    await resolveGeometry(
      pendingGeometry[0],
      createGeometryResult(pendingGeometry[0].element),
    );

    expect(onChange).toHaveBeenCalledTimes(changeCount);
    expect(onIncrement).toHaveBeenCalledTimes(incrementCount);
  });

  it("discards a Worker result after undo", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    const element = drawStroke(0);
    Keyboard.undo();

    await resolveGeometry(
      pendingGeometry[0],
      createGeometryResult(pendingGeometry[0].element),
    );

    expect(getFreeDrawPath2D(element)).toBeUndefined();
    expect(getFreedrawPendingPreview(element)).toBeUndefined();
    expect((h.app as any).freedrawGeometryJobs.size).toBe(0);
  });

  it("clears the pending preview and renders synchronously after Worker failure", async () => {
    await render(<Excalidraw />);

    const element = drawStroke(0);
    expect(getFreedrawPendingPreview(element)).toBeDefined();

    await resolveGeometry(pendingGeometry[0], null);

    expect(getFreedrawPendingPreview(element)).toBeUndefined();
    ShapeCache.generateElementShape(element, null);
    expect(getFreeDrawPath2D(element)).toBeDefined();
    expect((h.app as any).freedrawGeometryJobs.size).toBe(0);
  });
});
