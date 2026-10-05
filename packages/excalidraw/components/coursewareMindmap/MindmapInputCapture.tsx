import React, { useEffect, useRef } from "react";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
/** Receives real text input for a selected node, including IME and alternate keyboard layouts. */
export const MindmapInputCapture = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false);
  const selected = controller.getSnapshot().selection;
  useEffect(() => {
    const input = ref.current;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== input &&
      active.closest("input,textarea,[contenteditable=true],[role=tree]")
    )
      return;
    if (input && !controller.getSnapshot().editing && controller.editable)
      input.focus({ preventScroll: true });
  }, [selected, controller]);
  if (!controller.editable || !selected || controller.getSnapshot().editing)
    return null;
  return (
    <textarea
      ref={ref}
      data-mindmap-input-capture
      aria-hidden="true"
      tabIndex={-1}
      className="Courseware-mindmap-input-capture"
      defaultValue=""
      onBeforeInput={(event) => {
        event.stopPropagation();
        if (!composing.current)
          controller.beforeInput(event.nativeEvent as InputEvent);
      }}
      onInput={(event) => {
        if (
          !composing.current &&
          event.currentTarget.value &&
          !controller.getSnapshot().editing
        )
          controller.startEditing("label", event.currentTarget.value);
      }}
      onCompositionStart={(event) => {
        event.stopPropagation();
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        event.stopPropagation();
        composing.current = false;
        const value = event.currentTarget.value || event.data;
        if (value) controller.startEditing("label", value);
      }}
      onCopy={(event) => {
        event.stopPropagation();
        controller.clipboard.copy(event.nativeEvent);
      }}
      onCut={(event) => {
        event.stopPropagation();
        controller.clipboard.copy(event.nativeEvent, true);
      }}
      onPaste={(event) => {
        event.stopPropagation();
        event.preventDefault();
        controller.app.focusContainer();
        void controller.app.pasteFromClipboard(
          Object.assign(event.nativeEvent, { fromMindmapMenu: true }),
        );
      }}
      onKeyDown={(event) => {
        if (
          composing.current ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229
        ) {
          event.stopPropagation();
          return;
        }
        if (controller.keyDown(event)) {
          event.stopPropagation();
          return;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          ["c", "x", "v"].includes(event.key.toLowerCase())
        ) {
          event.stopPropagation();
          return;
        }
        if (
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.key.startsWith("Arrow") ||
          event.key === "Escape"
        ) {
          event.preventDefault();
          event.stopPropagation();
          const container = event.currentTarget.closest(".excalidraw");
          container?.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: event.key,
              code: event.code,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }}
    />
  );
};
