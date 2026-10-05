import { pointFrom } from "@excalidraw/math";
import { pointsOnPath } from "points-on-path";

import { shapePathData } from "./coursewareShapePaths";

import type { LocalPoint } from "@excalidraw/math";
import type { ShapeKind } from "./coursewareShapePaths";

export const COURSEWARE_SHAPE_PRESETS = [
  {
    id: "rounded-rectangle",
    customType: "courseware-shape:rounded-rectangle",
    label: "圆角矩形",
    kind: "rounded-rectangle",
  },
  {
    id: "circle",
    customType: "courseware-shape:circle",
    label: "圆形",
    kind: "circle",
  },
  {
    id: "cylinder",
    customType: "courseware-shape:cylinder",
    label: "圆柱体",
    kind: "cylinder",
  },
  {
    id: "chevron",
    customType: "courseware-shape:chevron",
    label: "步骤",
    kind: "chevron",
  },
  {
    id: "process-pentagon",
    customType: "courseware-shape:process-pentagon",
    label: "五边形",
    kind: "pentagon",
  },
  {
    id: "triangle",
    customType: "courseware-shape:triangle",
    label: "三角形",
    kind: "triangle",
  },
  {
    id: "right-triangle",
    customType: "courseware-shape:right-triangle",
    label: "直角三角形",
    kind: "right-triangle",
  },
  {
    id: "star",
    customType: "courseware-shape:star",
    label: "五角星",
    kind: "star",
  },
  {
    id: "pentagon",
    customType: "courseware-shape:pentagon",
    label: "正五边形",
    kind: "octagon",
  },
  {
    id: "hexagon",
    customType: "courseware-shape:hexagon",
    label: "六边形",
    kind: "hexagon",
  },
  {
    id: "octagon",
    customType: "courseware-shape:octagon",
    label: "八边形",
    kind: "funnel",
  },
  {
    id: "parallelogram",
    customType: "courseware-shape:parallelogram",
    label: "平行四边形",
    kind: "parallelogram",
  },
  {
    id: "trapezoid",
    customType: "courseware-shape:trapezoid",
    label: "梯形",
    kind: "trapezoid",
  },
  {
    id: "speech-bubble",
    customType: "courseware-shape:speech-bubble",
    label: "圆角对话框",
    kind: "speech-bubble",
  },
  {
    id: "speech-bubble-square",
    customType: "courseware-shape:speech-bubble-square",
    label: "对话框",
    kind: "speech-bubble-square",
  },
  {
    id: "left-arrow",
    customType: "courseware-shape:left-arrow",
    label: "左箭头",
    kind: "left-arrow",
  },
  {
    id: "right-arrow",
    customType: "courseware-shape:right-arrow",
    label: "右箭头",
    kind: "right-arrow",
  },
  {
    id: "double-arrow",
    customType: "courseware-shape:double-arrow",
    label: "双向箭头",
    kind: "double-arrow",
  },
  {
    id: "cloud",
    customType: "courseware-shape:cloud",
    label: "云朵",
    kind: "cloud",
  },
  {
    id: "brace",
    customType: "courseware-shape:brace",
    label: "大括号",
    kind: "brace",
  },
  {
    id: "brace-right",
    customType: "courseware-shape:brace-right",
    label: "右大括号",
    kind: "brace-right",
  },
  {
    id: "cross",
    customType: "courseware-shape:cross",
    label: "十字形",
    kind: "cross",
  },
] as const;

export type CoursewareShapePreset = (typeof COURSEWARE_SHAPE_PRESETS)[number];

export const getCoursewareShapePreset = (activeTool: {
  type: string;
  customType?: string | null;
}): CoursewareShapePreset | undefined =>
  activeTool.type === "custom"
    ? COURSEWARE_SHAPE_PRESETS.find(
        (preset) => preset.customType === activeTool.customType
      )
    : undefined;

type ShapeContour = { points: LocalPoint[]; closed: boolean };
const contoursCache = new Map<ShapeKind, ShapeContour[]>();

/** Sample the whiteboard curves once; scenes retain editable native geometry. */
export const getCoursewareShapeContours = (preset: CoursewareShapePreset) => {
  const cached = contoursCache.get(preset.kind);
  if (cached) {
    return cached;
  }
  const path =
    preset.kind === "circle"
      ? "M 100,50 C 100,77.614 77.614,100 50,100 C 22.386,100 0,77.614 0,50 C 0,22.386 22.386,0 50,0 C 77.614,0 100,22.386 100,50 Z"
      : preset.kind === "rounded-rectangle"
      ? "M 16,0 H 84 Q 100,0 100,16 V 84 Q 100,100 84,100 H 16 Q 0,100 0,84 V 16 Q 0,0 16,0 Z"
      : shapePathData(preset.kind, 100, 100)!;
  const sets = pointsOnPath(path, 0.1, 0.2);
  const allPoints = sets.flat();
  const minX = Math.min(...allPoints.map(([x]) => x));
  const minY = Math.min(...allPoints.map(([, y]) => y));
  const width = Math.max(...allPoints.map(([x]) => x)) - minX;
  const height = Math.max(...allPoints.map(([, y]) => y)) - minY;
  const contours = sets.map((points) => ({
    closed:
      points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1],
    points: points.map(([x, y]) =>
      pointFrom<LocalPoint>((x - minX) / width, (y - minY) / height)
    ),
  }));
  contoursCache.set(preset.kind, contours);
  return contours;
};

export const getCoursewareShapeBounds = (
  preset: CoursewareShapePreset,
  origin: { x: number; y: number },
  pointer: { x: number; y: number },
  modifiers: { fromCenter: boolean; maintainAspectRatio: boolean }
) => {
  const dx = pointer.x - origin.x;
  const dy = pointer.y - origin.y;
  let width = Math.abs(dx);
  let height = Math.abs(dy);
  if (modifiers.maintainAspectRatio || preset.kind === "circle") {
    width = height = Math.max(width, height);
  }
  if (modifiers.fromCenter) {
    width *= 2;
    height *= 2;
  }
  const left =
    origin.x - (modifiers.fromCenter ? width / 2 : dx < 0 ? width : 0);
  const top =
    origin.y - (modifiers.fromCenter ? height / 2 : dy < 0 ? height : 0);
  return { x: left, y: top, width, height };
};

/** Keep disconnected outlines grouped, without artificial joining strokes. */
export const getCoursewareShapeGeometry = (
  preset: CoursewareShapePreset,
  origin: { x: number; y: number },
  pointer: { x: number; y: number },
  modifiers: { fromCenter: boolean; maintainAspectRatio: boolean }
) => {
  const bounds = getCoursewareShapeBounds(preset, origin, pointer, modifiers);
  const isBrace = preset.kind === "brace" || preset.kind === "brace-right";
  const width = isBrace ? Math.min(18, bounds.width * 0.3) : bounds.width;
  const height = bounds.height;
  const left = bounds.x + (preset.kind === "brace" ? bounds.width - width : 0);
  const top = bounds.y;
  return getCoursewareShapeContours(preset).map((contour) => {
    const points = contour.points.map(([x, y]) =>
      pointFrom<LocalPoint>(x * width, y * height)
    );
    const [offsetX, offsetY] = points[0];
    const contourWidth =
      Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
    const contourHeight =
      Math.max(...points.map(([, y]) => y)) -
      Math.min(...points.map(([, y]) => y));
    return {
      x: left + offsetX,
      y: top + offsetY,
      width: contourWidth,
      height: contourHeight,
      polygon: contour.closed,
      points: points.map(([x, y]) =>
        pointFrom<LocalPoint>(x - offsetX, y - offsetY)
      ),
    };
  });
};
