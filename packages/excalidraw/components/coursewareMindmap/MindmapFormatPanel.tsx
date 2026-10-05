import React from "react";
import { Icon } from "@iconify/react";

import type { WhiteboardMindmapNode } from "@excalidraw/mindmap";

import { Tooltip } from "../Tooltip";

const FORMATS = [
  {
    key: "fontWeight",
    value: "bold",
    fallback: "normal",
    label: "粗体",
    icon: "lucide:bold",
  },
  {
    key: "textDecoration",
    value: "line-through",
    fallback: "none",
    label: "删除线",
    icon: "lucide:strikethrough",
  },
  {
    key: "fontStyle",
    value: "italic",
    fallback: "normal",
    label: "斜体",
    icon: "lucide:italic",
  },
  {
    key: "textDecoration",
    value: "underline",
    fallback: "none",
    label: "下划线",
    icon: "lucide:underline",
  },
] as const;
const ALIGNMENTS = [
  ["left", "左对齐", "lucide:align-left"],
  ["center", "居中对齐", "lucide:align-center"],
  ["right", "右对齐", "lucide:align-right"],
] as const;

export const MindmapFormatPanel = ({
  node,
  patch,
}: {
  node: WhiteboardMindmapNode;
  patch: (patch: Partial<WhiteboardMindmapNode>) => void;
}) => (
  <div className="Courseware-mindmap-format-popover">
    <div
      className="Courseware-mindmap-choice-row"
      role="group"
      aria-label="节点文本样式"
    >
      {FORMATS.map((item) => (
        <Tooltip key={item.label} label={item.label}>
          <button
            type="button"
            className={node[item.key] === item.value ? "is-active" : ""}
            aria-label={item.label}
            aria-pressed={node[item.key] === item.value}
            onClick={() =>
              patch({
                [item.key]:
                  node[item.key] === item.value ? item.fallback : item.value,
              })
            }
          >
            <Icon icon={item.icon} />
          </button>
        </Tooltip>
      ))}
    </div>
    <div
      className="Courseware-mindmap-choice-row"
      role="radiogroup"
      aria-label="节点文字对齐"
    >
      {ALIGNMENTS.map(([align, label, icon]) => (
        <Tooltip key={align} label={label}>
          <button
            type="button"
            role="radio"
            aria-checked={(node.align ?? "center") === align}
            className={(node.align ?? "center") === align ? "is-active" : ""}
            aria-label={label}
            onClick={() => patch({ align })}
          >
            <Icon icon={icon} />
          </button>
        </Tooltip>
      ))}
    </div>
  </div>
);
