import { waitFor } from "@testing-library/dom";
import { fireEvent } from "@testing-library/react";

import {
  stripIgnoredNodesFromErrorMessage,
  trimErrorStack,
} from "../test-utils";

export const TEXT_EDITOR_SELECTOR = ".excalidraw-wysiwyg";

export type TextEditorElement = HTMLDivElement & {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  setSelectionRange: (start: number, end: number) => void;
  select: () => void;
};

const editorSelection = new WeakMap<
  TextEditorElement,
  { start: number; end: number }
>();

const getSelectionOffsets = (editor: TextEditorElement) => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return editorSelection.get(editor) ?? { start: 0, end: 0 };
  }

  const range = selection.getRangeAt(0);
  if (
    !editor.contains(range.startContainer) ||
    !editor.contains(range.endContainer)
  ) {
    return editorSelection.get(editor) ?? { start: 0, end: 0 };
  }

  const getOffset = (node: Node, offset: number) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let absoluteOffset = 0;
    while (current) {
      if (current === node) {
        return absoluteOffset + offset;
      }
      absoluteOffset += current.textContent?.length ?? 0;
      current = walker.nextNode();
    }
    return absoluteOffset;
  };

  const offsets = {
    start: getOffset(range.startContainer, range.startOffset),
    end: getOffset(range.endContainer, range.endOffset),
  };
  editorSelection.set(editor, offsets);
  return offsets;
};

const setSelectionOffsets = (
  editor: TextEditorElement,
  start: number,
  end: number,
) => {
  const textLength = editor.textContent?.length ?? 0;
  const next = {
    start: Math.max(0, Math.min(start, textLength)),
    end: Math.max(0, Math.min(end, textLength)),
  };
  editorSelection.set(editor, next);

  const findPoint = (absoluteOffset: number) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let remaining = absoluteOffset;
    while (current) {
      const length = current.textContent?.length ?? 0;
      if (remaining <= length) {
        return { node: current, offset: remaining };
      }
      remaining -= length;
      current = walker.nextNode();
    }
    return { node: editor as Node, offset: editor.childNodes.length };
  };

  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const startPoint = findPoint(next.start);
  const endPoint = findPoint(next.end);
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  selection.removeAllRanges();
  selection.addRange(range);
};

const installContentEditableTestAdapter = (editor: HTMLDivElement) => {
  const adapted = editor as TextEditorElement;
  if (Object.prototype.hasOwnProperty.call(adapted, "value")) {
    return adapted;
  }

  editorSelection.set(adapted, { start: 0, end: 0 });
  Object.defineProperties(adapted, {
    value: {
      configurable: true,
      get: () => adapted.textContent || adapted.innerText || "",
      set: (value: string) => {
        adapted.textContent = value;
        adapted.innerText = value;
        setSelectionOffsets(adapted, value.length, value.length);
      },
    },
    selectionStart: {
      configurable: true,
      get: () => getSelectionOffsets(adapted).start,
      set: (start: number) => {
        const current = editorSelection.get(adapted) ?? {
          start: 0,
          end: 0,
        };
        setSelectionOffsets(adapted, start, Math.max(start, current.end));
      },
    },
    selectionEnd: {
      configurable: true,
      get: () => getSelectionOffsets(adapted).end,
      set: (end: number) => {
        const current = editorSelection.get(adapted) ?? {
          start: 0,
          end: 0,
        };
        setSelectionOffsets(adapted, Math.min(current.start, end), end);
      },
    },
  });
  adapted.setSelectionRange = (start, end) =>
    setSelectionOffsets(adapted, start, end);
  adapted.select = () =>
    setSelectionOffsets(adapted, 0, adapted.innerText.length);
  return adapted;
};

export function getTextEditor(options: {
  selector?: string;
  waitForEditor: false;
}): Promise<TextEditorElement | null>;
export function getTextEditor(options?: {
  selector?: string;
  waitForEditor?: true;
}): Promise<TextEditorElement>;
export async function getTextEditor({
  selector = TEXT_EDITOR_SELECTOR,
  waitForEditor = true,
}: {
  selector?: string;
  waitForEditor?: boolean;
} = {}): Promise<TextEditorElement | null> {
  const error = trimErrorStack(new Error());
  try {
    const query = () => {
      const element = document.querySelector(selector);
      return element instanceof HTMLDivElement
        ? installContentEditableTestAdapter(element)
        : (element as HTMLInputElement | null);
    };
    if (waitForEditor) {
      await waitFor(() => expect(query()).not.toBe(null));
      return query() as TextEditorElement;
    }
    return query() as TextEditorElement | null;
  } catch (err: any) {
    stripIgnoredNodesFromErrorMessage(err);
    err.stack = error.stack;
    throw err;
  }
}

export const updateTextEditor = (
  editor: TextEditorElement | HTMLTextAreaElement | HTMLInputElement,
  value: string,
) => {
  if (editor instanceof HTMLDivElement) {
    editor.textContent = value;
    editor.innerText = value;
    setSelectionOffsets(
      editor as TextEditorElement,
      value.length,
      value.length,
    );
    fireEvent.input(editor, { inputType: "insertText", data: value });
    return;
  }
  fireEvent.change(editor, { target: { value } });
  fireEvent.input(editor);
};
