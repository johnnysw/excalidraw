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
  originalContainerCache,
  updateOriginalContainerCache,
} from "@excalidraw/element";

import { LinearElementEditor } from "@excalidraw/element";
import { bumpVersion } from "@excalidraw/element";
import {
  getBoundTextElementId,
  getContainerElement,
  getTextElementAngle,
  redrawTextBoundingBox,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  computeContainerDimensionForBoundText,
  computeBoundTextPosition,
  getBoundTextElement,
} from "@excalidraw/element";
import { getTextWidth } from "@excalidraw/element";
import { normalizeText } from "@excalidraw/element";
import { wrapText } from "@excalidraw/element";
import {
  isArrowElement,
  isBoundToContainer,
  isTextElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  ExcalidrawTextElementWithContainer,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import { actionSaveToActiveFile } from "../actions";

import { parseDataTransferEvent } from "../clipboard";
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

// Undo/Redo state type for text editing
type TextUndoState = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
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
  let currentSelection: { start: number; end: number } | null = null;
  let isInputting = false;
  let isComposing = false;

  // Custom undo/redo stacks for text editing
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

      // Calculate the maximum font size from textStyleRanges for proper line-height
      let maxFontSize = updatedTextElement.fontSize;
      if (updatedTextElement.textStyleRanges?.length) {
        for (const range of updatedTextElement.textStyleRanges) {
          if (range.fontSize != null && range.fontSize > maxFontSize) {
            maxFontSize = range.fontSize;
          }
        }
      }
      // Use pixel-based line-height when there are mixed font sizes
      const effectiveLineHeight =
        maxFontSize > updatedTextElement.fontSize
          ? `${maxFontSize * updatedTextElement.lineHeight}px`
          : updatedTextElement.lineHeight;

      // Make sure text editor height doesn't go beyond viewport
      const editorMaxHeight =
        (appState.height - viewportY) / appState.zoom.value;
      Object.assign(editable.style, {
        font,
        // must be defined *after* font ¯\_(ツ)_/¯
        lineHeight: effectiveLineHeight,
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

  const renderStyledTextFromElement = (
    textElement: ExcalidrawTextElement,
  ) => {
    const text = textElement.originalText || "";

    // Colors are still driven by richTextRanges for backward compatibility.
    const colorRanges = textElement.richTextRanges || [];
    // textStyleRanges carries fontSize / fontFamily (and may also carry color).
    const styleRanges = textElement.textStyleRanges || [];

    const getColorForIndex = (index: number): string => {
      for (let i = 0; i < colorRanges.length; i++) {
        const range = colorRanges[i];
        if (index >= range.start && index < range.end && range.color) {
          return range.color;
        }
      }
      return textElement.strokeColor;
    };

    const getFontSizeForIndex = (index: number): number => {
      let size = textElement.fontSize;
      for (let i = 0; i < styleRanges.length; i++) {
        const range = styleRanges[i];
        if (
          index >= range.start &&
          index < range.end &&
          range.fontSize != null
        ) {
          size = range.fontSize;
        }
      }
      return size;
    };

    const getFontFamilyForIndex = (index: number): number => {
      let fontFamily = textElement.fontFamily;
      for (let i = 0; i < styleRanges.length; i++) {
        const range = styleRanges[i];
        if (
          index >= range.start &&
          index < range.end &&
          range.fontFamily != null
        ) {
          fontFamily = range.fontFamily;
        }
      }
      return fontFamily;
    };

    const getTextOutlineWidthForIndex = (index: number): number => {
      let width = textElement.textOutlineWidth;
      for (let i = 0; i < styleRanges.length; i++) {
        const range = styleRanges[i];
        if (
          index >= range.start &&
          index < range.end &&
          range.textOutlineWidth != null
        ) {
          width = range.textOutlineWidth;
        }
      }
      return width;
    };

    const getTextOutlineColorForIndex = (index: number): string => {
      let color = textElement.textOutlineColor;
      for (let i = 0; i < styleRanges.length; i++) {
        const range = styleRanges[i];
        if (
          index >= range.start &&
          index < range.end &&
          range.textOutlineColor != null
        ) {
          color = range.textOutlineColor;
        }
      }
      return color;
    };

    editable.innerHTML = "";

    if (!text.length) {
      return;
    }

    const getStyleForIndex = (index: number) => {
      return {
        color: getColorForIndex(index),
        fontSize: getFontSizeForIndex(index),
        fontFamily: getFontFamilyForIndex(index),
        textOutlineWidth: getTextOutlineWidthForIndex(index),
        textOutlineColor: getTextOutlineColorForIndex(index),
      };
    };

    let segmentStart = 0;
    let currentStyle = getStyleForIndex(0);

    for (let index = 0; index <= text.length; index++) {
      const nextStyle =
        index < text.length ? getStyleForIndex(index) : null;

      const styleChanged =
        nextStyle &&
        (nextStyle.color !== currentStyle.color ||
          nextStyle.fontSize !== currentStyle.fontSize ||
          nextStyle.fontFamily !== currentStyle.fontFamily ||
          nextStyle.textOutlineWidth !== currentStyle.textOutlineWidth ||
          nextStyle.textOutlineColor !== currentStyle.textOutlineColor);

      if (index === text.length || styleChanged) {
        if (index > segmentStart) {
          const span = document.createElement("span");
          span.textContent = text.slice(segmentStart, index);

          span.style.color = currentStyle.color;
          span.style.fontSize = `${currentStyle.fontSize}px`;
          span.style.fontFamily = getFontFamilyString({
            fontFamily: currentStyle.fontFamily,
          });
          // Set line-height for each span to prevent text clipping when font size differs
          span.style.lineHeight = `${textElement.lineHeight}`;
          // Use baseline alignment to match canvas rendering (alphabetic baseline)
          span.style.verticalAlign = "baseline";

          const spanStyleAny = span.style as any;
          spanStyleAny.webkitTextStrokeWidth = `${currentStyle.textOutlineWidth}px`;
          spanStyleAny.webkitTextStrokeColor = currentStyle.textOutlineColor;

          editable.appendChild(span);
        }
        segmentStart = index;
        if (nextStyle) {
          currentStyle = nextStyle;
        }
      }
    }
  };

  editable.innerText = element.originalText;
  updateWysiwygStyle();

  if (onChange) {
    editable.onpaste = async (event) => {
      const textItem = (await parseDataTransferEvent(event)).findByType(
        MIME_TYPES.text,
      );
      if (!textItem) {
        return;
      }
      const text = normalizeText(textItem.value);
      if (!text) {
        return;
      }
      const container = getContainerElement(
        element,
        app.scene.getNonDeletedElementsMap(),
      );

      const font = getFontString({
        fontSize: app.state.currentItemFontSize,
        fontFamily: app.state.currentItemFontFamily,
      });
      if (container) {
        const boundTextElement = getBoundTextElement(
          container,
          app.scene.getNonDeletedElementsMap(),
        );
        const currentText = editable.innerText || "";
        const wrappedText = wrapText(
          `${currentText}${text}`,
          font,
          getBoundTextMaxWidth(container, boundTextElement),
        );
        const width = getTextWidth(wrappedText, font);
        editable.style.width = `${width}px`;
      }
    };

    editable.oninput = () => {
      isInputting = true;
      updateTextEditorSelection();
      const raw = editable.innerText || "";
      const normalized = normalizeText(raw);

      // Only save undo state when NOT composing (IME input)
      // For IME input, we save the state in compositionend event
      if (!isComposing && normalized !== lastSavedText) {
        undoStack.push({
          text: lastSavedText,
          selectionStart: currentSelection?.start ?? 0,
          selectionEnd: currentSelection?.end ?? 0,
        });
        // Clear redo stack when new input occurs
        redoStack.length = 0;
        lastSavedText = normalized;
      }

      onChange(normalized);
      isInputting = false;
    };
  }

  // Helper to get current selection offsets
  const getSelectionOffsets = (): { start: number; end: number } => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { start: 0, end: 0 };
    }
    const range = selection.getRangeAt(0);
    if (!editable.contains(range.startContainer)) {
      return { start: 0, end: 0 };
    }

    let start = 0;
    let end = 0;
    let currentLength = 0;
    let foundStart = false;
    let foundEnd = false;

    const traverse = (node: Node) => {
      if (foundStart && foundEnd) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const textLen = (node.textContent || "").length;
        if (!foundStart && range.startContainer === node) {
          start = currentLength + range.startOffset;
          foundStart = true;
        }
        if (!foundEnd && range.endContainer === node) {
          end = currentLength + range.endOffset;
          foundEnd = true;
        }
        currentLength += textLen;
      } else {
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }
      }
    };
    traverse(editable);
    return { start, end };
  };

  // Helper to restore selection by offset
  const restoreSelectionByOffset = (start: number, end: number) => {
    const selection = window.getSelection();
    if (!selection) return;

    let currentLength = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;

    const traverse = (node: Node) => {
      if (startNode && endNode) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const textLen = (node.textContent || "").length;
        if (!startNode && currentLength + textLen >= start) {
          startNode = node;
          startOffset = start - currentLength;
        }
        if (!endNode && currentLength + textLen >= end) {
          endNode = node;
          endOffset = end - currentLength;
        }
        currentLength += textLen;
      } else {
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }
      }
    };
    traverse(editable);

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, Math.min(startOffset, (startNode.textContent || "").length));
      range.setEnd(endNode, Math.min(endOffset, (endNode.textContent || "").length));
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  // Undo function
  const performUndo = () => {
    if (undoStack.length === 0) return;

    const currentState: TextUndoState = {
      text: editable.innerText || "",
      selectionStart: getSelectionOffsets().start,
      selectionEnd: getSelectionOffsets().end,
    };
    redoStack.push(currentState);

    const prevState = undoStack.pop()!;
    lastSavedText = prevState.text;

    // Update the text element
    if (onChange) {
      onChange(prevState.text);
    }

    // Update editable content after onChange updates the element
    // Always place cursor at the end of restored text
    setTimeout(() => {
      updateWysiwygStyle();
      const textLen = prevState.text.length;
      restoreSelectionByOffset(textLen, textLen);
    }, 0);
  };

  // Redo function
  const performRedo = () => {
    if (redoStack.length === 0) return;

    const currentState: TextUndoState = {
      text: editable.innerText || "",
      selectionStart: getSelectionOffsets().start,
      selectionEnd: getSelectionOffsets().end,
    };
    undoStack.push(currentState);

    const nextState = redoStack.pop()!;
    lastSavedText = nextState.text;

    // Update the text element
    if (onChange) {
      onChange(nextState.text);
    }

    // Update editable content after onChange updates the element
    // Always place cursor at the end of restored text
    setTimeout(() => {
      updateWysiwygStyle();
      const textLen = nextState.text.length;
      restoreSelectionByOffset(textLen, textLen);
    }, 0);
  };

  editable.onkeydown = (event) => {
    // Handle Undo (Ctrl+Z / Cmd+Z)
    if (event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      performUndo();
      return;
    }
    // Handle Redo (Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y)
    if (
      (event[KEYS.CTRL_OR_CMD] && event.key.toLowerCase() === "z" && event.shiftKey) ||
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
      } else if (event.shiftKey || event.code === CODES.BRACKET_LEFT) {
        outdent();
      } else {
        indent();
      }
      // We must send an input event to resize the element
      editable.dispatchEvent(new Event("input"));
    }
  };

  // Update text editor selection state for rich text functionality
  const updateTextEditorSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // Don't clear textEditorSelection here - preserve it for property panel actions
      return;
    }

    const range = selection.getRangeAt(0);

    if (
      !editable.contains(range.startContainer) ||
      !editable.contains(range.endContainer)
    ) {
      // Don't clear textEditorSelection here - preserve it for property panel actions
      return;
    }

    let start = -1;
    let end = -1;
    let currentLength = 0;

    // These elements behave like block elements, effectively adding a newline
    // when they appear after other content.
    const blockElements = new Set([
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

    const traverse = (node: Node) => {
      if (start !== -1 && end !== -1) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        if (range.startContainer === node) {
          start = currentLength + range.startOffset;
        }
        if (range.endContainer === node) {
          end = currentLength + range.endOffset;
        }
        currentLength += (node.textContent || "").length;
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
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        // If we are entering a block element and we already have content,
        // assume an implicit newline (matching innerText behavior).
        if (currentLength > 0 && blockElements.has(child.nodeName)) {
          currentLength += 1;
        }

        if (range.startContainer === node && range.startOffset === i) {
          start = currentLength;
        }
        if (range.endContainer === node && range.endOffset === i) {
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

    if (start === -1 || end === -1) {
      currentSelection = null;
      app.setState({ textEditorSelection: null });
      return;
    }

    currentSelection = { start, end };
    app.setState({ textEditorSelection: { start, end } });
  };

  function restoreSelectionFromAppState() {
    const sel = isInputting ? currentSelection : app.state.textEditorSelection;
    if (!sel) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const { start, end } = sel;
    let index = 0;

    const walker = document.createTreeWalker(
      editable,
      NodeFilter.SHOW_TEXT,
      null,
    );

    let node = walker.nextNode();
    let rangeStartNode: Node | null = null;
    let rangeEndNode: Node | null = null;
    let rangeStartOffset = 0;
    let rangeEndOffset = 0;

    while (node) {
      const text = node.textContent || "";
      const nextIndex = index + text.length;

      if (!rangeStartNode && start >= index && start <= nextIndex) {
        rangeStartNode = node;
        rangeStartOffset = start - index;
      }

      if (!rangeEndNode && end >= index && end <= nextIndex) {
        rangeEndNode = node;
        rangeEndOffset = end - index;
        break;
      }

      index = nextIndex;
      node = walker.nextNode();
    }

    if (!rangeStartNode || !rangeEndNode) {
      return;
    }

    const range = document.createRange();
    range.setStart(rangeStartNode, rangeStartOffset);
    range.setEnd(rangeEndNode, rangeEndOffset);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  editable.addEventListener("compositionstart", () => {
    isComposing = true;
  });

  editable.addEventListener("compositionend", () => {
    isComposing = false;
    // Save undo state after IME composition ends (e.g., after typing Chinese characters)
    const raw = editable.innerText || "";
    const normalized = normalizeText(raw);
    if (normalized !== lastSavedText) {
      undoStack.push({
        text: lastSavedText,
        selectionStart: currentSelection?.start ?? 0,
        selectionEnd: currentSelection?.end ?? 0,
      });
      redoStack.length = 0;
      lastSavedText = normalized;
    }
  });

  // Listen for selection changes
  editable.onselect = updateTextEditorSelection;
  editable.onmouseup = updateTextEditorSelection;
  editable.onkeyup = updateTextEditorSelection;

  const TAB_SIZE = 4;
  const TAB = " ".repeat(TAB_SIZE);
  const RE_LEADING_TAB = new RegExp(`^ {1,${TAB_SIZE}}`);

  // TODO: re-enable indent/outdent behavior for contenteditable editor.
  // For now we keep these as no-ops to avoid breaking keyboard shortcuts.
  const indent = () => {
    return;
  };

  const outdent = () => {
    return;
  };

  /**
   * @returns indices of start positions of selected lines.
   * Currently unused for contenteditable implementation.
   */
  const getSelectedLinesStartIndices = () => {
    return [] as number[];
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

    if (container) {
      if ((editable.innerText || "").trim()) {
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

    const finalText = normalizeText(editable.innerText || "");
    const collapsedFinalText = finalText.replace(/\n{2,}$/g, "\n");

    onSubmit({
      viaKeyboard: submittedViaKeyboard,
      nextOriginalText: collapsedFinalText,
    });
  };

  const cleanup = () => {
    // remove events to ensure they don't late-fire
    editable.onblur = null;
    editable.oninput = null;
    editable.onkeydown = null;
    editable.onselect = null;
    editable.onmouseup = null;
    editable.onkeyup = null;

    // Clear text editor selection state
    app.setState({ textEditorSelection: null });

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
      if (target instanceof HTMLTextAreaElement) {
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
      return;
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
