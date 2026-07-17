import { useState, useCallback } from "react";

import {
  getContentEditableSelectionOffsets,
  restoreContentEditableSelection,
} from "../wysiwyg/textWysiwyg";

// Utility type for caret position
export type CaretPosition = {
  start: number;
  end: number;
  direction: "forward" | "backward";
};

// Utility function to get text editor element
const getTextEditor = () =>
  document.querySelector<HTMLElement>(".excalidraw-wysiwyg");

// Utility functions for caret position management
export const saveCaretPosition = (): CaretPosition | null => {
  const textEditor = getTextEditor();
  const selection = window.getSelection();
  if (!textEditor || !selection || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !textEditor.contains(range.startContainer) ||
    !textEditor.contains(range.endContainer)
  ) {
    return null;
  }
  const offsets = getContentEditableSelectionOffsets(textEditor, range);
  if (!offsets) {
    return null;
  }
  const direction =
    selection.anchorNode === range.endContainer &&
    selection.anchorOffset === range.endOffset &&
    !range.collapsed
      ? "backward"
      : "forward";
  return { ...offsets, direction };
};

export const restoreCaretPosition = (position: CaretPosition | null): void => {
  setTimeout(() => {
    const textEditor = getTextEditor();
    if (textEditor) {
      textEditor.focus();
      if (position) {
        restoreContentEditableSelection(
          textEditor,
          position.start,
          position.end,
          undefined,
          position.direction,
        );
      }
    }
  }, 0);
};

export const withCaretPositionPreservation = (
  callback: () => void,
  isCompactMode: boolean,
  isEditingText: boolean,
  onPreventClose?: () => void,
): void => {
  // Prevent popover from closing in compact mode
  if (isCompactMode && onPreventClose) {
    onPreventClose();
  }

  // Save caret position if editing text
  const savedPosition =
    isCompactMode && isEditingText ? saveCaretPosition() : null;

  // Execute the callback
  callback();

  // Restore caret position if needed
  if (isCompactMode && isEditingText) {
    restoreCaretPosition(savedPosition);
  }
};

// Hook for managing text editor caret position with state
export const useTextEditorFocus = () => {
  const [savedCaretPosition, setSavedCaretPosition] =
    useState<CaretPosition | null>(null);

  const saveCaretPositionToState = useCallback(() => {
    const position = saveCaretPosition();
    setSavedCaretPosition(position);
  }, []);

  const restoreCaretPositionFromState = useCallback(() => {
    setTimeout(() => {
      const textEditor = getTextEditor();
      if (textEditor) {
        textEditor.focus();
        if (savedCaretPosition) {
          restoreContentEditableSelection(
            textEditor,
            savedCaretPosition.start,
            savedCaretPosition.end,
            undefined,
            savedCaretPosition.direction,
          );
          setSavedCaretPosition(null);
        }
      }
    }, 0);
  }, [savedCaretPosition]);

  const clearSavedPosition = useCallback(() => {
    setSavedCaretPosition(null);
  }, []);

  return {
    saveCaretPosition: saveCaretPositionToState,
    restoreCaretPosition: restoreCaretPositionFromState,
    clearSavedPosition,
    hasSavedPosition: !!savedCaretPosition,
  };
};

// Utility function to temporarily disable text editor blur
export const temporarilyDisableTextEditorBlur = (
  duration: number = 100,
): void => {
  const textEditor = getTextEditor();
  if (textEditor) {
    const originalOnBlur = textEditor.onblur;
    textEditor.onblur = null;

    setTimeout(() => {
      textEditor.onblur = originalOnBlur;
    }, duration);
  }
};
