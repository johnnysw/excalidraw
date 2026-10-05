import type React from "react";
import {
  isMindmapComposing,
  resolveMindmapKeyboardDecision,
} from "@excalidraw/mindmap";
import type { MindmapLabelStyle } from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { resolveMindmapEditorStyle } from "./mindmapEditorStyle";

interface MindmapEditorKeyboardOptions {
  event: React.KeyboardEvent<HTMLTextAreaElement>;
  controller: CoursewareMindmapController;
  field: "label" | "summary";
  style: React.CSSProperties;
  composing: boolean;
  finish: (save: boolean) => void;
  format: (patch: MindmapLabelStyle) => void;
  navigateHistory: (forward: boolean) => void;
}

export function handleMindmapEditorKeyDown({
  event,
  controller,
  field,
  style,
  composing,
  finish,
  format,
  navigateHistory,
}: MindmapEditorKeyboardOptions) {
  event.stopPropagation();
  if (isMindmapComposing(event.nativeEvent, composing)) return;
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (modifier && ["z", "y"].includes(key) && controller.editSession) {
    event.preventDefault();
    navigateHistory(event.shiftKey || key === "y");
    return;
  }
  if (modifier && ["b", "i", "u"].includes(key)) {
    event.preventDefault();
    const property =
      key === "b" ? "bold" : key === "i" ? "italic" : "underline";
    format({
      [property]: !resolveMindmapEditorStyle(controller.editSession, style)[
        property
      ],
    });
    return;
  }
  const decision = resolveMindmapKeyboardDecision({
    key: event.key,
    shiftKey: event.shiftKey,
    editing: field,
    isRoot: !controller.node?.parentId,
  });
  if (decision === "cancel") {
    event.preventDefault();
    finish(false);
  } else if (
    decision === "commit" ||
    decision === "commit-add-child" ||
    decision === "commit-add-parent"
  ) {
    event.preventDefault();
    finish(true);
    if (decision === "commit-add-child" || decision === "commit-add-parent") {
      controller.add(decision === "commit-add-child" ? "child" : "parent");
    }
  }
}
