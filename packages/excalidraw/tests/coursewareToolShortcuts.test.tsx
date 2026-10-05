import React from "react";
import { vi } from "vitest";

import { Excalidraw } from "../index";
import { getToolNumericKey } from "../components/shapes";

import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, unmountComponent } from "./test-utils";

import type { ToolType, UIOptions } from "../types";

const { h } = window;

const renderEditor = async (
  toolbarLayout: UIOptions["toolbarLayout"] = "left",
) => {
  await render(
    <Excalidraw
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout, formFactor: "desktop" }}
    />,
  );
};

beforeEach(() => {
  unmountComponent();
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  unmountComponent();
  vi.unstubAllGlobals();
});

describe("courseware tool shortcuts", () => {
  it("uses 1 for selection, 2 for freedraw and 3 for eraser", async () => {
    await renderEditor();
    act(() => h.app.setActiveTool({ type: "rectangle" }));
    Keyboard.keyPress("1");
    expect(h.state.activeTool.type).toBe("selection");
    Keyboard.keyPress("2");
    expect(h.state.activeTool.type).toBe("freedraw");
    Keyboard.keyPress("3");
    expect(h.state.activeTool.type).toBe("eraser");
    Keyboard.keyPress("3");
    expect(h.state.activeTool.type).toBe("freedraw");
  });

  it("uses the existing selection preference for 1 and V", async () => {
    await renderEditor();
    API.setAppState({
      preferredSelectionTool: { type: "lasso", initialized: true },
    });
    Keyboard.keyPress("2");
    Keyboard.keyPress("1");
    expect(h.state.activeTool.type).toBe("lasso");
    Keyboard.keyPress("2");
    Keyboard.keyPress("v");
    expect(h.state.activeTool.type).toBe("lasso");
  });

  it.each(["0", "4", "5", "6", "7", "8", "9"])(
    "does not select a tool for removed numeric shortcut %s",
    async (key) => {
      await renderEditor();
      act(() => h.app.setActiveTool({ type: "diamond" }));
      Keyboard.keyPress(key);
      expect(h.state.activeTool.type).toBe("diamond");
    },
  );

  it.each([
    ["v", "selection"],
    ["r", "rectangle"],
    ["d", "diamond"],
    ["o", "ellipse"],
    ["a", "arrow"],
    ["l", "line"],
    ["p", "freedraw"],
    ["x", "freedraw"],
    ["t", "text"],
    ["e", "eraser"],
    ["h", "hand"],
    ["k", "laser"],
    ["f", "frame"],
  ] as const)("preserves letter %s for %s", async (key, type) => {
    await renderEditor();
    Keyboard.keyPress("2");
    Keyboard.keyPress(key);
    expect(h.state.activeTool.type).toBe(type);
  });

  it("preserves the courseware pen and highlighter letter shortcuts", async () => {
    await renderEditor();
    Keyboard.withModifierKeys({ shift: true }, () => Keyboard.keyPress("P"));
    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.state.coursewareBrush.mode).toBe("highlighter");
    Keyboard.keyPress("p");
    expect(h.state.coursewareBrush.mode).toBe("pen");
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "does not switch tools for numeric or hand shortcuts with %s",
    async (modifier) => {
      await renderEditor();
      act(() => h.app.setActiveTool({ type: "rectangle" }));
      for (const key of ["1", "2", "3", "h"]) {
        fireEvent.keyDown(document, { key, [modifier]: true });
        expect(h.state.activeTool.type).toBe("rectangle");
      }
    },
  );

  it.each(["input", "textarea", "contenteditable"])(
    "does not switch tools while typing in %s",
    async (targetType) => {
      await renderEditor();
      const target = document.createElement(
        targetType === "contenteditable" ? "div" : targetType,
      );
      if (targetType === "contenteditable") {
        target.contentEditable = "true";
        // jsdom does not implement the browser's isContentEditable getter.
        Object.defineProperty(target, "isContentEditable", { value: true });
      }
      document.body.appendChild(target);
      target.focus();
      try {
        for (const key of ["1", "2", "3", "v", "h", "e"]) {
          Keyboard.keyPress(key, target);
          expect(h.state.activeTool.type).toBe("selection");
        }
      } finally {
        target.remove();
      }
    },
  );

  it("keeps the existing numeric mapping on non-courseware canvases", async () => {
    await renderEditor("top");
    const shortcuts: readonly [string, ToolType][] = [
      ["1", "selection"],
      ["2", "hand"],
      ["3", "freedraw"],
      ["4", "eraser"],
      ["5", "text"],
      ["6", "rectangle"],
      ["7", "diamond"],
      ["8", "ellipse"],
      ["9", "arrow"],
      ["0", "line"],
    ];
    for (const [key, type] of shortcuts) {
      Keyboard.keyPress(key);
      expect(h.state.activeTool.type).toBe(type);
    }
  });

  it("exposes only the three courseware numeric tools to toolbar consumers", () => {
    expect(getToolNumericKey("selection", "left")).toBe("1");
    expect(getToolNumericKey("lasso", "left")).toBe("1");
    expect(getToolNumericKey("freedraw", "left")).toBe("2");
    expect(getToolNumericKey("eraser", "left")).toBe("3");
    for (const type of [
      "hand", "rectangle", "diamond", "ellipse", "arrow", "line", "text",
      "richText", "image", "frame", "laser",
    ] as const) {
      expect(getToolNumericKey(type, "left")).toBeNull();
    }
  });
});
