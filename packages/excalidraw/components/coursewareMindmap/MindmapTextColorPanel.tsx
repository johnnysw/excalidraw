import React from "react";

import type { WhiteboardMindmapNode } from "@excalidraw/mindmap";

import { Tooltip } from "../Tooltip";
import {
  MINDMAP_FILL_COLORS,
  MINDMAP_TEXT_COLORS,
} from "./mindmapPanelOptions";

export const MindmapTextColorPanel = ({
  color: selectedColor,
  fill: selectedFill,
  patch,
}: {
  color: string;
  fill: string;
  patch: (patch: Partial<WhiteboardMindmapNode>) => void;
}) => {
  return (
    <div className="Courseware-mindmap-text-color-panel">
      <div className="Courseware-mindmap-style-panel-title">文字颜色</div>
      <div
        className="Courseware-mindmap-text-color-palette"
        role="listbox"
        aria-label="文字颜色"
      >
        {MINDMAP_TEXT_COLORS.map((color) => (
          <Tooltip key={color} label={color}>
            <button
              type="button"
              role="option"
              aria-label={`文字颜色 ${color}`}
              aria-selected={selectedColor === color}
              className={selectedColor === color ? "is-active" : ""}
              onClick={() => patch({ color })}
            >
              <span style={{ color }}>A</span>
            </button>
          </Tooltip>
        ))}
      </div>
      <div className="Courseware-mindmap-style-panel-title">背景颜色</div>
      <div
        className="Courseware-mindmap-color-palette"
        role="listbox"
        aria-label="背景颜色"
      >
        {MINDMAP_FILL_COLORS.map((fill) => (
          <Tooltip key={fill} label={fill}>
            <button
              type="button"
              role="option"
              aria-label={`背景颜色 ${fill}`}
              aria-selected={selectedFill === fill}
              className={selectedFill === fill ? "is-active" : ""}
              onClick={() => patch({ fill })}
            >
              <span style={{ background: fill }} />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};
