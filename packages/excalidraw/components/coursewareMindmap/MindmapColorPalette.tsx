import React, { useEffect, useRef } from "react";

import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

import { Tooltip } from "../Tooltip";
import { MINDMAP_FILL_COLORS } from "./mindmapPanelOptions";

interface MindmapColorPaletteProps {
  controller: CoursewareMindmapController;
  property: "fill" | "stroke";
  value: string;
  opacity?: number;
  label: string;
  colors?: readonly string[];
}

/** Palette gestures preview the node without creating a history entry per tick. */
export const MindmapColorPalette = ({
  controller,
  property,
  value,
  opacity,
  label,
  colors = MINDMAP_FILL_COLORS,
}: MindmapColorPaletteProps) => {
  const previewing = useRef(false);
  useEffect(
    () => () => {
      if (previewing.current) controller.previewPatch(null);
    },
    [controller],
  );
  const preview = (patch: Parameters<typeof controller.previewPatch>[0]) => {
    previewing.current = true;
    controller.previewPatch(patch);
  };
  const finish = (save = true) => {
    if (!previewing.current) return;
    previewing.current = false;
    if (save) controller.commitPreviewPatch();
    else controller.previewPatch(null);
  };
  const keyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  };
  return (
    <div className="Courseware-mindmap-style-panel">
      <div className="Courseware-mindmap-style-panel-title">{label}</div>
      <div
        className={`Courseware-mindmap-color-palette is-${property}`}
        role="listbox"
        aria-label={label}
      >
        {colors.map((color) => (
          <Tooltip label={color} key={color}>
            <button
              type="button"
              role="option"
              aria-selected={value.toLowerCase() === color}
              className={value.toLowerCase() === color ? "is-active" : ""}
              aria-label={color}
              onClick={() => controller.patch({ [property]: color })}
            >
              <span style={{ background: color }} />
            </button>
          </Tooltip>
        ))}
      </div>
      <label className="Courseware-mindmap-custom-color">
        <span>自定义颜色</span>
        <input
          type="color"
          aria-label={`${label}自定义颜色`}
          value={/^#[\da-f]{6}$/i.test(value) ? value : "#ffffff"}
          onChange={(event) =>
            preview({ [property]: event.currentTarget.value })
          }
          onBlur={() => finish()}
          onKeyDown={keyDown}
        />
      </label>
      {opacity !== undefined && (
        <label className="Courseware-mindmap-opacity-control">
          <span>不透明度</span>
          <input
            type="range"
            aria-label="节点不透明度"
            min={0}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={(event) =>
              preview({ opacity: Number(event.currentTarget.value) / 100 })
            }
            onPointerDown={(event) =>
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            onPointerUp={() => finish()}
            onPointerCancel={() => finish(false)}
            onBlur={() => finish()}
            onKeyDown={keyDown}
            onKeyUp={(event) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                  "PageUp",
                  "PageDown",
                ].includes(event.key)
              )
                finish();
            }}
          />
          <output>{Math.round(opacity * 100)}%</output>
        </label>
      )}
    </div>
  );
};
