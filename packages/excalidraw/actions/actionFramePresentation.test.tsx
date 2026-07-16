import { act, fireEvent, screen, waitFor } from "@testing-library/react";

import { CaptureUpdateAction } from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { render } from "../tests/test-utils";

import { actionSetFrameExcludedFromPresentation } from "./actionFramePresentation";
import { createRedoAction, createUndoAction } from "./actionHistory";

const { h } = window;

const executeAction = (excluded: boolean) => {
  act(() => {
    h.app.actionManager.executeAction(
      actionSetFrameExcludedFromPresentation,
      "ui",
      excluded,
    );
  });
};

describe("actionSetFrameExcludedFromPresentation", () => {
  beforeEach(async () => {
    await render(<Excalidraw role="teacher" />);
  });

  it("excludes one ordinary frame and preserves its other custom data", () => {
    const frame = {
      ...API.createElement({ type: "frame" }),
      customData: { slideNoteHtml: "<p>Speaker note</p>" },
    };
    API.updateScene({
      elements: [frame],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    API.setSelectedElements([frame]);

    executeAction(true);

    const updatedFrame = API.getElement(frame);
    expect(updatedFrame.customData).toEqual({
      slideNoteHtml: "<p>Speaker note</p>",
      excludeFromPresentation: true,
    });
    expect(updatedFrame.version).toBe(frame.version + 1);
    expect(updatedFrame.versionNonce).not.toBe(frame.versionNonce);
  });

  it("includes one ordinary frame by deleting only the exclusion field", () => {
    const frame = {
      ...API.createElement({ type: "frame" }),
      customData: {
        slideNoteHtml: "<p>Keep me</p>",
        excludeFromPresentation: true,
      },
    };
    API.setElements([frame]);
    API.setSelectedElements([frame]);

    executeAction(false);

    const updatedFrame = API.getElement(frame);
    expect(updatedFrame.customData).toEqual({
      slideNoteHtml: "<p>Keep me</p>",
    });
    expect(updatedFrame.customData).not.toHaveProperty(
      "excludeFromPresentation",
    );
    expect(updatedFrame.version).toBe(frame.version + 1);
    expect(updatedFrame.versionNonce).not.toBe(frame.versionNonce);
  });

  it("writes exclusion changes to undo and redo history", () => {
    const frame = {
      ...API.createElement({ type: "frame" }),
      customData: { slideNoteHtml: "<p>Keep through history</p>" },
    };
    API.updateScene({
      elements: [frame],
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    API.setSelectedElements([frame]);

    executeAction(true);
    expect(API.getElement(frame).customData).toEqual({
      slideNoteHtml: "<p>Keep through history</p>",
      excludeFromPresentation: true,
    });

    API.executeAction(createUndoAction(h.history));
    expect(API.getElement(frame).customData).toEqual({
      slideNoteHtml: "<p>Keep through history</p>",
    });

    API.executeAction(createRedoAction(h.history));
    expect(API.getElement(frame).customData).toEqual({
      slideNoteHtml: "<p>Keep through history</p>",
      excludeFromPresentation: true,
    });
  });

  it.each([
    ["already excluded", true, { excludeFromPresentation: true }],
    ["already included", false, undefined],
  ])("is a no-op when the frame is %s", (_label, excluded, customData) => {
    const frame = {
      ...API.createElement({ type: "frame" }),
      customData,
    };
    API.setElements([frame]);
    API.setSelectedElements([frame]);
    const undoStackSize = API.getUndoStack().length;

    executeAction(excluded);

    expect(API.getElement(frame)).toBe(frame);
    expect(API.getUndoStack()).toHaveLength(undoStackSize);
  });

  it.each([
    ["a non-frame", "rectangle"],
    ["a magic frame", "magicframe"],
  ] as const)("does not change %s", (_label, type) => {
    const element = {
      ...API.createElement({ type }),
      customData: { slideNoteHtml: "<p>Keep me</p>" },
    };
    API.setElements([element]);
    API.setSelectedElements([element]);

    executeAction(true);

    expect(API.getElement(element)).toBe(element);
  });

  it("does not change a multi-selection containing a frame", () => {
    const frame = API.createElement({ type: "frame" });
    const rectangle = API.createElement({ type: "rectangle" });
    const elements: ExcalidrawElement[] = [frame, rectangle];
    API.setElements(elements);
    API.setSelectedElements(elements);

    executeAction(true);

    expect(API.getElement(frame)).toBe(frame);
    expect(API.getElement(rectangle)).toBe(rectangle);
  });
});

describe("frame presentation property", () => {
  beforeEach(async () => {
    await render(<Excalidraw role="teacher" />);
    API.setAppState({
      openSidebar: { name: "default", tab: "properties" },
    });
  });

  it("shows an accessible switch for exactly one ordinary frame", async () => {
    const frame = API.createElement({ type: "frame", id: "slide-frame" });
    API.setElements([frame]);
    API.setSelectedElements([frame]);

    const switchInput = await screen.findByLabelText("不作为 PPT 幻灯片");
    expect(switchInput).toHaveAttribute(
      "name",
      "exclude-frame-slide-frame-from-presentation",
    );
    expect(switchInput).not.toBeChecked();

    fireEvent.click(switchInput);

    await waitFor(() => {
      expect(API.getElement(frame).customData).toEqual({
        excludeFromPresentation: true,
      });
    });
  });

  it("toggles exclusion only once when activated with Space", async () => {
    const frame = API.createElement({ type: "frame", id: "keyboard-frame" });
    API.setElements([frame]);
    API.setSelectedElements([frame]);

    const switchInput = await screen.findByLabelText("不作为 PPT 幻灯片");
    switchInput.focus();

    fireEvent.keyDown(switchInput, { key: " " });
    fireEvent.keyUp(switchInput, { key: " " });
    fireEvent.click(switchInput);

    await waitFor(() => {
      const updatedFrame = API.getElement(frame);
      expect(updatedFrame.customData).toEqual({
        excludeFromPresentation: true,
      });
      expect(updatedFrame.version).toBe(frame.version + 1);
    });
  });

  it.each([
    ["a non-frame", [API.createElement({ type: "rectangle" })]],
    ["a magic frame", [API.createElement({ type: "magicframe" })]],
    [
      "multiple elements",
      [
        API.createElement({ type: "frame" }),
        API.createElement({ type: "rectangle" }),
      ],
    ],
  ])("hides the switch for %s", async (_label, elements) => {
    API.setElements(elements);
    API.setSelectedElements(elements);

    await waitFor(() => {
      expect(
        screen.queryByLabelText("不作为 PPT 幻灯片"),
      ).not.toBeInTheDocument();
    });
  });
});
