import React from "react";
import {
  MINDMAP_LAYOUT_OPTIONS,
  MINDMAP_BRANCH_OPTIONS,
} from "../../coursewareMindmap/config";
import type { MindmapToolPreference } from "../../coursewareMindmap/config";
import { Tooltip } from "../Tooltip";
import right from "./assets/mindmap-layout-right.svg";
import left from "./assets/mindmap-layout-left.svg";
import down from "./assets/mindmap-layout-top-down.svg";
import both from "./assets/mindmap-layout-both.svg";
import treeRight from "./assets/tree-layout-right.svg";
import treeLeft from "./assets/tree-layout-left.svg";
import treeBoth from "./assets/tree-layout-both.svg";
import horizontal from "./assets/timeline-layout-horizontal.svg";
import vertical from "./assets/timeline-layout-vertical.svg";

const assets = [
  right,
  left,
  down,
  both,
  treeRight,
  treeLeft,
  treeBoth,
  horizontal,
  vertical,
];
export const MindmapIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 8a5 5 0 0 1 5-5 1 1 0 0 1 0 2 3 3 0 0 0-3 3v3h3a1 1 0 1 1 0 2H5v3a3 3 0 0 0 3 3 1 1 0 1 1 0 2 5 5 0 0 1-5-5v-3H1.5a1 1 0 1 1 0-2H3V8Zm9.5-5a1 1 0 1 0 0 2H22a1 1 0 1 0 0-2h-9.5Zm-1 9a1 1 0 0 1 1-1H22a1 1 0 1 1 0 2h-9.5a1 1 0 0 1-1-1Zm1 7a1 1 0 1 0 0 2H22a1 1 0 0 0 0-2h-9.5Z"
    />
  </svg>
);
interface Props {
  value: MindmapToolPreference;
  onChange: (value: MindmapToolPreference) => void;
  onPreview?: (value: MindmapToolPreference | null) => void;
}
export const MindmapLayoutPicker = ({ value, onChange, onPreview }: Props) => (
  <div
    className="Courseware-mindmap-layout"
    aria-label="脑图布局"
    onPointerLeave={() => onPreview?.(null)}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) onPreview?.(null);
    }}
  >
    {(["mindmap", "tree", "timeline"] as const).map((family) => (
      <section key={family} data-layout-family={family}>
        <h3>
          {{ mindmap: "思维导图", tree: "树状图", timeline: "时间线" }[family]}
        </h3>
        <div className="Courseware-mindmap-layout__grid">
          {MINDMAP_LAYOUT_OPTIONS.map(
            (option, index) =>
              option.family === family && (
                <Tooltip key={option.asset} label={option.label} position="top">
                  <button
                    type="button"
                    aria-label={option.label}
                    aria-pressed={
                      value.family === option.family &&
                      value.direction === option.direction
                    }
                    onPointerEnter={() =>
                      onPreview?.({
                        ...value,
                        family,
                        direction: option.direction,
                      })
                    }
                    onFocus={() =>
                      onPreview?.({
                        ...value,
                        family,
                        direction: option.direction,
                      })
                    }
                    onClick={() =>
                      onChange({
                        ...value,
                        family,
                        direction: option.direction,
                      })
                    }
                  >
                    <img src={assets[index]} alt="" />
                  </button>
                </Tooltip>
              ),
          )}
        </div>
      </section>
    ))}
    <section>
      <h3>分支样式</h3>
      <div className="Courseware-mindmap-layout__branches">
        {MINDMAP_BRANCH_OPTIONS.map((option) => (
          <Tooltip key={option.value} label={option.label} position="top">
            <button
              type="button"
              aria-label={option.label}
              aria-pressed={value.branchStyle === option.value}
              onPointerEnter={() =>
                onPreview?.({ ...value, branchStyle: option.value })
              }
              onClick={() => onChange({ ...value, branchStyle: option.value })}
            >
              <svg viewBox="0 0 26 18">
                <path
                  d={option.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </Tooltip>
        ))}
      </div>
    </section>
  </div>
);
