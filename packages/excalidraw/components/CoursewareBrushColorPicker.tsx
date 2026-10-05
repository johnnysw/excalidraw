import React from "react";

import { COURSEWARE_BRUSH_COLORS } from "../coursewareBrush";

export const CoursewareBrushColorPicker = ({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string, close: boolean) => void;
}) => (
  <div
    className="Courseware-brush-color-grid"
    role="group"
    aria-label="画笔颜色"
  >
    {COURSEWARE_BRUSH_COLORS.map((preset) => (
      <button
        key={preset}
        type="button"
        className="Courseware-brush-swatch"
        aria-label={preset}
        aria-pressed={color.toLowerCase() === preset.toLowerCase()}
        onClick={() => onChange(preset, true)}
      >
        <span style={{ backgroundColor: preset }} />
      </button>
    ))}
    <label className="Courseware-brush-swatch Courseware-brush-custom">
      <span aria-hidden="true" />
      <input
        type="color"
        value={color}
        aria-label="自定义画笔颜色"
        onChange={(event) => onChange(event.currentTarget.value, false)}
      />
    </label>
  </div>
);
