import type React from "react";
import {
  applyMindmapLabelStyle,
  parseMindmapHtmlText,
} from "@excalidraw/mindmap";
import type { MindmapEditSession } from "@excalidraw/mindmap";
export function applyMindmapEditorHtmlPaste(
  event: React.ClipboardEvent<HTMLTextAreaElement>,
  field: "label" | "summary",
  session: MindmapEditSession | null,
  remember: () => void,
  refresh: () => void,
) {
  if (field !== "label" || !session) return;
  const html = event.clipboardData.getData("text/html");
  if (!html) return;
  event.preventDefault();
  const parsed = parseMindmapHtmlText(html);
  const start = event.currentTarget.selectionStart,
    end = event.currentTarget.selectionEnd;
  session.replace(start, end, parsed.label);
  let next = session.labelStyleRanges;
  parsed.labelStyleRanges.forEach((range) => {
    next = applyMindmapLabelStyle(
      session.value,
      next,
      start + range.start,
      start + range.end,
      range,
    );
  });
  session.update(session.value, next);
  remember();
  refresh();
}
