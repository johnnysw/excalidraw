import { COURSEWARE_STICKY_STYLE } from "./coursewareSticky";

import type { ExcalidrawElement } from "./types";

export const drawCoursewareSticky = (
  element: ExcalidrawElement,
  context: CanvasRenderingContext2D,
) => {
  const style = COURSEWARE_STICKY_STYLE;
  const transform = context.getTransform();
  const scale = Math.hypot(transform.a, transform.b) || 1;
  context.save();
  context.fillStyle = element.backgroundColor;
  context.shadowColor = "rgba(31, 35, 41, 0.16)";
  context.shadowBlur = style.shadowBlur * scale;
  context.shadowOffsetY = style.shadowOffsetY * scale;
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(0, 0, element.width, element.height, style.cornerRadius);
  } else {
    const radius = Math.min(style.cornerRadius, element.width / 2, element.height / 2);
    context.moveTo(radius, 0);
    context.arcTo(element.width, 0, element.width, element.height, radius);
    context.arcTo(element.width, element.height, 0, element.height, radius);
    context.arcTo(0, element.height, 0, 0, radius);
    context.arcTo(0, 0, element.width, 0, radius);
    context.closePath();
  }
  context.fill();
  context.restore();
};
