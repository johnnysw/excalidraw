import {
  CODES,
  KEYS,
  CLASSES,
  POINTER_BUTTON,
  isWritableElement,
  getFontString,
  getFontFamilyString,
  isTestEnv,
  MIME_TYPES,
} from "@excalidraw/common";

import {
  bumpVersion,
  computeBoundTextPosition,
  computeContainerDimensionForBoundText,
  getBoundTextElementId,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  getContainerElement,
  getTextElementAngle,
  isArrowElement,
  isBoundToContainer,
  isTextElement,
  layoutTextElement,
  LinearElementEditor,
  normalizeText,
  originalContainerCache,
  redrawTextBoundingBox,
  updateOriginalContainerCache,
  applyTextStyleToRange,
  applyTextStyleRanges,
  getTextElementBaseStyle,
  normalizeTextStyleRanges,
  resolveTextStyleAt,
  transformTextStyleRangesForEdit,
} from "@excalidraw/element";

import type { TextStyle } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElementWithContainer,
  ExcalidrawTextElement,
  TextStyleRange,
} from "@excalidraw/element/types";

import { actionSaveToActiveFile } from "../actions";

import {
  actionDecreaseFontSize,
  actionIncreaseFontSize,
} from "../actions/actionProperties";
import {
  actionResetZoom,
  actionZoomIn,
  actionZoomOut,
} from "../actions/actionCanvas";

import type App from "../components/App";
import type { AppState } from "../types";

const getTransform = (
  width: number,
  height: number,
  angle: number,
  appState: AppState,
  maxWidth: number,
  maxHeight: number,
) => {
  const { zoom } = appState;
  const degree = (180 * angle) / Math.PI;
  let translateX = (width * (zoom.value - 1)) / 2;
  let translateY = (height * (zoom.value - 1)) / 2;
  if (width > maxWidth && zoom.value !== 1) {
    translateX = (maxWidth * (zoom.value - 1)) / 2;
  }
  if (height > maxHeight && zoom.value !== 1) {
    translateY = (maxHeight * (zoom.value - 1)) / 2;
  }
  return `translate(${translateX}px, ${translateY}px) scale(${zoom.value}) rotate(${degree}deg)`;
};

type SubmitHandler = () => void;

type TextEditorSelection = {
  start: number;
  end: number;
  direction: "forward" | "backward";
};

type TextUndoState = {
  originalText: string;
  textStyleRanges: TextStyleRange[];
  selection: TextEditorSelection;
  pendingStyle: TextStyle | null;
};

type TextHistoryKind = "typing" | "delete" | "discrete";

type RichTextClipboardPayload = {
  type: typeof EXCALIDRAW_RICH_TEXT_MIME_TYPE;
  version: 1;
  text: string;
  textStyleRanges: TextStyleRange[];
};

export const EXCALIDRAW_RICH_TEXT_MIME_TYPE =
  "application/vnd.excalidraw.rich-text+json";

const cloneTextStyleRanges = (
  ranges: readonly TextStyleRange[] | undefined,
): TextStyleRange[] => ranges?.map((range) => ({ ...range })) ?? [];

const cloneTextStyle = (style: TextStyle | null): TextStyle | null =>
  style ? { ...style } : null;

export const getContentEditableSelectionDirection = (
  selection: Selection,
  range: Range,
): TextEditorSelection["direction"] =>
  !range.collapsed &&
  selection.anchorNode === range.endContainer &&
  selection.anchorOffset === range.endOffset
    ? "backward"
    : "forward";

export const serializeRichTextClipboard = (
  text: string,
  ranges: readonly TextStyleRange[] | undefined,
  start: number,
  end: number,
  baseStyle: Readonly<TextStyle>,
) => {
  const selectionStart = Math.max(0, Math.min(start, end, text.length));
  const selectionEnd = Math.max(
    selectionStart,
    Math.min(Math.max(start, end), text.length),
  );
  const selectedText = text.slice(selectionStart, selectionEnd);
  const boundaries = new Set<number>([selectionStart, selectionEnd]);

  for (const range of ranges ?? []) {
    if (range.start > selectionStart && range.start < selectionEnd) {
      boundaries.add(range.start);
    }
    if (range.end > selectionStart && range.end < selectionEnd) {
      boundaries.add(range.end);
    }
  }

  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  );
  const selectedRanges: TextStyleRange[] = [];
  for (let index = 0; index < sortedBoundaries.length - 1; index++) {
    const segmentStart = sortedBoundaries[index];
    const segmentEnd = sortedBoundaries[index + 1];
    if (segmentStart >= segmentEnd) {
      continue;
    }
    selectedRanges.push({
      start: segmentStart - selectionStart,
      end: segmentEnd - selectionStart,
      ...resolveTextStyleAt(segmentStart, ranges, baseStyle),
    });
  }

  const payload: RichTextClipboardPayload = {
    type: EXCALIDRAW_RICH_TEXT_MIME_TYPE,
    version: 1,
    text: selectedText,
    textStyleRanges: selectedRanges,
  };
  return JSON.stringify(payload);
};

const parseClipboardStyleRange = (value: unknown): TextStyleRange | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const range = value as Record<string, unknown>;
  if (
    typeof range.start !== "number" ||
    !Number.isFinite(range.start) ||
    typeof range.end !== "number" ||
    !Number.isFinite(range.end)
  ) {
    return null;
  }

  const parsed: TextStyleRange = { start: range.start, end: range.end };
  if (typeof range.color === "string") {
    parsed.color = range.color;
  }
  if (typeof range.fontSize === "number" && Number.isFinite(range.fontSize)) {
    parsed.fontSize = range.fontSize;
  }
  if (
    typeof range.fontFamily === "number" &&
    Number.isFinite(range.fontFamily)
  ) {
    parsed.fontFamily = range.fontFamily as TextStyleRange["fontFamily"];
  }
  if (range.fontWeight === "normal" || range.fontWeight === "bold") {
    parsed.fontWeight = range.fontWeight;
  }
  if (typeof range.textOutlineColor === "string") {
    parsed.textOutlineColor = range.textOutlineColor;
  }
  if (
    typeof range.textOutlineWidth === "number" &&
    Number.isFinite(range.textOutlineWidth)
  ) {
    parsed.textOutlineWidth = range.textOutlineWidth;
  }
  return parsed;
};

export const parseRichTextClipboard = (
  serialized: string,
): RichTextClipboardPayload | null => {
  if (!serialized) {
    return null;
  }
  try {
    const value = JSON.parse(serialized) as Partial<RichTextClipboardPayload>;
    if (
      value.type !== EXCALIDRAW_RICH_TEXT_MIME_TYPE ||
      value.version !== 1 ||
      typeof value.text !== "string" ||
      !Array.isArray(value.textStyleRanges)
    ) {
      return null;
    }
    const parsedRanges = value.textStyleRanges
      .map(parseClipboardStyleRange)
      .filter((range): range is TextStyleRange => range !== null);
    return {
      type: EXCALIDRAW_RICH_TEXT_MIME_TYPE,
      version: 1,
      text: normalizeText(value.text),
      textStyleRanges: normalizeTextStyleRanges(
        normalizeText(value.text).length,
        parsedRanges,
        {},
      ),
    };
  } catch {
    return null;
  }
};

type ContentEditableInputOptions = {
  inputType?: string;
  previousText?: string;
  selectionStart?: number;
  selectionEnd?: number;
};

export const normalizeContentEditableInput = (
  rawText: string,
  options?: ContentEditableInputOptions,
) => {
  const normalized = normalizeText(rawText);
  const previousText = options?.previousText;
  const unchangedInput = { text: normalized, selection: null };

  if (previousText == null || options?.selectionStart == null) {
    return unchangedInput;
  }

  const normalizedPreviousText = normalizeText(previousText);
  const selectionStart = options.selectionStart;
  const selectionEnd = options.selectionEnd ?? selectionStart;
  const isCollapsedSelection = selectionStart === selectionEnd;
  if (!isCollapsedSelection) {
    return unchangedInput;
  }

  const countTrailingNewlines = (text: string) => {
    let count = 0;
    for (
      let index = text.length - 1;
      index >= 0 && text[index] === "\n";
      index--
    ) {
      count++;
    }
    return count;
  };

  const previousTrailingNewlines = countTrailingNewlines(
    normalizedPreviousText,
  );
  const trailingNewlines = countTrailingNewlines(normalized);
  const previousContent = normalizedPreviousText.slice(
    0,
    normalizedPreviousText.length - previousTrailingNewlines,
  );
  const content = normalized.slice(0, normalized.length - trailingNewlines);

  if (content !== previousContent) {
    return unchangedInput;
  }

  const isTrailingParagraphInsertion =
    (options.inputType === "insertParagraph" ||
      options.inputType === "insertLineBreak") &&
    selectionStart === normalizedPreviousText.length;

  if (isTrailingParagraphInsertion) {
    const caretOffset = selectionStart + 1;
    return {
      text: `${content}${"\n".repeat(previousTrailingNewlines + 1)}`,
      selection: { start: caretOffset, end: caretOffset },
    };
  }

  const isTrailingNewlineDeletion =
    previousTrailingNewlines > 0 &&
    ((options.inputType === "deleteContentBackward" &&
      selectionStart === normalizedPreviousText.length) ||
      (options.inputType === "deleteContentForward" &&
        selectionStart >= previousContent.length &&
        selectionStart < normalizedPreviousText.length));

  if (isTrailingNewlineDeletion) {
    const caretOffset =
      options.inputType === "deleteContentBackward"
        ? Math.max(0, selectionStart - 1)
        : selectionStart;
    return {
      text: `${content}${"\n".repeat(previousTrailingNewlines - 1)}`,
      selection: { start: caretOffset, end: caretOffset },
    };
  }

  return unchangedInput;
};

export const normalizeContentEditableText = (
  rawText: string,
  options?: ContentEditableInputOptions,
) => normalizeContentEditableInput(rawText, options).text;

const TRAILING_CARET_SENTINEL = "\u200B";
const TRAILING_CARET_SENTINEL_SELECTOR =
  "[data-excalidraw-caret-sentinel='true']";

export const appendTrailingCaretSentinel = (
  editable: HTMLElement,
  text: string,
) => {
  if (!text.endsWith("\n")) {
    return null;
  }

  const sentinel = document.createElement("span");
  sentinel.dataset.excalidrawCaretSentinel = "true";
  sentinel.setAttribute("aria-hidden", "true");
  sentinel.textContent = TRAILING_CARET_SENTINEL;
  editable.appendChild(sentinel);
  return sentinel;
};

export const readContentEditableText = (editable: HTMLElement) => {
  const readText = () =>
    editable.isConnected
      ? editable.innerText || ""
      : editable.textContent || "";
  const sentinel = editable.querySelector(TRAILING_CARET_SENTINEL_SELECTOR);
  if (!sentinel) {
    return readText();
  }

  const walker = document.createTreeWalker(sentinel, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const sentinelIndex = textNode.data.indexOf(TRAILING_CARET_SENTINEL);
    if (sentinelIndex !== -1) {
      textNode.deleteData(sentinelIndex, TRAILING_CARET_SENTINEL.length);
      try {
        return readText();
      } finally {
        textNode.insertData(sentinelIndex, TRAILING_CARET_SENTINEL);
      }
    }
    node = walker.nextNode();
  }

  return readText();
};

export const applyContentEditableLineInput = (
  text: string,
  options: {
    inputType: string;
    data?: string | null;
    selectionStart: number;
    selectionEnd: number;
  },
): {
  text: string;
  selection: { start: number; end: number };
} | null => {
  const { inputType, data, selectionStart, selectionEnd } = options;
  if (
    selectionStart < 0 ||
    selectionEnd < selectionStart ||
    selectionEnd > text.length
  ) {
    return null;
  }

  const isLineInsertion =
    inputType === "insertParagraph" ||
    inputType === "insertLineBreak" ||
    (inputType === "insertText" && (data === "\n" || data === "\r"));

  if (isLineInsertion) {
    const caretOffset = selectionStart + 1;
    return {
      text: `${text.slice(0, selectionStart)}\n${text.slice(selectionEnd)}`,
      selection: { start: caretOffset, end: caretOffset },
    };
  }

  const isDeletion =
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward";

  if (
    isDeletion &&
    selectionStart !== selectionEnd &&
    text.slice(selectionStart, selectionEnd).includes("\n")
  ) {
    return {
      text: `${text.slice(0, selectionStart)}${text.slice(selectionEnd)}`,
      selection: { start: selectionStart, end: selectionStart },
    };
  }

  if (
    selectionStart === selectionEnd &&
    inputType === "deleteContentBackward" &&
    selectionStart > 0 &&
    text[selectionStart - 1] === "\n"
  ) {
    const caretOffset = selectionStart - 1;
    return {
      text: `${text.slice(0, caretOffset)}${text.slice(selectionStart)}`,
      selection: { start: caretOffset, end: caretOffset },
    };
  }

  if (
    selectionStart === selectionEnd &&
    inputType === "deleteContentForward" &&
    text[selectionStart] === "\n"
  ) {
    return {
      text: `${text.slice(0, selectionStart)}${text.slice(selectionStart + 1)}`,
      selection: { start: selectionStart, end: selectionStart },
    };
  }

  return null;
};

const CONTENT_EDITABLE_BLOCK_ELEMENTS = new Set([
  "DIV",
  "P",
  "LI",
  "UL",
  "OL",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
]);

export const getContentEditableSelectionOffsets = (
  editable: HTMLElement,
  range: {
    startContainer: Node;
    startOffset: number;
    endContainer: Node;
    endOffset: number;
  },
): { start: number; end: number } | null => {
  let start = -1;
  let end = -1;
  let currentLength = 0;

  const traverse = (node: Node) => {
    if (start !== -1 && end !== -1) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const sentinelIndex = node.parentElement?.closest(
        TRAILING_CARET_SENTINEL_SELECTOR,
      )
        ? text.indexOf(TRAILING_CARET_SENTINEL)
        : -1;
      const toModelOffset = (offset: number) =>
        currentLength +
        offset -
        (sentinelIndex !== -1 && offset > sentinelIndex ? 1 : 0);

      if (range.startContainer === node) {
        start = toModelOffset(range.startOffset);
      }
      if (range.endContainer === node) {
        end = toModelOffset(range.endOffset);
      }
      currentLength += text.length - (sentinelIndex === -1 ? 0 : 1);
      return;
    }

    if (node.nodeName === "BR") {
      if (range.startContainer === node) {
        start = currentLength + range.startOffset;
      }
      if (range.endContainer === node) {
        end = currentLength + range.endOffset;
      }
      currentLength += 1;
      return;
    }

    const children = node.childNodes;
    for (let index = 0; index < children.length; index++) {
      const child = children[index];
      if (
        currentLength > 0 &&
        CONTENT_EDITABLE_BLOCK_ELEMENTS.has(child.nodeName)
      ) {
        currentLength += 1;
      }

      if (range.startContainer === node && range.startOffset === index) {
        start = currentLength;
      }
      if (range.endContainer === node && range.endOffset === index) {
        end = currentLength;
      }

      traverse(child);
      if (start !== -1 && end !== -1) {
        return;
      }
    }

    if (
      range.startContainer === node &&
      range.startOffset === children.length
    ) {
      start = currentLength;
    }
    if (range.endContainer === node && range.endOffset === children.length) {
      end = currentLength;
    }
  };

  traverse(editable);
  return start === -1 || end === -1 ? null : { start, end };
};

export const restoreContentEditableSelection = (
  editable: HTMLElement,
  start: number,
  end: number,
  modelText = readContentEditableText(editable),
  direction: "forward" | "backward" = "forward",
) => {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  if (start === end && start === modelText.length && modelText.endsWith("\n")) {
    const sentinel = editable.querySelector(TRAILING_CARET_SENTINEL_SELECTOR);
    const sentinelWalker = sentinel
      ? document.createTreeWalker(sentinel, NodeFilter.SHOW_TEXT)
      : null;
    const sentinelNode = sentinelWalker?.nextNode();
    if (sentinelNode) {
      const range = document.createRange();
      range.setStart(sentinelNode, 0);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }

  let currentLength = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;

  const traverse = (node: Node) => {
    if (startNode && endNode) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const sentinelIndex = node.parentElement?.closest(
        TRAILING_CARET_SENTINEL_SELECTOR,
      )
        ? text.indexOf(TRAILING_CARET_SENTINEL)
        : -1;
      const textLength = text.length - (sentinelIndex === -1 ? 0 : 1);
      const toDomOffset = (modelOffset: number) => {
        const offset = modelOffset - currentLength;
        return (
          offset + (sentinelIndex !== -1 && offset >= sentinelIndex ? 1 : 0)
        );
      };
      if (!startNode && currentLength + textLength >= start) {
        startNode = node;
        startOffset = toDomOffset(start);
      }
      if (!endNode && currentLength + textLength >= end) {
        endNode = node;
        endOffset = toDomOffset(end);
      }
      currentLength += textLength;
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      traverse(child);
    }
  };
  traverse(editable);

  const resolvedStartNode = startNode as Node | null;
  const resolvedEndNode = endNode as Node | null;
  if (!resolvedStartNode || !resolvedEndNode) {
    return;
  }
  const safeStartOffset = Math.min(
    startOffset,
    resolvedStartNode.textContent?.length ?? 0,
  );
  const safeEndOffset = Math.min(
    endOffset,
    resolvedEndNode.textContent?.length ?? 0,
  );
  if (direction === "backward" && typeof selection.extend === "function") {
    selection.removeAllRanges();
    selection.collapse(resolvedEndNode, safeEndOffset);
    selection.extend(resolvedStartNode, safeStartOffset);
    return;
  }

  const range = document.createRange();
  range.setStart(resolvedStartNode, safeStartOffset);
  range.setEnd(resolvedEndNode, safeEndOffset);
  selection.removeAllRanges();
  selection.addRange(range);
};

export const textWysiwyg = ({
  id,
  onChange,
  onSubmit,
  getViewportCoords,
  element,
  canvas,
  excalidrawContainer,
  app,
  autoSelect = true,
}: {
  id: ExcalidrawElement["id"];
  /**
   * textWysiwyg only deals with `originalText`
   *
   * Note: `text`, which can be wrapped and therefore different from `originalText`,
   *       is derived from `originalText`
   */
  onChange?: (nextOriginalText: string) => void;
  onSubmit: (data: { viaKeyboard: boolean; nextOriginalText: string }) => void;
  getViewportCoords: (x: number, y: number) => [number, number];
  element: ExcalidrawTextElement;
  canvas: HTMLCanvasElement;
  excalidrawContainer: HTMLDivElement | null;
  app: App;
  autoSelect?: boolean;
}): SubmitHandler => {
  let currentSelection: TextEditorSelection | null = null;
  let isInputting = false;
  let isComposing = false;
  let compositionStartState: TextUndoState | null = null;
  let pendingInputState: TextUndoState | null = null;

  const undoStack: TextUndoState[] = [];
  const redoStack: TextUndoState[] = [];
  let lastSavedText = element.originalText || "";

  const textPropertiesUpdated = (
    updatedTextElement: ExcalidrawTextElement,
    editable: HTMLElement,
  ) => {
    if (!editable.style.fontFamily || !editable.style.fontSize) {
      return false;
    }
    const currentFont = editable.style.fontFamily.replace(/"/g, "");
    if (
      getFontFamilyString({ fontFamily: updatedTextElement.fontFamily }) !==
      currentFont
    ) {
      return true;
    }
    if (`${updatedTextElement.fontSize}px` !== editable.style.fontSize) {
      return true;
    }
    return false;
  };

  const updateWysiwygStyle = () => {
    const appState = app.state;
    const updatedTextElement = app.scene.getElement<ExcalidrawTextElement>(id);

    if (!updatedTextElement) {
      return;
    }
    const { textAlign, verticalAlign } = updatedTextElement;
    const elementsMap = app.scene.getNonDeletedElementsMap();
    if (updatedTextElement && isTextElement(updatedTextElement)) {
      let coordX = updatedTextElement.x;
      let coordY = updatedTextElement.y;
      const container = getContainerElement(
        updatedTextElement,
        app.scene.getNonDeletedElementsMap(),
      );

      let width = updatedTextElement.width;

      // set to element height by default since that's
      // what is going to be used for unbounded text
      let height = updatedTextElement.height;

      let maxWidth = updatedTextElement.width;
      let maxHeight = updatedTextElement.height;

      if (container && updatedTextElement.containerId) {
        if (isArrowElement(container)) {
          const boundTextCoords =
            LinearElementEditor.getBoundTextElementPosition(
              container,
              updatedTextElement as ExcalidrawTextElementWithContainer,
              elementsMap,
            );
          coordX = boundTextCoords.x;
          coordY = boundTextCoords.y;
        }
        const propertiesUpdated = textPropertiesUpdated(
          updatedTextElement,
          editable,
        );

        let originalContainerData;
        if (propertiesUpdated) {
          originalContainerData = updateOriginalContainerCache(
            container.id,
            container.height,
          );
        } else {
          originalContainerData = originalContainerCache[container.id];
          if (!originalContainerData) {
            originalContainerData = updateOriginalContainerCache(
              container.id,
              container.height,
            );
          }
        }

        maxWidth = getBoundTextMaxWidth(container, updatedTextElement);
        maxHeight = getBoundTextMaxHeight(
          container,
          updatedTextElement as ExcalidrawTextElementWithContainer,
        );

        // autogrow container height if text exceeds
        if (!isArrowElement(container) && height > maxHeight) {
          const targetContainerHeight = computeContainerDimensionForBoundText(
            height,
            container.type,
          );

          app.scene.mutateElement(container, { height: targetContainerHeight });
          return;
        } else if (
          // autoshrink container height until original container height
          // is reached when text is removed
          !isArrowElement(container) &&
          container.height > originalContainerData.height &&
          height < maxHeight
        ) {
          const targetContainerHeight = computeContainerDimensionForBoundText(
            height,
            container.type,
          );
          app.scene.mutateElement(container, { height: targetContainerHeight });
        } else {
          const { x, y } = computeBoundTextPosition(
            container,
            updatedTextElement as ExcalidrawTextElementWithContainer,
            elementsMap,
          );
          coordX = x;
          coordY = y;
        }
      }
      const [viewportX, viewportY] = getViewportCoords(coordX, coordY);

      if (!container) {
        maxWidth = (appState.width - 8 - viewportX) / appState.zoom.value;
        width = Math.min(width, maxWidth);
      } else {
        width += 0.5;
      }

      // add 5% buffer otherwise it causes wysiwyg to jump
      height *= 1.05;

      const font = getFontString(updatedTextElement);

      // Make sure text editor height doesn't go beyond viewport
      const editorMaxHeight =
        (appState.height - viewportY) / appState.zoom.value;
      Object.assign(editable.style, {
        font,
        // must be defined *after* font ¯\_(ツ)_/¯
        lineHeight: updatedTextElement.lineHeight,
        width: `${width}px`,
        height: `${height}px`,
        left: `${viewportX}px`,
        top: `${viewportY}px`,
        transform: getTransform(
          width,
          height,
          getTextElementAngle(updatedTextElement, container),
          appState,
          maxWidth,
          editorMaxHeight,
        ),
        textAlign,
        verticalAlign,
        color: updatedTextElement.strokeColor,
        opacity: updatedTextElement.opacity / 100,
        filter: "var(--theme-filter)",
        maxHeight: `${editorMaxHeight}px`,
      });

      // Mirror canvas text outline in WYSIWYG editor using CSS stroke
      const styleAny = editable.style as any;
      const hasPartialTextOutline =
        updatedTextElement.textStyleRanges?.some(
          (range) =>
            range.textOutlineWidth != null || range.textOutlineColor != null,
        ) ?? false;

      if (!hasPartialTextOutline && updatedTextElement.textOutlineWidth > 0) {
        styleAny.webkitTextStrokeWidth = `${updatedTextElement.textOutlineWidth}px`;
        styleAny.webkitTextStrokeColor = updatedTextElement.textOutlineColor;
      } else {
        styleAny.webkitTextStrokeWidth = "";
        styleAny.webkitTextStrokeColor = "";
      }
      editable.scrollTop = 0;
      // For some reason updating font attribute doesn't set font family
      // hence updating font family explicitly for test environment
      if (isTestEnv()) {
        editable.style.fontFamily = getFontFamilyString(updatedTextElement);
      }

      if (!isComposing) {
        renderStyledTextFromElement(updatedTextElement);

        // After rendering rich text, check if content height exceeds container height
        // (e.g., when some text has a larger fontSize via textStyleRanges).
        // If so, expand the editor to fit the content.
        if (editable.scrollHeight > editable.clientHeight) {
          editable.style.height = `${editable.scrollHeight * 1.05}px`;
        }

        // After re-rendering styled text, restore selection (if any)
        // so users can continue applying styles to the same range.
        restoreSelectionFromAppState();
      }

      app.scene.mutateElement(updatedTextElement, { x: coordX, y: coordY });
    }
  };

  const editable = document.createElement("div");

  const getEditableInput = (
    inputType?: string,
    selection?: { start: number; end: number } | null,
  ) =>
    normalizeContentEditableInput(readContentEditableText(editable), {
      inputType,
      previousText: lastSavedText,
      selectionStart: selection?.start,
      selectionEnd: selection?.end,
    });

  const getEditableText = (
    inputType?: string,
    selection?: { start: number; end: number } | null,
  ) => getEditableInput(inputType, selection).text;

  editable.dir = "auto";
  editable.tabIndex = 0;
  editable.dataset.type = "wysiwyg";
  editable.contentEditable = "true";
  editable.classList.add("excalidraw-wysiwyg");

  let whiteSpace = "pre";
  let wordBreak = "normal";

  if (isBoundToContainer(element) || !element.autoResize) {
    whiteSpace = "pre-wrap";
    wordBreak = "break-word";
  }
  Object.assign(editable.style, {
    position: "absolute",
    display: "inline-block",
    minHeight: "1em",
    backfaceVisibility: "hidden",
    margin: 0,
    padding: 0,
    border: 0,
    outline: 0,
    resize: "none",
    background: "transparent",
    overflow: "visible",
    // must be specified because in dark mode canvas creates a stacking context
    zIndex: "var(--zIndex-wysiwyg)",
    wordBreak,
    // prevent line wrapping (`whitespace: nowrap` doesn't work on FF)
    whiteSpace,
    overflowWrap: "break-word",
    boxSizing: "content-box",
  });

  const renderStyledTextFromElement = (textElement: ExcalidrawTextElement) => {
    const text = textElement.originalText || "";
    const baseStyle = {
      color: textElement.strokeColor,
      fontSize: textElement.fontSize,
      fontFamily: textElement.fontFamily,
      fontWeight: textElement.fontWeight ?? "normal",
      textOutlineColor: textElement.textOutlineColor,
      textOutlineWidth: textElement.textOutlineWidth,
    };

    editable.innerHTML = "";

    if (!text.length) {
      return;
    }
    const normalizedRanges = normalizeTextStyleRanges(
      text.length,
      textElement.textStyleRanges,
      baseStyle,
    );
    const appendSpan = (start: number, end: number, style: TextStyle) => {
      if (start >= end) {
        return;
      }
      const span = document.createElement("span");
      span.textContent = text.slice(start, end);
      span.style.color = style.color ?? textElement.strokeColor;
      span.style.fontSize = `${style.fontSize ?? textElement.fontSize}px`;
      span.style.fontFamily = getFontFamilyString({
        fontFamily: style.fontFamily ?? textElement.fontFamily,
      });
      span.style.fontWeight = style.fontWeight ?? "normal";
      span.style.lineHeight = `${textElement.lineHeight}`;
      span.style.verticalAlign = "baseline";
      const spanStyle = span.style as CSSStyleDeclaration & {
        webkitTextStrokeWidth: string;
        webkitTextStrokeColor: string;
      };
      spanStyle.webkitTextStrokeWidth = `${
        style.textOutlineWidth ?? textElement.textOutlineWidth
      }px`;
      spanStyle.webkitTextStrokeColor =
        style.textOutlineColor ?? textElement.textOutlineColor;
      editable.appendChild(span);
    };

    if (normalizedRanges.length) {
      const container = getContainerElement(
        textElement,
        app.scene.getNonDeletedElementsMap(),
      );
      const layout = layoutTextElement(textElement, {
        maxWidth: container
          ? getBoundTextMaxWidth(container, textElement)
          : !textElement.autoResize
          ? textElement.width
          : undefined,
      });

      layout.lines.forEach((line, lineIndex) => {
        line.runs.forEach((run) =>
          appendSpan(run.sourceStart, run.sourceEnd, run.style),
        );
        if (line.breakType === "hard") {
          const nextSourceStart =
            layout.lines[lineIndex + 1]?.sourceStart ?? text.length;
          editable.appendChild(
            document.createTextNode(
              text.slice(line.sourceEnd, nextSourceStart) || "\n",
            ),
          );
        }
      });
      appendTrailingCaretSentinel(editable, text);
      return;
    }

    let sourceIndex = 0;
    for (const range of normalizedRanges) {
      appendSpan(sourceIndex, range.start, baseStyle);
      appendSpan(range.start, range.end, { ...baseStyle, ...range });
      sourceIndex = range.end;
    }
    appendSpan(sourceIndex, text.length, baseStyle);

    appendTrailingCaretSentinel(editable, text);
  };

  editable.innerText = element.originalText;
  updateWysiwygStyle();

  const getSelectionState = (): TextEditorSelection | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    if (
      !editable.contains(range.startContainer) ||
      !editable.contains(range.endContainer)
    ) {
      return null;
    }

    const offsets = getContentEditableSelectionOffsets(editable, range);
    return offsets
      ? {
          ...offsets,
          direction: getContentEditableSelectionDirection(selection, range),
        }
      : null;
  };

  const getBeforeInputSelection = (
    event: InputEvent,
  ): TextEditorSelection | null => {
    const targetRanges =
      typeof event.getTargetRanges === "function"
        ? event.getTargetRanges()
        : [];

    if (targetRanges.length > 0) {
      const offsets = getContentEditableSelectionOffsets(
        editable,
        targetRanges[0],
      );
      if (offsets) {
        const liveSelection = getSelectionState();
        return {
          ...offsets,
          direction:
            liveSelection?.start === offsets.start &&
            liveSelection.end === offsets.end
              ? liveSelection.direction
              : "forward",
        };
      }
    }

    return getSelectionState();
  };

  const getFallbackSelection = (): TextEditorSelection =>
    getSelectionState() ??
    currentSelection ?? {
      start: 0,
      end: 0,
      direction: "forward",
    };

  const captureEditorState = (
    selection: TextEditorSelection = getFallbackSelection(),
  ): TextUndoState => {
    const textElement = app.scene.getElement<ExcalidrawTextElement>(id);
    return {
      originalText: lastSavedText,
      textStyleRanges: cloneTextStyleRanges(textElement?.textStyleRanges),
      selection: { ...selection },
      pendingStyle: cloneTextStyle(app.state.textEditorPendingStyle),
    };
  };

  let observedHistoryState = captureEditorState({
    start: 0,
    end: 0,
    direction: "forward",
  });
  let lastHistoryTransaction: {
    kind: Exclude<TextHistoryKind, "discrete">;
    timestamp: number;
    selection: TextEditorSelection;
  } | null = null;

  const areTextStyleRangesEqual = (
    first: readonly TextStyleRange[],
    second: readonly TextStyleRange[],
  ) => JSON.stringify(first) === JSON.stringify(second);

  const arePendingStylesEqual = (
    first: TextStyle | null,
    second: TextStyle | null,
  ) => JSON.stringify(first) === JSON.stringify(second);

  const syncExternalEditorHistory = (
    state: TextUndoState = captureEditorState(),
  ) => {
    const contentChanged =
      state.originalText !== observedHistoryState.originalText ||
      !areTextStyleRangesEqual(
        state.textStyleRanges,
        observedHistoryState.textStyleRanges,
      ) ||
      !arePendingStylesEqual(
        state.pendingStyle,
        observedHistoryState.pendingStyle,
      );
    if (contentChanged) {
      undoStack.push(observedHistoryState);
      redoStack.length = 0;
      lastHistoryTransaction = null;
    }
    observedHistoryState = {
      ...state,
      selection: { ...state.selection },
      textStyleRanges: cloneTextStyleRanges(state.textStyleRanges),
      pendingStyle: cloneTextStyle(state.pendingStyle),
    };
  };

  const getTextEdit = (oldText: string, newText: string) => {
    let start = 0;
    const sharedLength = Math.min(oldText.length, newText.length);
    while (start < sharedLength && oldText[start] === newText[start]) {
      start++;
    }
    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (
      oldEnd > start &&
      newEnd > start &&
      oldText[oldEnd - 1] === newText[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }
    return {
      start,
      end: oldEnd,
      insertedText: newText.slice(start, newEnd),
    };
  };

  const getRangesAfterEdit = ({
    before,
    nextOriginalText,
    edit = getTextEdit(before.originalText, nextOriginalText),
    pastedRanges,
  }: {
    before: TextUndoState;
    nextOriginalText: string;
    edit?: { start: number; end: number; insertedText: string };
    pastedRanges?: readonly TextStyleRange[];
  }) => {
    const textElement = app.scene.getElement<ExcalidrawTextElement>(id);
    if (!textElement) {
      return [];
    }
    const baseStyle = getTextElementBaseStyle(textElement);
    let ranges = transformTextStyleRangesForEdit({
      oldText: before.originalText,
      newText: nextOriginalText,
      start: edit.start,
      end: edit.end,
      insertedText: edit.insertedText,
      ranges: before.textStyleRanges,
      baseStyle,
    });

    const effectivePastedRanges = pastedRanges;
    if (effectivePastedRanges?.length) {
      ranges = applyTextStyleRanges(
        nextOriginalText.length,
        ranges,
        effectivePastedRanges.map((range) => ({
          ...range,
          start: edit.start + range.start,
          end: edit.start + range.end,
        })),
        baseStyle,
      );
    } else if (edit.insertedText && before.pendingStyle) {
      const pendingStyle = before.pendingStyle;
      if (!pendingStyle) {
        return ranges;
      }
      ranges = applyTextStyleToRange(
        nextOriginalText.length,
        ranges,
        edit.start,
        edit.start + edit.insertedText.length,
        pendingStyle,
        baseStyle,
      );
    }

    return ranges;
  };

  const applyElementTextStyleRanges = (ranges: readonly TextStyleRange[]) => {
    const textElement = app.scene.getElement<ExcalidrawTextElement>(id);
    if (!textElement) {
      return;
    }
    const nextRanges = cloneTextStyleRanges(ranges);
    if (
      areTextStyleRangesEqual(
        cloneTextStyleRanges(textElement.textStyleRanges),
        nextRanges,
      )
    ) {
      return;
    }
    app.scene.mutateElement(textElement, {
      textStyleRanges: nextRanges,
    });
    const updatedTextElement = app.scene.getElement<ExcalidrawTextElement>(id);
    if (updatedTextElement) {
      redrawTextBoundingBox(
        updatedTextElement,
        getContainerElement(
          updatedTextElement,
          app.scene.getNonDeletedElementsMap(),
        ),
        app.scene,
      );
    }
  };

  const restoreSelectionByOffset = (
    start: number,
    end: number,
    direction: TextEditorSelection["direction"] = "forward",
  ) => {
    restoreContentEditableSelection(
      editable,
      start,
      end,
      lastSavedText,
      direction,
    );
  };

  const commitEditorUpdate = ({
    before,
    nextOriginalText,
    nextSelection,
    edit,
    textStyleRanges,
    pastedRanges,
    recordHistory = true,
    rebuildDom = true,
    historyKind = "discrete",
  }: {
    before: TextUndoState;
    nextOriginalText: string;
    nextSelection: TextEditorSelection;
    edit?: { start: number; end: number; insertedText: string };
    textStyleRanges?: readonly TextStyleRange[];
    pastedRanges?: readonly TextStyleRange[];
    recordHistory?: boolean;
    rebuildDom?: boolean;
    historyKind?: TextHistoryKind;
  }) => {
    if (!onChange) {
      return;
    }
    const normalizedText = normalizeText(nextOriginalText);
    const nextRanges = textStyleRanges
      ? cloneTextStyleRanges(textStyleRanges)
      : getRangesAfterEdit({
          before,
          nextOriginalText: normalizedText,
          edit,
          pastedRanges,
        });
    const hasChanged =
      normalizedText !== before.originalText ||
      !areTextStyleRangesEqual(nextRanges, before.textStyleRanges);

    if (!hasChanged) {
      currentSelection = { ...nextSelection };
      app.setState({
        textEditorSelection: {
          start: nextSelection.start,
          end: nextSelection.end,
        },
      });
      restoreSelectionByOffset(
        nextSelection.start,
        nextSelection.end,
        nextSelection.direction,
      );
      observedHistoryState = captureEditorState(nextSelection);
      return;
    }

    if (recordHistory) {
      syncExternalEditorHistory(before);
      const now = Date.now();
      const canMerge =
        historyKind !== "discrete" &&
        lastHistoryTransaction?.kind === historyKind &&
        now - lastHistoryTransaction.timestamp <= 1000 &&
        lastHistoryTransaction.selection.start === before.selection.start &&
        lastHistoryTransaction.selection.end === before.selection.end;
      if (!canMerge) {
        undoStack.push(before);
      }
      redoStack.length = 0;
      lastHistoryTransaction =
        historyKind === "discrete"
          ? null
          : { kind: historyKind, timestamp: now, selection: nextSelection };
    }

    isInputting = true;
    try {
      onChange(normalizedText);
      lastSavedText = normalizedText;
      applyElementTextStyleRanges(nextRanges);
      currentSelection = { ...nextSelection };
      app.setState({
        textEditorSelection: {
          start: nextSelection.start,
          end: nextSelection.end,
        },
      });
      if (rebuildDom) {
        updateWysiwygStyle();
        restoreSelectionByOffset(
          nextSelection.start,
          nextSelection.end,
          nextSelection.direction,
        );
      }
      observedHistoryState = captureEditorState(nextSelection);
    } finally {
      isInputting = false;
    }
  };

  const restoreEditorState = (state: TextUndoState) => {
    if (!onChange) {
      return;
    }
    isInputting = true;
    try {
      app.setState({
        textEditorPendingStyle: cloneTextStyle(state.pendingStyle),
        textEditorSelection: {
          start: state.selection.start,
          end: state.selection.end,
        },
      });
      onChange(state.originalText);
      lastSavedText = state.originalText;
      applyElementTextStyleRanges(state.textStyleRanges);
      currentSelection = { ...state.selection };
      updateWysiwygStyle();
      restoreSelectionByOffset(
        state.selection.start,
        state.selection.end,
        state.selection.direction,
      );
      observedHistoryState = captureEditorState(state.selection);
      lastHistoryTransaction = null;
    } finally {
      isInputting = false;
    }
  };

  const writeSelectionToClipboard = (event: ClipboardEvent) => {
    const selection = getSelectionState() ?? currentSelection;
    const clipboardData = event.clipboardData;
    const textElement = app.scene.getElement<ExcalidrawTextElement>(id);
    if (
      !selection ||
      selection.start === selection.end ||
      !clipboardData ||
      !textElement
    ) {
      return null;
    }
    const plainText = lastSavedText.slice(selection.start, selection.end);
    clipboardData.setData(MIME_TYPES.text, plainText);
    try {
      clipboardData.setData(
        EXCALIDRAW_RICH_TEXT_MIME_TYPE,
        serializeRichTextClipboard(
          lastSavedText,
          textElement.textStyleRanges,
          selection.start,
          selection.end,
          getTextElementBaseStyle(textElement),
        ),
      );
    } catch {
      // Some browsers reject custom clipboard types but still allow plain text.
    }
    event.preventDefault();
    return selection;
  };

  editable.oncopy = (event) => {
    writeSelectionToClipboard(event);
  };

  if (onChange) {
    editable.oncut = (event) => {
      const selection = writeSelectionToClipboard(event);
      if (!selection) {
        return;
      }
      const before = captureEditorState(selection);
      commitEditorUpdate({
        before,
        nextOriginalText: `${before.originalText.slice(
          0,
          selection.start,
        )}${before.originalText.slice(selection.end)}`,
        nextSelection: {
          start: selection.start,
          end: selection.start,
          direction: "forward",
        },
        edit: {
          start: selection.start,
          end: selection.end,
          insertedText: "",
        },
      });
    };

    editable.onpaste = (event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) {
        return;
      }
      const richText = parseRichTextClipboard(
        clipboardData.getData(EXCALIDRAW_RICH_TEXT_MIME_TYPE),
      );
      let pastedText = richText?.text ?? clipboardData.getData(MIME_TYPES.text);
      if (!pastedText) {
        const html = clipboardData.getData(MIME_TYPES.html);
        if (html) {
          pastedText =
            new DOMParser().parseFromString(html, MIME_TYPES.html).body
              .textContent ?? "";
        }
      }
      pastedText = normalizeText(pastedText);
      if (!pastedText) {
        return;
      }

      event.preventDefault();
      const selection = getFallbackSelection();
      const before = captureEditorState(selection);
      const nextOriginalText = `${before.originalText.slice(
        0,
        selection.start,
      )}${pastedText}${before.originalText.slice(selection.end)}`;
      const caret = selection.start + pastedText.length;
      commitEditorUpdate({
        before,
        nextOriginalText,
        nextSelection: {
          start: caret,
          end: caret,
          direction: "forward",
        },
        edit: {
          start: selection.start,
          end: selection.end,
          insertedText: pastedText,
        },
        pastedRanges: richText?.textStyleRanges,
        historyKind: "discrete",
      });
    };

    editable.oninput = (event) => {
      const inputEvent = event as InputEvent;
      if (isComposing || inputEvent.isComposing) {
        pendingInputState = null;
        return;
      }
      const before =
        pendingInputState ?? captureEditorState(currentSelection ?? undefined);
      const normalizedInput = getEditableInput(
        inputEvent.inputType,
        before.selection,
      );
      pendingInputState = null;
      const selection = normalizedInput.selection
        ? { ...normalizedInput.selection, direction: "forward" as const }
        : getFallbackSelection();
      commitEditorUpdate({
        before,
        nextOriginalText: normalizedInput.text,
        nextSelection: selection,
        historyKind: inputEvent.inputType?.startsWith("delete")
          ? "delete"
          : inputEvent.inputType === "insertText"
          ? "typing"
          : "discrete",
      });
    };
  }

  editable.onbeforeinput = (event) => {
    const inputEvent = event as InputEvent;
    if (isComposing || inputEvent.isComposing) {
      return;
    }
    const inputSelection = getBeforeInputSelection(inputEvent);
    if (!inputSelection) {
      return;
    }
    pendingInputState = captureEditorState(inputSelection);

    if (
      !onChange ||
      !event.cancelable ||
      isComposing ||
      inputEvent.isComposing
    ) {
      return;
    }

    const next = applyContentEditableLineInput(lastSavedText, {
      inputType: inputEvent.inputType,
      data: inputEvent.data,
      selectionStart: inputSelection.start,
      selectionEnd: inputSelection.end,
    });
    if (!next) {
      return;
    }

    event.preventDefault();
    const before = pendingInputState;
    pendingInputState = null;
    commitEditorUpdate({
      before,
      nextOriginalText: next.text,
      nextSelection: { ...next.selection, direction: "forward" },
      historyKind: "discrete",
    });
  };

  const performUndo = () => {
    syncExternalEditorHistory();
    if (undoStack.length === 0) {
      return;
    }
    redoStack.push(captureEditorState());
    restoreEditorState(undoStack.pop()!);
  };

  const performRedo = () => {
    syncExternalEditorHistory();
    if (redoStack.length === 0) {
      return;
    }
    undoStack.push(captureEditorState());
    restoreEditorState(redoStack.pop()!);
  };

  editable.onkeydown = (event) => {
    // Handle Undo (Ctrl+Z / Cmd+Z)
    if (
      event[KEYS.CTRL_OR_CMD] &&
      event.key.toLowerCase() === "z" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      performUndo();
      return;
    }
    // Handle Redo (Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y)
    if (
      (event[KEYS.CTRL_OR_CMD] &&
        event.key.toLowerCase() === "z" &&
        event.shiftKey) ||
      (event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === "y")
    ) {
      event.preventDefault();
      performRedo();
      return;
    }
    if (!event.shiftKey && actionZoomIn.keyTest(event)) {
      event.preventDefault();
      app.actionManager.executeAction(actionZoomIn);
      updateWysiwygStyle();
    } else if (!event.shiftKey && actionZoomOut.keyTest(event)) {
      event.preventDefault();
      app.actionManager.executeAction(actionZoomOut);
      updateWysiwygStyle();
    } else if (!event.shiftKey && actionResetZoom.keyTest(event)) {
      event.preventDefault();
      app.actionManager.executeAction(actionResetZoom);
      updateWysiwygStyle();
    } else if (actionDecreaseFontSize.keyTest(event)) {
      app.actionManager.executeAction(actionDecreaseFontSize);
    } else if (actionIncreaseFontSize.keyTest(event)) {
      app.actionManager.executeAction(actionIncreaseFontSize);
    } else if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      submittedViaKeyboard = true;
      handleSubmit();
    } else if (actionSaveToActiveFile.keyTest(event)) {
      event.preventDefault();
      handleSubmit();
      app.actionManager.executeAction(actionSaveToActiveFile);
    } else if (event.key === KEYS.ENTER && event[KEYS.CTRL_OR_CMD]) {
      event.preventDefault();
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      submittedViaKeyboard = true;
      handleSubmit();
    } else if (
      event.key === KEYS.TAB ||
      (event[KEYS.CTRL_OR_CMD] &&
        (event.code === CODES.BRACKET_LEFT ||
          event.code === CODES.BRACKET_RIGHT))
    ) {
      event.preventDefault();
      if (event.isComposing) {
        return;
      }
      if (event.shiftKey || event.code === CODES.BRACKET_LEFT) {
        outdent();
      } else {
        indent();
      }
    }
  };

  // Update text editor selection state for rich text functionality
  const updateTextEditorSelection = () => {
    const selection = getSelectionState();
    if (!selection) {
      // Don't clear textEditorSelection here - preserve it for property panel actions
      return;
    }
    const selectionMoved =
      currentSelection !== null &&
      (currentSelection.start !== selection.start ||
        currentSelection.end !== selection.end);
    currentSelection = selection;
    const nextTextEditorSelection = {
      start: selection.start,
      end: selection.end,
    };
    if (selectionMoved && !isInputting && !isComposing) {
      app.setState({
        textEditorSelection: nextTextEditorSelection,
        textEditorPendingStyle: null,
      });
    } else {
      app.setState({ textEditorSelection: nextTextEditorSelection });
    }
    observedHistoryState.selection = { ...selection };
    if (selectionMoved && !isInputting && !isComposing) {
      lastHistoryTransaction = null;
    }
  };

  function restoreSelectionFromAppState() {
    const sel = isInputting ? currentSelection : app.state.textEditorSelection;
    if (!sel) {
      return;
    }

    const direction =
      currentSelection?.start === sel.start && currentSelection.end === sel.end
        ? currentSelection.direction
        : "forward";
    restoreSelectionByOffset(sel.start, sel.end, direction);
  }

  editable.addEventListener("compositionstart", () => {
    compositionStartState = captureEditorState();
    pendingInputState = null;
    isComposing = true;
  });

  editable.addEventListener("compositionend", () => {
    const before = compositionStartState ?? captureEditorState();
    const normalized = getEditableText();
    const selection = getFallbackSelection();
    commitEditorUpdate({
      before,
      nextOriginalText: normalized,
      nextSelection: selection,
      rebuildDom: false,
      historyKind: "discrete",
    });
    isComposing = false;
    compositionStartState = null;
    pendingInputState = null;

    isInputting = true;
    try {
      updateWysiwygStyle();
      restoreSelectionByOffset(
        selection.start,
        selection.end,
        selection.direction,
      );
    } finally {
      isInputting = false;
    }
  });

  // Listen for selection changes
  editable.onselect = updateTextEditorSelection;
  editable.onmouseup = updateTextEditorSelection;
  editable.onkeyup = updateTextEditorSelection;

  const TAB_SIZE = 4;
  const TAB = " ".repeat(TAB_SIZE);
  const RE_LEADING_TAB = new RegExp(`^ {1,${TAB_SIZE}}`);

  const commitKeyboardTextEdit = (
    nextText: string,
    nextSelection: TextEditorSelection,
    before: TextUndoState,
    textStyleRanges?: readonly TextStyleRange[],
  ) => {
    if (!onChange || nextText === lastSavedText) {
      restoreSelectionByOffset(
        nextSelection.start,
        nextSelection.end,
        nextSelection.direction,
      );
      return;
    }
    commitEditorUpdate({
      before,
      nextOriginalText: nextText,
      nextSelection,
      textStyleRanges,
    });
  };

  const getSelectedLinesStartIndices = (
    text: string,
    selection: { start: number; end: number },
  ) => {
    const firstLineStart = text.lastIndexOf("\n", selection.start - 1) + 1;
    const effectiveEnd =
      selection.end > selection.start && text[selection.end - 1] === "\n"
        ? selection.end - 1
        : selection.end;
    const lineStarts = [firstLineStart];
    let lineBreak = text.indexOf("\n", firstLineStart);
    while (lineBreak !== -1 && lineBreak < effectiveEnd) {
      lineStarts.push(lineBreak + 1);
      lineBreak = text.indexOf("\n", lineBreak + 1);
    }
    return lineStarts;
  };

  const indent = () => {
    const selection = getSelectionState() ?? currentSelection;
    if (!selection) {
      return;
    }
    const text = getEditableText();
    const before = captureEditorState(selection);
    const lineStarts = getSelectedLinesStartIndices(text, selection);
    let nextText = text;
    let nextRanges = before.textStyleRanges;
    for (let index = lineStarts.length - 1; index >= 0; index--) {
      const lineStart = lineStarts[index];
      const previousText = nextText;
      nextText = `${previousText.slice(0, lineStart)}${TAB}${previousText.slice(
        lineStart,
      )}`;
      nextRanges = getRangesAfterEdit({
        before: {
          ...before,
          originalText: previousText,
          textStyleRanges: nextRanges,
        },
        nextOriginalText: nextText,
        edit: { start: lineStart, end: lineStart, insertedText: TAB },
      });
    }
    commitKeyboardTextEdit(
      nextText,
      {
        start: selection.start + TAB_SIZE,
        end: selection.end + TAB_SIZE * lineStarts.length,
        direction: selection.direction,
      },
      before,
      nextRanges,
    );
  };

  const outdent = () => {
    const selection = getSelectionState() ?? currentSelection;
    if (!selection) {
      return;
    }
    const text = getEditableText();
    const before = captureEditorState(selection);
    const lineStarts = getSelectedLinesStartIndices(text, selection);
    const removals = lineStarts.map((lineStart) => ({
      lineStart,
      count: text.slice(lineStart).match(RE_LEADING_TAB)?.[0].length ?? 0,
    }));
    let nextText = text;
    let nextRanges = before.textStyleRanges;
    for (let index = removals.length - 1; index >= 0; index--) {
      const { lineStart, count } = removals[index];
      if (count > 0) {
        const previousText = nextText;
        nextText = `${previousText.slice(0, lineStart)}${previousText.slice(
          lineStart + count,
        )}`;
        nextRanges = getRangesAfterEdit({
          before: {
            ...before,
            originalText: previousText,
            textStyleRanges: nextRanges,
          },
          nextOriginalText: nextText,
          edit: {
            start: lineStart,
            end: lineStart + count,
            insertedText: "",
          },
        });
      }
    }

    const adjustOffset = (offset: number) => {
      let nextOffset = offset;
      for (const { lineStart, count } of removals) {
        if (count === 0 || lineStart >= offset) {
          continue;
        }
        nextOffset -= Math.min(count, offset - lineStart);
      }
      return nextOffset;
    };
    commitKeyboardTextEdit(
      nextText,
      {
        start: adjustOffset(selection.start),
        end: adjustOffset(selection.end),
        direction: selection.direction,
      },
      before,
      nextRanges,
    );
  };

  const stopEvent = (event: Event) => {
    if (event.target instanceof HTMLCanvasElement) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // using a state variable instead of passing it to the handleSubmit callback
  // so that we don't need to create separate a callback for event handlers
  let submittedViaKeyboard = false;
  const handleSubmit = () => {
    // prevent double submit
    if (isDestroyed) {
      return;
    }

    isDestroyed = true;
    // cleanup must be run before onSubmit otherwise when app blurs the wysiwyg
    // it'd get stuck in an infinite loop of blur→onSubmit after we re-focus the
    // wysiwyg on update
    cleanup();
    const updateElement = app.scene.getElement(
      element.id,
    ) as ExcalidrawTextElement;
    if (!updateElement) {
      return;
    }
    const container = getContainerElement(
      updateElement,
      app.scene.getNonDeletedElementsMap(),
    );
    const finalText = onChange ? lastSavedText : getEditableText();

    if (container) {
      if (finalText.trim()) {
        const boundTextElementId = getBoundTextElementId(container);
        if (!boundTextElementId || boundTextElementId !== element.id) {
          app.scene.mutateElement(container, {
            boundElements: (container.boundElements || []).concat({
              type: "text",
              id: element.id,
            }),
          });
        } else if (isArrowElement(container)) {
          // updating an arrow label may change bounds, prevent stale cache:
          bumpVersion(container);
        }
      } else {
        app.scene.mutateElement(container, {
          boundElements: container.boundElements?.filter(
            (ele) =>
              !isTextElement(
                ele as ExcalidrawTextElement | ExcalidrawLinearElement,
              ),
          ),
        });
      }

      redrawTextBoundingBox(updateElement, container, app.scene);
    }

    onSubmit({
      viaKeyboard: submittedViaKeyboard,
      nextOriginalText: finalText,
    });
  };

  const cleanup = () => {
    // remove events to ensure they don't late-fire
    editable.onblur = null;
    editable.onbeforeinput = null;
    editable.oninput = null;
    editable.onkeydown = null;
    editable.onselect = null;
    editable.onmouseup = null;
    editable.onkeyup = null;

    // Clear text editor selection state
    app.setState({
      textEditorSelection: null,
      textEditorPendingStyle: null,
    });

    if (observer) {
      observer.disconnect();
    }

    window.removeEventListener("resize", updateWysiwygStyle);
    window.removeEventListener("wheel", stopEvent, true);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", bindBlurEvent);
    window.removeEventListener("blur", handleSubmit);
    window.removeEventListener("beforeunload", handleSubmit);
    unbindUpdate();
    unbindOnScroll();

    editable.remove();
  };

  const bindBlurEvent = (event?: MouseEvent) => {
    window.removeEventListener("pointerup", bindBlurEvent);
    // Deferred so that the pointerdown that initiates the wysiwyg doesn't
    // trigger the blur on ensuing pointerup.
    // Also to handle cases such as picking a color which would trigger a blur
    // in that same tick.
    const target = event?.target;

    const isPropertiesTrigger =
      target instanceof HTMLElement &&
      target.classList.contains("properties-trigger");
    const isPropertiesContent =
      (target instanceof HTMLElement || target instanceof SVGElement) &&
      !!(target as Element).closest(".properties-content");
    const inShapeActionsMenu =
      (target instanceof HTMLElement || target instanceof SVGElement) &&
      (!!(target as Element).closest(`.${CLASSES.SHAPE_ACTIONS_MENU}`) ||
        !!(target as Element).closest(".compact-shape-actions-island"));

    setTimeout(() => {
      // If we interacted within shape actions menu or its popovers/triggers,
      // keep submit disabled and don't steal focus back to textarea.
      if (inShapeActionsMenu || isPropertiesTrigger || isPropertiesContent) {
        return;
      }

      // Otherwise, re-enable submit on blur and refocus the editor.
      editable.onblur = handleSubmit;
      editable.focus();

      // When first entering edit mode (bindBlurEvent called without event),
      // auto-select the whole text if requested.
      if (autoSelect && !event) {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(editable);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }
    });
  };

  const temporarilyDisableSubmit = () => {
    editable.onblur = null;
    window.addEventListener("pointerup", bindBlurEvent);
    // handle edge-case where pointerup doesn't fire e.g. due to user
    // alt-tabbing away
    window.addEventListener("blur", handleSubmit);
  };

  // prevent blur when changing properties from the menu
  const onPointerDown = (event: MouseEvent) => {
    const target = event?.target;

    // panning canvas
    if (event.button === POINTER_BUTTON.WHEEL) {
      // trying to pan by clicking inside text area itself -> handle here
      if (
        target === editable ||
        (target instanceof Node && editable.contains(target))
      ) {
        event.preventDefault();
        app.handleCanvasPanUsingWheelOrSpaceDrag(event);
      }

      temporarilyDisableSubmit();
      return;
    }

    const isPropertiesTrigger =
      target instanceof HTMLElement &&
      target.classList.contains("properties-trigger");
    const isPropertiesContent =
      (target instanceof HTMLElement || target instanceof SVGElement) &&
      !!(target as Element).closest(".properties-content");

    if (
      ((event.target instanceof HTMLElement ||
        event.target instanceof SVGElement) &&
        (event.target.closest(
          `.${CLASSES.SHAPE_ACTIONS_MENU}, .${CLASSES.ZOOM_ACTIONS}`,
        ) ||
          event.target.closest(".compact-shape-actions-island")) &&
        !isWritableElement(event.target)) ||
      isPropertiesTrigger ||
      isPropertiesContent
    ) {
      temporarilyDisableSubmit();
      // Prevent the canvas-level pointerdown handler from seeing this event,
      // which would otherwise close openPopup (including compactTextProperties)
      // even though we're interacting with the properties popover content.
      event.stopPropagation();
    } else if (
      event.target instanceof HTMLCanvasElement &&
      // Vitest simply ignores stopPropagation, capture-mode, or rAF
      // so without introducing crazier hacks, nothing we can do
      !isTestEnv()
    ) {
      // On mobile, blur event doesn't seem to always fire correctly,
      // so we want to also submit on pointerdown outside the wysiwyg.
      // Done in the next frame to prevent pointerdown from creating a new text
      // immediately (if tools locked) so that users on mobile have chance
      // to submit first (to hide virtual keyboard).
      // Note: revisit if we want to differ this behavior on Desktop
      requestAnimationFrame(() => {
        handleSubmit();
      });
    }
  };

  // handle updates of textElement properties of editing element
  const unbindUpdate = app.scene.onUpdate(() => {
    if (!isInputting) {
      syncExternalEditorHistory();
    }
    updateWysiwygStyle();
    const isPopupOpened = !!document.activeElement?.closest(
      ".properties-content",
    );
    if (!isPopupOpened) {
      editable.focus();
    }
  });

  const unbindOnScroll = app.onScrollChangeEmitter.on(() => {
    updateWysiwygStyle();
  });

  // ---------------------------------------------------------------------------

  let isDestroyed = false;
  bindBlurEvent();

  // reposition wysiwyg in case of canvas is resized. Using ResizeObserver
  // is preferred so we catch changes from host, where window may not resize.
  let observer: ResizeObserver | null = null;
  if (canvas && "ResizeObserver" in window) {
    observer = new window.ResizeObserver(() => {
      updateWysiwygStyle();
    });
    observer.observe(canvas);
  } else {
    window.addEventListener("resize", updateWysiwygStyle);
  }

  editable.onpointerdown = (event) => event.stopPropagation();

  // rAF (+ capture to by doubly sure) so we don't catch te pointerdown that
  // triggered the wysiwyg
  requestAnimationFrame(() => {
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
  });
  window.addEventListener("beforeunload", handleSubmit);
  excalidrawContainer
    ?.querySelector(".excalidraw-textEditorContainer")!
    .appendChild(editable);

  return handleSubmit;
};
