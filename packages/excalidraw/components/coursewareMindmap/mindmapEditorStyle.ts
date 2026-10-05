import type React from "react";
import type {
  MindmapEditSession,
  MindmapLabelStyle,
} from "@excalidraw/mindmap";

const styleAtSelection = (session: MindmapEditSession): MindmapLabelStyle => {
  const offset =
    session.selection.start === session.selection.end
      ? Math.max(0, session.selection.start - 1)
      : session.selection.start;
  const range = session.labelStyleRanges.find(
    (item) => item.start <= offset && item.end > offset,
  );
  if (!range) return {};
  const { start, end, ...style } = range;
  return style;
};

export function updateMindmapEditorSelection(
  session: MindmapEditSession | null,
  start: number,
  end: number,
) {
  if (
    !session ||
    (session.selection.start === start && session.selection.end === end)
  )
    return;
  session.selection = { start, end };
  session.typingStyle = styleAtSelection(session);
}

/** Toolbar and shortcuts include inherited node styles at the current selection. */
export function resolveMindmapEditorStyle(
  session: MindmapEditSession | null,
  style: React.CSSProperties,
): MindmapLabelStyle {
  const base: MindmapLabelStyle = {
    color: String(style.color ?? "#172033"),
    bold: style.fontWeight === "bold" || Number(style.fontWeight) >= 600,
    italic: style.fontStyle === "italic",
    underline: String(style.textDecoration).includes("underline"),
    strikethrough: String(style.textDecoration).includes("line-through"),
  };
  if (!session) return base;
  return {
    ...base,
    ...styleAtSelection(session),
    ...(session.selection.start === session.selection.end
      ? session.typingStyle
      : {}),
  };
}
