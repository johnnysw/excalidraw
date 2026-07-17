import { describe, expect, it } from "vitest";

import {
  appendTrailingCaretSentinel,
  applyContentEditableLineInput,
  getContentEditableSelectionOffsets,
  normalizeContentEditableInput,
  normalizeContentEditableText,
  readContentEditableText,
} from "./textWysiwyg";

const createEditableWithChild = (container: Node) => {
  const editable = document.createElement("div");
  editable.contentEditable = "true";
  editable.appendChild(container);
  return editable;
};

describe("getContentEditableSelectionOffsets", () => {
  it("maps an editable root endpoint after an inline span to the text end", () => {
    const span = document.createElement("span");
    span.textContent = "one line";
    const editable = createEditableWithChild(span);
    const range = document.createRange();
    range.setStart(editable, 1);
    range.collapse(true);

    expect(getContentEditableSelectionOffsets(editable, range)).toEqual({
      start: 8,
      end: 8,
    });
  });

  it("counts Chromium's trailing block and br caret sentinels", () => {
    const editable = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = "one line";
    const trailingBlock = document.createElement("div");
    trailingBlock.appendChild(document.createElement("br"));
    editable.append(span, trailingBlock);

    const range = document.createRange();
    range.setStart(trailingBlock, 1);
    range.collapse(true);

    expect(getContentEditableSelectionOffsets(editable, range)).toEqual({
      start: 10,
      end: 10,
    });
  });

  it("treats the Excalidraw trailing caret sentinel as zero-length", () => {
    const editable = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = "one line\n";
    editable.append(text);
    const sentinel = appendTrailingCaretSentinel(editable, text.textContent);

    expect(sentinel).not.toBeNull();
    const range = document.createRange();
    range.setStart(sentinel!.firstChild!, 1);
    range.collapse(true);

    expect(getContentEditableSelectionOffsets(editable, range)).toEqual({
      start: 9,
      end: 9,
    });
  });
});

describe("applyContentEditableLineInput", () => {
  it.each(["insertParagraph", "insertLineBreak"])(
    "inserts exactly one model newline for %s",
    (inputType) => {
      expect(
        applyContentEditableLineInput("one line", {
          inputType,
          selectionStart: 8,
          selectionEnd: 8,
        }),
      ).toEqual({
        text: "one line\n",
        selection: { start: 9, end: 9 },
      });
    },
  );

  it("handles Enter exposed as insertText with a carriage return", () => {
    expect(
      applyContentEditableLineInput("one line", {
        inputType: "insertText",
        data: "\r",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toEqual({
      text: "one line\n",
      selection: { start: 9, end: 9 },
    });
  });

  it("replaces the selected text with one newline", () => {
    expect(
      applyContentEditableLineInput("one line", {
        inputType: "insertParagraph",
        selectionStart: 3,
        selectionEnd: 7,
      }),
    ).toEqual({
      text: "one\ne",
      selection: { start: 4, end: 4 },
    });
  });

  it("deletes one adjacent model newline without consuming the caret sentinel", () => {
    expect(
      applyContentEditableLineInput("one line\n", {
        inputType: "deleteContentBackward",
        selectionStart: 9,
        selectionEnd: 9,
      }),
    ).toEqual({
      text: "one line",
      selection: { start: 8, end: 8 },
    });
    expect(
      applyContentEditableLineInput("one\nline", {
        inputType: "deleteContentForward",
        selectionStart: 3,
        selectionEnd: 3,
      }),
    ).toEqual({
      text: "oneline",
      selection: { start: 3, end: 3 },
    });
  });

  it("deletes the newline range reported by beforeinput", () => {
    expect(
      applyContentEditableLineInput("one line\n", {
        inputType: "deleteContentBackward",
        selectionStart: 8,
        selectionEnd: 9,
      }),
    ).toEqual({
      text: "one line",
      selection: { start: 8, end: 8 },
    });
  });

  it("returns null for ordinary text editing", () => {
    expect(
      applyContentEditableLineInput("one line", {
        inputType: "insertText",
        data: "x",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toBeNull();
  });
});

describe("readContentEditableText", () => {
  it("removes only the owned caret sentinel from the model text", () => {
    const editable = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = `one\u200B line\n`;
    editable.append(text);
    appendTrailingCaretSentinel(editable, text.textContent);

    expect(readContentEditableText(editable)).toBe(`one\u200B line\n`);
  });

  it("preserves text inserted next to the owned caret sentinel", () => {
    const editable = document.createElement("div");
    const text = document.createElement("span");
    text.textContent = "one line\n";
    editable.append(text);
    const sentinel = appendTrailingCaretSentinel(editable, text.textContent)!;
    sentinel.firstChild!.textContent += "x";

    expect(readContentEditableText(editable)).toBe("one line\nx");
  });
});

describe("normalizeContentEditableText", () => {
  it("collapses Chromium's duplicate trailing newline for one Enter press", () => {
    expect(
      normalizeContentEditableText("one line\n\n", {
        inputType: "insertParagraph",
        previousText: "one line",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toBe("one line\n");
  });

  it("normalizes the caret after Chromium inserts a duplicate newline", () => {
    expect(
      normalizeContentEditableInput("one line\n\n", {
        inputType: "insertParagraph",
        previousText: "one line",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toEqual({
      text: "one line\n",
      selection: { start: 9, end: 9 },
    });
  });

  it("adds exactly one trailing newline when blank lines already exist", () => {
    expect(
      normalizeContentEditableText("one line\n\n\n", {
        inputType: "insertParagraph",
        previousText: "one line\n",
        selectionStart: 9,
        selectionEnd: 9,
      }),
    ).toBe("one line\n\n");
  });

  it("removes a trailing newline when deletion leaves the DOM text unchanged", () => {
    expect(
      normalizeContentEditableText("one line\n", {
        inputType: "deleteContentBackward",
        previousText: "one line\n",
        selectionStart: 9,
        selectionEnd: 9,
      }),
    ).toBe("one line");
  });

  it("normalizes the caret after deleting a trailing newline", () => {
    expect(
      normalizeContentEditableInput("one line\n", {
        inputType: "deleteContentBackward",
        previousText: "one line\n",
        selectionStart: 9,
        selectionEnd: 9,
      }),
    ).toEqual({
      text: "one line",
      selection: { start: 8, end: 8 },
    });

    expect(
      normalizeContentEditableInput("one line\n", {
        inputType: "deleteContentForward",
        previousText: "one line\n",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toEqual({
      text: "one line",
      selection: { start: 8, end: 8 },
    });
  });

  it("preserves newline insertion and successful newline deletion", () => {
    expect(
      normalizeContentEditableText("one line\n", {
        inputType: "insertParagraph",
        previousText: "one line",
        selectionStart: 8,
        selectionEnd: 8,
      }),
    ).toBe("one line\n");
    expect(
      normalizeContentEditableText("one line\n", {
        inputType: "deleteContentBackward",
        previousText: "one line\n\n",
        selectionStart: 10,
        selectionEnd: 10,
      }),
    ).toBe("one line\n");
  });

  it("preserves deleting a selection containing multiple trailing newlines", () => {
    expect(
      normalizeContentEditableText("one line", {
        inputType: "deleteContentBackward",
        previousText: "one line\n\n",
        selectionStart: 8,
        selectionEnd: 10,
      }),
    ).toBe("one line");
  });

  it("does not rewrite a paragraph insertion away from the text end", () => {
    expect(
      normalizeContentEditableInput("one\nline", {
        inputType: "insertParagraph",
        previousText: "oneline",
        selectionStart: 3,
        selectionEnd: 3,
      }),
    ).toEqual({ text: "one\nline", selection: null });
  });

  it("leaves ordinary text unchanged", () => {
    expect(normalizeContentEditableText("one line")).toBe("one line");
  });
});
