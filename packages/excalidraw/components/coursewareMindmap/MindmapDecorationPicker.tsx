import React, { useState } from "react";
import { Icon } from "@iconify/react";

import type { WhiteboardMindmapNode } from "@excalidraw/mindmap";

import { Tooltip } from "../Tooltip";
import {
  MINDMAP_NODE_ICONS,
  MINDMAP_NODE_STICKERS,
} from "./mindmapPanelOptions";

export const MindmapDecorationPicker = ({
  node,
  patch,
  onBack,
}: {
  node: WhiteboardMindmapNode;
  patch: (patch: Partial<WhiteboardMindmapNode>) => void;
  onBack: () => void;
}) => {
  const [query, setQuery] = useState("");
  return (
    <div className="Courseware-mindmap-decoration-picker">
      <div className="Courseware-mindmap-decoration-header">
        <button type="button" aria-label="返回添加内容" onClick={onBack}>
          <Icon icon="lucide:chevron-left" />
        </button>
        <strong>图标或贴纸</strong>
      </div>
      <label className="Courseware-mindmap-decoration-search">
        <Icon icon="lucide:search" />
        <input
          type="search"
          aria-label="搜索节点图标和贴纸"
          value={query}
          placeholder="搜索"
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </label>
      <div className="Courseware-mindmap-decoration-scroll">
        <section>
          <span>图标</span>
          <div role="radiogroup" aria-label="节点图标">
            <Tooltip label="无图标">
              <button
                type="button"
                role="radio"
                aria-label="无图标"
                aria-checked={!node.icon && !node.sticker}
                className={!node.icon && !node.sticker ? "is-active" : ""}
                onClick={() => patch({ icon: undefined, sticker: undefined })}
              >
                <Icon icon="lucide:ban" />
              </button>
            </Tooltip>
            {MINDMAP_NODE_ICONS.filter((item) =>
              item.label.includes(query.trim()),
            ).map((item) => (
              <Tooltip key={item.value} label={item.label}>
                <button
                  type="button"
                  role="radio"
                  aria-label={item.label}
                  aria-checked={node.icon === item.value}
                  className={node.icon === item.value ? "is-active" : ""}
                  onClick={() =>
                    patch({ icon: item.value, sticker: undefined })
                  }
                >
                  <Icon icon={item.value} />
                </button>
              </Tooltip>
            ))}
          </div>
        </section>
        <section>
          <span>贴纸</span>
          <div role="radiogroup" aria-label="节点贴纸">
            {MINDMAP_NODE_STICKERS.filter((sticker) =>
              sticker.includes(query.trim()),
            ).map((sticker) => (
              <Tooltip key={sticker} label={`贴纸 ${sticker}`}>
                <button
                  type="button"
                  role="radio"
                  aria-label={`贴纸 ${sticker}`}
                  aria-checked={node.sticker === sticker}
                  className={node.sticker === sticker ? "is-active" : ""}
                  onClick={() => patch({ icon: undefined, sticker })}
                >
                  <span>{sticker}</span>
                </button>
              </Tooltip>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
