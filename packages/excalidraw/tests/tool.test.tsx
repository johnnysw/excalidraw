import React from "react";

import {
  DEFAULT_ELEMENT_PROPS,
  resolvablePromise,
  STROKE_WIDTH,
} from "@excalidraw/common";

import { Excalidraw } from "../index";

import { Pointer } from "./helpers/ui";
import { act, render } from "./test-utils";

import type { ExcalidrawImperativeAPI } from "../types";

describe("setActiveTool()", () => {
  const h = window.h;

  let excalidrawAPI: ExcalidrawImperativeAPI;

  const mouse = new Pointer("mouse");

  beforeEach(async () => {
    const excalidrawAPIPromise = resolvablePromise<ExcalidrawImperativeAPI>();
    await render(
      <Excalidraw
        role="teacher"
        excalidrawAPI={(api) => excalidrawAPIPromise.resolve(api as any)}
      />,
    );
    excalidrawAPI = await excalidrawAPIPromise;
  });

  it("should expose setActiveTool on package API", () => {
    expect(excalidrawAPI.setActiveTool).toBeDefined();
    expect(excalidrawAPI.setActiveTool).toBe(h.app.setActiveTool);
  });

  it("should set the active tool type", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle" });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("selection");
  });

  it("should use extra thin stroke width by default for freedraw", async () => {
    expect(h.state.currentItemStrokeWidth).toBe(
      DEFAULT_ELEMENT_PROPS.strokeWidth,
    );

    act(() => {
      excalidrawAPI.setActiveTool({ type: "freedraw" });
    });

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.state.currentItemStrokeWidth).toBe(STROKE_WIDTH.extraThin);
  });

  it("should not overwrite a custom freedraw stroke width after applying the default", async () => {
    act(() => {
      excalidrawAPI.setActiveTool({ type: "freedraw" });
    });
    expect(h.state.currentItemStrokeWidth).toBe(STROKE_WIDTH.extraThin);

    act(() => {
      excalidrawAPI.updateScene({
        appState: { currentItemStrokeWidth: DEFAULT_ELEMENT_PROPS.strokeWidth },
      });
      excalidrawAPI.setActiveTool({ type: "selection" });
      excalidrawAPI.setActiveTool({ type: "freedraw" });
    });

    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.state.currentItemStrokeWidth).toBe(
      DEFAULT_ELEMENT_PROPS.strokeWidth,
    );
  });

  it("should support tool locking", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "rectangle", locked: true });
    });
    expect(h.state.activeTool.type).toBe("rectangle");

    mouse.down(10, 10);
    mouse.up(20, 20);

    expect(h.state.activeTool.type).toBe("rectangle");
  });

  it("should set custom tool", async () => {
    expect(h.state.activeTool.type).toBe("selection");
    act(() => {
      excalidrawAPI.setActiveTool({ type: "custom", customType: "comment" });
    });
    expect(h.state.activeTool.type).toBe("custom");
    expect(h.state.activeTool.customType).toBe("comment");
  });
});
