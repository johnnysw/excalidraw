import { FONT_FAMILY } from "@excalidraw/common";

import type {
  ExcalidrawTextElement,
  TextStyleRange,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { act, render } from "../tests/test-utils";

import {
  actionChangeStrokeColor,
  actionChangeFontFamily,
  actionChangeFontSize,
  actionChangeFontWeight,
  actionChangeTextOutlineColor,
  actionChangeTextOutlineWidth,
  getEditingSelectionTextStyle,
} from "./actionProperties";

const BLACK = "#000000";

const createStyledText = (textStyleRanges: readonly TextStyleRange[]) => {
  const text = API.createElement({
    type: "text",
    text: "哈哈",
    strokeColor: BLACK,
    fontSize: 20,
    fontFamily: FONT_FAMILY.Excalifont,
  });

  return {
    ...text,
    fontWeight: "normal",
    textOutlineColor: "transparent",
    textOutlineWidth: 0,
    textStyleRanges,
  } as ExcalidrawTextElement;
};

const setEditingSelection = (
  element: ExcalidrawTextElement,
  start: number,
  end: number,
) => {
  API.setElements([element]);
  API.setSelectedElements([element]);
  API.setAppState({
    editingTextElement: element,
    textEditorSelection: { start, end },
    textEditorPendingStyle: null,
  });
};

describe("rich-text property actions", () => {
  beforeEach(async () => {
    window.EXCALIDRAW_RICH_TEXT_V2 = true;
    await render(<Excalidraw />);
  });

  afterEach(() => {
    window.EXCALIDRAW_RICH_TEXT_V2 = undefined;
  });

  it("changes selected red 哈哈 to base black without losing other local styles", () => {
    const text = createStyledText([
      {
        start: 0,
        end: 2,
        color: "red",
        fontSize: 28,
        fontWeight: "bold",
      },
    ]);
    setEditingSelection(text, 0, 2);

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeStrokeColor, "api", {
        currentItemStrokeColor: BLACK,
      });
    });

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.strokeColor).toBe(BLACK);
    expect(updated.textStyleRanges).toEqual([
      { start: 0, end: 2, fontSize: 28, fontWeight: "bold" },
    ]);
  });

  it("removes the final color-only override when setting the base color", () => {
    const text = createStyledText([{ start: 0, end: 2, color: "red" }]);
    setEditingSelection(text, 0, 2);

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeStrokeColor, "api", {
        currentItemStrokeColor: BLACK,
      });
    });

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.strokeColor).toBe(BLACK);
    expect(updated.textStyleRanges).toBeUndefined();
  });

  it("applies a whole-element color and clears only local color overrides", () => {
    const text = createStyledText([
      {
        start: 0,
        end: 2,
        color: "red",
        fontSize: 28,
        textOutlineWidth: 2,
      },
    ]);
    API.setElements([text]);
    API.setSelectedElements([text]);

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeStrokeColor, "api", {
        currentItemStrokeColor: "#1971c2",
      });
    });

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.strokeColor).toBe("#1971c2");
    expect(updated.textStyleRanges).toEqual([
      { start: 0, end: 2, fontSize: 28, textOutlineWidth: 2 },
    ]);
  });

  it("falls back to whole-element non-color formatting when V2 is disabled", () => {
    window.EXCALIDRAW_RICH_TEXT_V2 = false;
    const text = createStyledText([
      { start: 0, end: 1, color: "red", fontSize: 28 },
      { start: 1, end: 2, color: "blue", fontSize: 36 },
    ]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(
        actionChangeFontSize,
        "api",
        30,
      );
    });

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.fontSize).toBe(30);
    expect(updated.textStyleRanges).toEqual([
      { start: 0, end: 1, color: "red" },
      { start: 1, end: 2, color: "blue" },
    ]);
    expect(window.h.state.textEditorPendingStyle).toBeNull();
  });

  it("reports mixed selection values per property instead of base fallbacks", () => {
    const text = createStyledText([
      {
        start: 0,
        end: 1,
        color: "red",
        fontSize: 28,
        fontFamily: FONT_FAMILY["Comic Shanns"],
        fontWeight: "bold",
        textOutlineColor: "blue",
        textOutlineWidth: 2,
      },
    ]);
    setEditingSelection(text, 0, 2);

    expect(
      getEditingSelectionTextStyle(window.h.elements, window.h.state),
    ).toEqual({
      color: null,
      fontSize: null,
      fontFamily: null,
      fontWeight: null,
      textOutlineColor: null,
      textOutlineWidth: null,
    });
  });

  it("changes outline width on a selection without changing sibling properties", () => {
    const text = createStyledText([
      {
        start: 0,
        end: 2,
        color: "red",
        fontFamily: FONT_FAMILY["Comic Shanns"],
        textOutlineWidth: 2,
      },
    ]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(
        actionChangeTextOutlineWidth,
        "api",
        { currentItemTextOutlineWidth: 4 },
      );
    });

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.textStyleRanges).toEqual([
      {
        start: 0,
        end: 1,
        color: "red",
        fontFamily: FONT_FAMILY["Comic Shanns"],
        textOutlineWidth: 4,
      },
      {
        start: 1,
        end: 2,
        color: "red",
        fontFamily: FONT_FAMILY["Comic Shanns"],
        textOutlineWidth: 2,
      },
    ]);
  });

  it("applies font size locally without changing color", () => {
    const text = createStyledText([{ start: 0, end: 2, color: "red" }]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeFontSize, "api", 36);
    });

    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([
      { start: 0, end: 1, color: "red", fontSize: 36 },
      { start: 1, end: 2, color: "red" },
    ]);
  });

  it("applies font family locally without changing sibling properties", () => {
    const text = createStyledText([
      { start: 0, end: 2, color: "red", fontWeight: "bold" },
    ]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeFontFamily, "api", {
        currentItemFontFamily: FONT_FAMILY["Comic Shanns"],
        currentHoveredFontFamily: null,
      });
    });

    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([
      {
        start: 0,
        end: 1,
        color: "red",
        fontFamily: FONT_FAMILY["Comic Shanns"],
        fontWeight: "bold",
      },
      { start: 1, end: 2, color: "red", fontWeight: "bold" },
    ]);
  });

  it("applies font weight locally without changing color", () => {
    const text = createStyledText([{ start: 0, end: 2, color: "red" }]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(
        actionChangeFontWeight,
        "api",
        "bold",
      );
    });

    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([
      { start: 0, end: 1, color: "red", fontWeight: "bold" },
      { start: 1, end: 2, color: "red" },
    ]);
  });

  it("applies outline color locally without changing outline width", () => {
    const text = createStyledText([
      { start: 0, end: 2, color: "red", textOutlineWidth: 2 },
    ]);
    setEditingSelection(text, 0, 1);

    act(() => {
      window.h.app.actionManager.executeAction(
        actionChangeTextOutlineColor,
        "api",
        { currentItemTextOutlineColor: "blue" },
      );
    });

    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([
      {
        start: 0,
        end: 1,
        color: "red",
        textOutlineColor: "blue",
        textOutlineWidth: 2,
      },
      { start: 1, end: 2, color: "red", textOutlineWidth: 2 },
    ]);
  });
});
