import React from "react";
import { vi } from "vitest";

import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import { StoreDelta } from "@excalidraw/element";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import {
  fireEvent,
  GlobalTestState,
  render,
  unmountComponent,
} from "./test-utils";

const { h } = window;
const finger1 = new Pointer("touch", 1);
const finger2 = new Pointer("touch", 2);

const drawActiveTouchStroke = () => {
  UI.clickTool("freedraw");
  finger1.downAt(100, 100);
  for (let index = 1; index <= 12; index++) {
    finger1.moveTo(100 + index * 4, 100 + index * 2);
  }
};

describe("freedraw finalization", () => {
  beforeEach(() => {
    unmountComponent();
    finger1.reset();
    finger2.reset();
  });

  it("keeps the active stroke detached from the scene until finalization", async () => {
    await render(<Excalidraw />);

    const sceneNonceBeforeStroke = h.app.scene.getSceneNonce();
    const framesNonceBeforeStroke = h.app.scene.getFramesNonce();
    UI.clickTool("freedraw");
    finger1.downAt(100, 100);
    finger1.moveTo(120, 110);

    const activeElement = h.state.newElement;
    expect(activeElement?.type).toBe("freedraw");
    expect(h.elements.some((element) => element.id === activeElement?.id)).toBe(
      false,
    );
    expect(h.app.scene.getSceneNonce()).toBe(sceneNonceBeforeStroke);
    expect(h.app.scene.getFramesNonce()).toBe(framesNonceBeforeStroke);

    const replaceAllElements = vi.spyOn(h.app.scene, "replaceAllElements");
    const calculateStoreDelta = vi.spyOn(StoreDelta, "calculate");
    finger1.upAt();

    expect(h.elements.some((element) => element.id === activeElement?.id)).toBe(
      true,
    );
    expect(replaceAllElements).not.toHaveBeenCalled();
    expect(calculateStoreDelta).not.toHaveBeenCalled();
    expect(h.app.scene.getFramesNonce()).toBe(framesNonceBeforeStroke);
  });

  it("keeps UI scene data stable for a freedraw append and refreshes it for standard updates", async () => {
    await render(<Excalidraw />);

    const app = h.app as any;
    const overlayCanvas = document.querySelector(
      "canvas.freedraw-overlay",
    ) as HTMLCanvasElement;
    const overlayDrawImage = vi.spyOn(
      overlayCanvas.getContext("2d")!,
      "drawImage",
    );
    UI.clickTool("freedraw");
    finger1.downAt(100, 100);
    finger1.moveTo(140, 120);

    const uiSceneRevision = app.uiSceneRevision;
    const staticSceneRevision = app.staticSceneRevision;
    const elementsContextValue = app.elementsContextValue;
    const readCanvasRenderData = app.readCanvasRenderData;
    const finalizedElementId = h.state.newElement?.id;

    finger1.upAt();

    expect(app.uiSceneRevision).toBe(uiSceneRevision);
    expect(app.staticSceneRevision).toBe(staticSceneRevision);
    expect(app.elementsContextValue).toBe(elementsContextValue);
    expect(app.readCanvasRenderData).toBe(readCanvasRenderData);
    expect(overlayDrawImage).toHaveBeenCalledTimes(1);
    expect(app.hasPendingFreedrawOverlayContent).toBe(true);
    expect(
      app.elementsContextValue.scene
        .getNonDeletedElements()
        .some((element: { id: string }) => element.id === finalizedElementId),
    ).toBe(true);
    expect(
      readCanvasRenderData().allElementsMap.get(finalizedElementId),
    ).toBeDefined();

    API.setElements([
      ...h.elements,
      API.createElement({ type: "rectangle", x: 300, y: 300 }),
    ]);

    expect(app.uiSceneRevision).toBeGreaterThan(uiSceneRevision);
    expect(app.staticSceneRevision).toBeGreaterThan(staticSceneRevision);
    expect(app.elementsContextValue).not.toBe(elementsContextValue);
    expect(app.elementsContextValue.scene).toBe(h.app.scene);
    expect(app.elementsContextValue.revision).toBe(app.uiSceneRevision);
    expect(app.hasPendingFreedrawOverlayContent).toBe(false);
  });

  it("does not snapshot the existing scene on freedraw pointerdown", async () => {
    let originalElementCount = -1;
    await render(
      <Excalidraw
        onPointerDown={(_tool, pointerDownState) => {
          originalElementCount = pointerDownState.originalElements.size;
        }}
      />,
    );
    API.setElements(
      Array.from({ length: 100 }, (_, index) =>
        API.createElement({
          type: "rectangle",
          x: index * 10,
          y: index * 10,
        }),
      ),
    );

    UI.clickTool("freedraw");
    const selectedElementIds = h.state.selectedElementIds;
    finger1.downAt(100, 100);

    expect(originalElementCount).toBe(0);
    expect(h.state.selectedElementIds).toBe(selectedElementIds);

    finger1.upAt();
  });

  it("renders active flushes without scheduling an App state update", async () => {
    await render(<Excalidraw />);
    UI.clickTool("freedraw");
    finger1.downAt(100, 100);

    const app = h.app as any;
    const renderPreview = vi.fn();
    app.activeFreedrawPreviewRenderer = renderPreview;
    app.activeFreedrawStroke.dirty = true;
    const setState = vi.spyOn(h.app, "setState");

    app.flushActiveFreedrawStroke();

    expect(renderPreview).toHaveBeenCalledTimes(1);
    expect(setState).not.toHaveBeenCalled();

    setState.mockRestore();
    finger1.upAt();
  });

  it("finalizes a long active stroke before a second touch starts", async () => {
    await render(<Excalidraw />);
    drawActiveTouchStroke();

    const activeStroke = (h.app as any).activeFreedrawStroke;
    expect(activeStroke.points.length).toBeGreaterThanOrEqual(10);

    finger2.downAt(300, 300);

    const freedraw = h.elements.find(
      (element) => element.type === "freedraw",
    ) as ExcalidrawFreeDrawElement | undefined;
    expect(freedraw).toBeDefined();
    expect(freedraw!.points.length).toBe(activeStroke.points.length);
    expect((h.app as any).activeFreedrawStroke).toBeNull();
    expect(h.state.newElement).toBeNull();

    finger2.upAt();
    finger1.upAt();
  });

  it("finalizes an active stroke when the pointer is cancelled", async () => {
    await render(<Excalidraw />);
    drawActiveTouchStroke();

    fireEvent.pointerCancel(GlobalTestState.interactiveCanvas, {
      clientX: finger1.clientX,
      clientY: finger1.clientY,
      pointerId: 1,
      pointerType: "touch",
    });

    const freedraw = h.elements.find(
      (element) => element.type === "freedraw",
    ) as ExcalidrawFreeDrawElement | undefined;
    expect(freedraw).toBeDefined();
    expect(freedraw!.points.length).toBeGreaterThanOrEqual(10);
    expect((h.app as any).activeFreedrawStroke).toBeNull();
    expect(h.state.newElement).toBeNull();
  });

  it("keeps a multi-touch-finalized stroke in undo and redo history", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    drawActiveTouchStroke();

    finger2.downAt(300, 300);
    const freedrawId = h.elements.find(
      (element) => element.type === "freedraw",
    )?.id;
    expect(freedrawId).toBeDefined();

    finger2.upAt();
    finger1.upAt();

    Keyboard.undo();
    expect(h.elements.find((element) => element.id === freedrawId)).toEqual(
      expect.objectContaining({ isDeleted: true }),
    );

    Keyboard.redo();
    expect(h.elements.find((element) => element.id === freedrawId)).toEqual(
      expect.objectContaining({
        isDeleted: false,
        type: "freedraw",
      }),
    );
  });

  it("exposes finalized points to the pointerup callback", async () => {
    let observedPointCount = 0;
    const onPointerUp = vi.fn(() => {
      const freedraw = h.elements.find(
        (element) => element.type === "freedraw",
      ) as ExcalidrawFreeDrawElement | undefined;
      observedPointCount = freedraw?.points.length ?? 0;
    });
    await render(<Excalidraw onPointerUp={onPointerUp} />);
    drawActiveTouchStroke();

    finger1.upAt();

    expect(onPointerUp).toHaveBeenCalledTimes(1);
    expect(observedPointCount).toBeGreaterThanOrEqual(10);
  });

  it("does not notify onChange while a detached stroke is still active", async () => {
    const onChange = vi.fn();
    await render(<Excalidraw onChange={onChange} />);

    UI.clickTool("freedraw");
    onChange.mockClear();
    finger1.downAt(100, 100);
    for (let index = 1; index <= 12; index++) {
      finger1.moveTo(100 + index * 4, 100 + index * 2);
    }

    expect(onChange).not.toHaveBeenCalled();

    finger1.upAt();
    expect(onChange).toHaveBeenCalled();
  });
});
