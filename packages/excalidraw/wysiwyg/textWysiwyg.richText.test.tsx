import { KEYS } from "@excalidraw/common";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { actionChangeStrokeColor } from "../actions/actionProperties";
import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard } from "../tests/helpers/ui";
import { getTextEditor } from "../tests/queries/dom";
import {
  act,
  fireEvent,
  mockBoundingClientRect,
  render,
  restoreOriginalGetBoundingClientRect,
} from "../tests/test-utils";

const insertText = (
  editor: Awaited<ReturnType<typeof getTextEditor>>,
  text: string,
) => {
  const selectionStart = editor.selectionStart;
  const selectionEnd = editor.selectionEnd;
  editor.dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: text,
    }),
  );
  const current = editor.value;
  const next = `${current.slice(0, selectionStart)}${text}${current.slice(
    selectionEnd,
  )}`;
  editor.textContent = next;
  editor.innerText = next;
  editor.setSelectionRange(
    selectionStart + text.length,
    selectionStart + text.length,
  );
  fireEvent.input(editor, { inputType: "insertText", data: text });
};

describe("rich text WYSIWYG transactions", () => {
  beforeAll(() => {
    mockBoundingClientRect({ width: 800, height: 400 });
  });

  beforeEach(async () => {
    window.EXCALIDRAW_RICH_TEXT_V2 = true;
    await render(<Excalidraw handleKeyboardGlobally={true} />);
    const text = API.createElement({ type: "text", text: "ab" });
    API.setElements([text]);
    API.setSelectedElements([text]);
    Keyboard.keyPress(KEYS.ENTER);
  });

  afterEach(() => {
    window.EXCALIDRAW_RICH_TEXT_V2 = undefined;
  });

  afterAll(() => {
    restoreOriginalGetBoundingClientRect();
  });

  it("applies a pending caret style to input and undoes both transactions", async () => {
    const editor = await getTextEditor();
    editor.setSelectionRange(1, 1);
    fireEvent.keyUp(editor, { key: KEYS.ARROW_RIGHT });

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeStrokeColor, "api", {
        currentItemStrokeColor: "red",
      });
    });
    expect(window.h.state.textEditorPendingStyle).toEqual({ color: "red" });

    insertText(editor, "X");
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "aXb",
    );
    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([{ start: 1, end: 2, color: "red" }]);

    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "ab",
    );
    expect(window.h.state.textEditorPendingStyle).toEqual({ color: "red" });

    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect(window.h.state.textEditorPendingStyle).toBeNull();
  });

  it("merges continuous typing into one undo transaction", async () => {
    const editor = await getTextEditor();
    editor.setSelectionRange(2, 2);
    fireEvent.keyUp(editor, { key: KEYS.ARROW_RIGHT });

    insertText(editor, "X");
    insertText(editor, "Y");
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "abXY",
    );

    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "ab",
    );

    fireEvent.keyDown(editor, { key: "z", ctrlKey: true, shiftKey: true });
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "abXY",
    );
  });

  it("inherits the selection-start style when replacing selected text", async () => {
    const editor = await getTextEditor();
    editor.setSelectionRange(1, 2);
    fireEvent.keyUp(editor, { key: KEYS.ARROW_RIGHT });

    act(() => {
      window.h.app.actionManager.executeAction(actionChangeStrokeColor, "api", {
        currentItemStrokeColor: "red",
      });
    });
    expect(
      (window.h.elements[0] as ExcalidrawTextElement).textStyleRanges,
    ).toEqual([{ start: 1, end: 2, color: "red" }]);

    editor.setSelectionRange(1, 2);
    fireEvent.keyUp(editor, { key: KEYS.ARROW_RIGHT });
    insertText(editor, "X");

    const updated = window.h.elements[0] as ExcalidrawTextElement;
    expect(updated.originalText).toBe("aX");
    expect(updated.textStyleRanges).toEqual([
      { start: 1, end: 2, color: "red" },
    ]);
  });

  it("adds exactly one hard line and restores the original height on delete", async () => {
    const editor = await getTextEditor();
    const initialHeight = (window.h.elements[0] as ExcalidrawTextElement)
      .height;
    editor.setSelectionRange(2, 2);

    act(() => {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertParagraph",
        }),
      );
    });

    let textElement = window.h.elements[0] as ExcalidrawTextElement;
    expect(textElement.originalText).toBe("ab\n");
    expect(textElement.height).toBeGreaterThan(initialHeight);

    act(() => {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "deleteContentBackward",
        }),
      );
    });

    textElement = window.h.elements[0] as ExcalidrawTextElement;
    expect(textElement.originalText).toBe("ab");
    expect(textElement.height).toBe(initialHeight);
  });

  it("commits IME composition once and undoes it once", async () => {
    const editor = await getTextEditor();
    editor.setSelectionRange(2, 2);
    fireEvent.compositionStart(editor);
    editor.textContent = "ab中";
    editor.innerText = "ab中";
    editor.setSelectionRange(3, 3);
    fireEvent.input(editor, {
      inputType: "insertCompositionText",
      data: "中",
      isComposing: true,
    });
    fireEvent.compositionEnd(editor, { data: "中" });

    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "ab中",
    );
    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect((window.h.elements[0] as ExcalidrawTextElement).originalText).toBe(
      "ab",
    );
  });
});
