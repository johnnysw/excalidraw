import React from "react";

import { reseed } from "@excalidraw/common";
import { pointFrom } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { restoreAppState } from "../data/restore";

import { API } from "./helpers/api";
import { Keyboard, Pointer, UI } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

unmountComponent();

const { h } = window;
const mouse = new Pointer("mouse");

const activateBoxEraser = () => {
  UI.clickOnTestId("toolbar-eraser");
  UI.clickOnTestId("toolbar-eraser-box");
};

describe("eraser", () => {
  beforeEach(() => {
    unmountComponent();
    localStorage.clear();
    reseed(7);
  });

  it("restores preferred eraser mode from browser state", () => {
    expect(
      restoreAppState(null, {
        preferredEraserMode: "box",
      } as any).preferredEraserMode,
    ).toBe("box");
  });

  it("switches eraser mode from the desktop toolbar while keeping eraser active", async () => {
    await render(<Excalidraw role="teacher" />);

    activateBoxEraser();

    expect(h.state.activeTool.type).toBe("eraser");
    expect(h.state.preferredEraserMode).toBe("box");
  });

  it("switches eraser mode from the mobile toolbar while keeping eraser active", async () => {
    await render(<Excalidraw role="teacher" UIOptions={{ formFactor: "phone" }} />);

    activateBoxEraser();

    expect(h.state.activeTool.type).toBe("eraser");
    expect(h.state.preferredEraserMode).toBe("box");
  });

  it("box-erases a partially intersected freedraw but not a partially overlapped rectangle", async () => {
    await render(<Excalidraw role="teacher" />);

    const freedraw = API.createElement({
      type: "freedraw",
      x: 0,
      y: 0,
      points: [pointFrom(0, 0), pointFrom(120, 0)],
    });
    const overlappedRectangle = API.createElement({
      type: "rectangle",
      x: 80,
      y: 0,
      width: 50,
      height: 50,
    });
    const containedRectangle = API.createElement({
      type: "rectangle",
      x: 150,
      y: 0,
      width: 20,
      height: 20,
    });

    API.setElements([freedraw, overlappedRectangle, containedRectangle]);
    activateBoxEraser();

    mouse.downAt(-10, -10);
    mouse.moveTo(175, 40);
    expect((h.app as any).elementsPendingErasure.has(freedraw.id)).toBe(true);
    expect((h.app as any).elementsPendingErasure.has(containedRectangle.id)).toBe(
      true,
    );
    mouse.up();

    expect(API.getElement(freedraw).isDeleted).toBe(true);
    expect(API.getElement(overlappedRectangle).isDeleted).toBe(false);
    expect(API.getElement(containedRectangle).isDeleted).toBe(true);
  });

  it("box-erases grouped elements and bound text together", async () => {
    await render(<Excalidraw role="teacher" />);

    const groupA = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      groupIds: ["group-a"],
    });
    const groupB = API.createElement({
      type: "rectangle",
      x: 100,
      y: 0,
      width: 20,
      height: 20,
      groupIds: ["group-a"],
    });
    const [container, boundText] = API.createTextContainer();
    API.updateElement(container, { x: 40, y: 60 });
    API.updateElement(boundText, { x: 50, y: 70 });

    API.setElements([groupA, groupB, container, boundText]);
    activateBoxEraser();

    mouse.downAt(-10, -10);
    mouse.moveTo(25, 25);
    mouse.up();

    expect(API.getElement(groupA).isDeleted).toBe(true);
    expect(API.getElement(groupB).isDeleted).toBe(true);

    mouse.downAt(30, 50);
    mouse.moveTo(150, 180);
    mouse.up();

    expect(API.getElement(container).isDeleted).toBe(true);
    expect(API.getElement(boundText).isDeleted).toBe(true);
  });

  it("box-erases ignores locked elements and frames", async () => {
    await render(<Excalidraw role="teacher" />);

    const lockedRectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 20,
      height: 20,
      locked: true,
    });
    const frame = API.createElement({
      type: "frame",
      x: 60,
      y: 0,
      width: 40,
      height: 40,
    });

    API.setElements([lockedRectangle, frame]);
    activateBoxEraser();

    mouse.downAt(-10, -10);
    mouse.moveTo(120, 60);
    mouse.up();

    expect(API.getElement(lockedRectangle).isDeleted).toBe(false);
    expect(API.getElement(frame).isDeleted).toBe(false);
  });

  it("path eraser still supports alt-restore during a drag", async () => {
    await render(<Excalidraw role="teacher" />);

    const rectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
    API.setElements([rectangle]);

    UI.clickOnTestId("toolbar-eraser");

    mouse.downAt(-10, 20);
    mouse.moveTo(10, 20);
    expect((h.app as any).elementsPendingErasure.has(rectangle.id)).toBe(true);

    Keyboard.withModifierKeys({ alt: true }, () => {
      mouse.moveTo(60, 20);
    });

    expect((h.app as any).elementsPendingErasure.has(rectangle.id)).toBe(false);
    mouse.up();

    expect(API.getElement(rectangle).isDeleted).toBe(false);
  });

  it("path eraser click no longer deletes locked elements", async () => {
    await render(<Excalidraw role="teacher" />);

    const lockedRectangle = API.createElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      locked: true,
    });
    API.setElements([lockedRectangle]);

    act(() => {
      h.app.setActiveTool({ type: "eraser" });
    });

    mouse.clickAt(10, 10);

    expect(API.getElement(lockedRectangle).isDeleted).toBe(false);
  });
});
