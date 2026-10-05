import React from "react";
import { resolveMindmapTextLayout } from "@excalidraw/mindmap";
import type {
  MindmapLabelStyle,
  MindmapLabelStyleRange,
  WhiteboardMindmapNode,
} from "@excalidraw/mindmap";
import { Tooltip } from "../Tooltip";
export const MindmapTextEditorDecoration = ({
  field,
  node,
  value,
  ranges,
  style,
  typingStyle,
  onFormat,
}: {
  field: "label" | "summary";
  node: WhiteboardMindmapNode;
  value: string;
  ranges: MindmapLabelStyleRange[];
  style: React.CSSProperties;
  typingStyle: MindmapLabelStyle;
  onFormat: (patch: MindmapLabelStyle) => void;
}) => {
  const fontSize = Number(style.fontSize) || 14;
  const rich = field === "label" && ranges.length > 0;
  const textLayout = resolveMindmapTextLayout(
    {
      ...node,
      label: value,
      labelStyleRanges: ranges,
      color: String(style.color ?? node.color),
      fontWeight:
        style.fontWeight === "bold" || Number(style.fontWeight) >= 600
          ? "bold"
          : "normal",
      fontStyle: style.fontStyle === "italic" ? "italic" : "normal",
      textDecoration:
        style.textDecoration as WhiteboardMindmapNode["textDecoration"],
    },
    fontSize,
    { maxWidth: Math.max(1, (Number(style.width) || 320) - 8) },
  );
  const color = String(style.color ?? "#172033");
  return (
    <>
      {field === "label" && (
        <div
          className="Courseware-mindmap-editor-format"
          role="toolbar"
          aria-label="主题文字格式"
          style={{
            left: Number(style.left) || 0,
            top: Math.max(8, (Number(style.top) || 0) - 42),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {(
            [
              { key: "bold", label: "粗体", text: "B" },
              { key: "strikethrough", label: "删除线", text: "S" },
              { key: "italic", label: "斜体", text: "I" },
              { key: "underline", label: "下划线", text: "U" },
            ] as const
          ).map((item) => (
            <Tooltip key={item.key} label={item.label} position="top">
              <button
                type="button"
                aria-label={`选区${item.label}`}
                aria-pressed={!!typingStyle[item.key]}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onFormat({ [item.key]: !typingStyle[item.key] })}
              >
                {item.text}
              </button>
            </Tooltip>
          ))}
          <label aria-label="选区文字颜色">
            <input
              aria-label="选区文字颜色"
              type="color"
              value={
                /^#[0-9a-f]{6}$/i.test(typingStyle.color ?? color)
                  ? (typingStyle.color ?? color)
                  : "#172033"
              }
              onChange={(event) => onFormat({ color: event.target.value })}
            />
          </label>
        </div>
      )}
      {rich && (
        <div
          className="Courseware-mindmap-text-mirror"
          aria-hidden="true"
          style={{ ...style, padding: 4 }}
        >
          {textLayout.runs.map((run, index) => (
            <span
              key={index}
              style={{
                position: "absolute",
                left: 4 + run.x,
                top: 4 + run.y,
                color: run.style.color ?? color,
                fontWeight: run.style.bold ? "bold" : "normal",
                fontStyle: run.style.italic ? "italic" : "normal",
                textDecoration:
                  [
                    run.style.underline ? "underline" : "",
                    run.style.strikethrough ? "line-through" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || "none",
                whiteSpace: "pre",
                lineHeight: `${textLayout.lineHeight}px`,
              }}
            >
              {run.text}
            </span>
          ))}
        </div>
      )}
    </>
  );
};
