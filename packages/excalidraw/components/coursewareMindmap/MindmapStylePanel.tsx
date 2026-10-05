import React from "react";
import { Icon } from "@iconify/react";
import {
  resolveMindmapNodeVisualStyle,
  resolveMindmapToolbarLogicalValue,
  scaleMindmapToolbarValue,
} from "@excalidraw/mindmap";
import {
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";

import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

import { Tooltip } from "../Tooltip";
import { MindmapColorPalette } from "./MindmapColorPalette";
import { MindmapContentPanel } from "./MindmapContentPanel";
import { MindmapFormatPanel } from "./MindmapFormatPanel";
import { MindmapTextColorPanel } from "./MindmapTextColorPanel";
import {
  MINDMAP_LINE_STYLES,
  MINDMAP_NODE_SHAPES,
  MINDMAP_STROKE_COLORS,
  MINDMAP_STROKE_WIDTHS,
} from "./mindmapPanelOptions";

export const MindmapStylePanel = ({
  controller,
  section,
  onClose,
}: {
  controller: CoursewareMindmapController;
  section: "shape" | "fill" | "stroke" | "color" | "format" | "content";
  onClose?: () => void;
}) => {
  const { preview, selection } = controller.getSnapshot();
  const element = preview ?? controller.element;
  const model = element ? getCoursewareMindmap(element) : null;
  const node = model && selection ? model.nodes[selection.nodeId] : null;
  if (!node || !model || !element) return null;
  const style = resolveMindmapNodeVisualStyle(
    node,
    getCoursewareMindmapGeometry(element)?.nodes[node.id]?.depth ?? 0,
    model,
  );
  const patch = controller.patch.bind(controller);
  if (section === "content")
    return <MindmapContentPanel controller={controller} onClose={onClose} />;
  if (section === "format")
    return <MindmapFormatPanel node={node} patch={patch} />;
  if (section === "shape")
    return (
      <div className="Courseware-mindmap-tool-flyout">
        <div className="Courseware-mindmap-tool-flyout-title">节点形状</div>
        <div
          className="Courseware-mindmap-choice-row"
          role="radiogroup"
          aria-label="节点形状"
        >
          {MINDMAP_NODE_SHAPES.map(([shape, label, icon]) => (
            <Tooltip key={shape} label={label}>
              <button
                type="button"
                role="radio"
                aria-label={label}
                aria-checked={style.shape === shape}
                className={style.shape === shape ? "is-active" : ""}
                onClick={() => patch({ shape })}
              >
                <Icon icon={icon} />
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    );
  if (section === "fill")
    return (
      <MindmapColorPalette
        controller={controller}
        property="fill"
        value={style.fill}
        opacity={node.opacity ?? 1}
        label="节点填充"
      />
    );
  if (section === "stroke")
    return (
      <div className="Courseware-mindmap-style-panel">
        <div className="Courseware-mindmap-style-panel-title">节点描边</div>
        <div
          className="Courseware-mindmap-choice-row"
          role="radiogroup"
          aria-label="节点描边粗细"
        >
          {MINDMAP_STROKE_WIDTHS.map((strokeWidth) => {
            const selected =
              resolveMindmapToolbarLogicalValue(
                style.strokeWidth,
                model.layoutScale,
                1,
              ) === strokeWidth;
            return (
              <Tooltip key={strokeWidth} label={`${strokeWidth} 像素`}>
                <button
                  type="button"
                  role="radio"
                  aria-label={`${strokeWidth} 像素`}
                  aria-checked={selected}
                  className={selected ? "is-active" : ""}
                  onClick={() =>
                    patch({
                      strokeWidth: scaleMindmapToolbarValue(
                        strokeWidth,
                        model.layoutScale,
                      ),
                    })
                  }
                >
                  <span
                    className="Courseware-mindmap-stroke-width-preview"
                    style={{ height: strokeWidth }}
                  />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div
          className="Courseware-mindmap-choice-row"
          role="radiogroup"
          aria-label="节点描边线型"
        >
          {MINDMAP_LINE_STYLES.map(({ value, label }) => (
            <Tooltip key={value} label={label}>
              <button
                type="button"
                role="radio"
                aria-label={label}
                aria-checked={style.lineStyle === value}
                className={style.lineStyle === value ? "is-active" : ""}
                onClick={() => patch({ lineStyle: value })}
              >
                <span
                  className={`Courseware-mindmap-line-preview is-${value}`}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>
          ))}
        </div>
        <MindmapColorPalette
          controller={controller}
          property="stroke"
          value={style.stroke}
          label="节点描边颜色"
          colors={MINDMAP_STROKE_COLORS}
        />
      </div>
    );
  return (
    <MindmapTextColorPanel
      color={style.color}
      fill={style.fill}
      patch={patch}
    />
  );
};
