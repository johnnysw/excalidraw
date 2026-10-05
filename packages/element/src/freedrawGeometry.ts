import type { StrokeOptions } from "perfect-freehand";

/** Shared by canvas, SVG export and the geometry worker. */
export const getFreedrawStrokeOptions = ({
  strokeWidth,
  simulatePressure,
  brushMode,
}: {
  strokeWidth: number;
  simulatePressure: boolean;
  brushMode?: unknown;
}): StrokeOptions => {
  if (brushMode === "highlighter") {
    return {
      size: strokeWidth * 4.25,
      thinning: 0,
      smoothing: 0.35,
      streamline: 0.25,
      simulatePressure: false,
      start: { cap: false, taper: 0 },
      end: { cap: false, taper: 0 },
      last: true,
    };
  }
  return {
    simulatePressure,
    size: strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
  };
};

const midpoint = (a: readonly number[], b: readonly number[]) => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

// Compact paths reduce Worker transfer size and Path2D parse time for long
// strokes while preserving Excalidraw's existing two-decimal output.
const TO_FIXED_PRECISION = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g;

export const getSvgPathFromStroke = (
  points: readonly (readonly number[])[],
): string => {
  if (!points.length) {
    return "";
  }

  const lastIndex = points.length - 1;

  return points
    .reduce<(readonly number[] | string)[]>(
      (path, point, index, outline) => {
        if (index === lastIndex) {
          path.push(point, midpoint(point, outline[0]), "L", outline[0], "Z");
        } else {
          path.push(point, midpoint(point, outline[index + 1]));
        }
        return path;
      },
      ["M", points[0], "Q"],
    )
    .join(" ")
    .replace(TO_FIXED_PRECISION, "$1");
};
