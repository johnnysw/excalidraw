export const COURSEWARE_WHITEBOARD_SHAPE_KINDS = [
  "rounded-rectangle",
  "ellipse",
  "diamond",
  "rectangle",
  "circle",
  "cylinder",
  "chevron",
  "pentagon",
  "parallelogram",
  "trapezoid",
  "speech-bubble",
  "speech-bubble-square",
  "right-triangle",
  "triangle",
  "star",
  "hexagon",
  "octagon",
  "funnel",
  "left-arrow",
  "right-arrow",
  "double-arrow",
  "cloud",
  "cross",
  "brace",
  "brace-right",
] as const;

export type ShapeKind = (typeof COURSEWARE_WHITEBOARD_SHAPE_KINDS)[number];

const n = (value: number) => Number(value.toFixed(3));
const point = (x: number, y: number) => `${n(x)},${n(y)}`;

const BRACE_SHAPE_MAX_WIDTH = 18;

/**
 * Feishu keeps the brace narrow when the object's text area grows wider. The
 * proportional cap only matters when a brace is resized close to its minimum
 * width.
 */
export function braceShapeWidth(width: number) {
  const resolvedWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  return Math.min(BRACE_SHAPE_MAX_WIDTH, resolvedWidth * 0.3);
}

function polygonPath(points: Array<[number, number]>) {
  return `M ${points.map(([x, y]) => point(x, y)).join(" L ")} Z`;
}

/**
 * Builds a closed polygon with small, geometry-level corner radii. Konva's
 * round lineJoin only rounds the stroke; trimming each edge and using a
 * quadratic corner also rounds the filled silhouette (as in Feishu).
 */
function roundedPolygonPath(
  points: Array<[number, number]>,
  radius: number
): string {
  if (points.length < 3 || radius <= 0) return polygonPath(points);
  const corners = points.map(([x, y], index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const incomingLength = Math.hypot(x - previous[0], y - previous[1]);
    const outgoingLength = Math.hypot(next[0] - x, next[1] - y);
    const trim = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    return {
      corner: [x, y] as [number, number],
      before: [
        x - ((x - previous[0]) / incomingLength) * trim,
        y - ((y - previous[1]) / incomingLength) * trim,
      ] as [number, number],
      after: [
        x + ((next[0] - x) / outgoingLength) * trim,
        y + ((next[1] - y) / outgoingLength) * trim,
      ] as [number, number],
    };
  });
  const last = corners[corners.length - 1].after;
  let path = `M ${point(last[0], last[1])}`;
  for (const { corner, before, after } of corners) {
    path += ` L ${point(before[0], before[1])} Q ${point(
      corner[0],
      corner[1]
    )} ${point(after[0], after[1])}`;
  }
  return `${path} Z`;
}

function regularPolygonPath(
  width: number,
  height: number,
  sides: number,
  startAngle = -Math.PI / 2,
  cornerRadius = 0
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = startAngle + (index * Math.PI * 2) / sides;
    return [
      centerX + Math.cos(angle) * (width / 2),
      centerY + Math.sin(angle) * (height / 2),
    ] as [number, number];
  });
  return cornerRadius > 0
    ? roundedPolygonPath(points, cornerRadius)
    : polygonPath(points);
}

function starPath(width: number, height: number, cornerRadius = 0) {
  const centerX = width / 2;
  const centerY = height / 2;
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? 1 : 0.43;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return [
      centerX + Math.cos(angle) * (width / 2) * radius,
      centerY + Math.sin(angle) * (height / 2) * radius,
    ] as [number, number];
  });
  return cornerRadius > 0
    ? roundedPolygonPath(points, cornerRadius)
    : polygonPath(points);
}

/** SVG path geometry shared by Konva rendering and SVG/PNG export. */
export function shapePathData(
  kind: ShapeKind,
  width: number,
  height: number
): string | null {
  const dimension = (value: number) =>
    Number.isFinite(value) ? Math.max(1, value) : 1;
  const w = dimension(width);
  const h = dimension(height);
  const cornerRadius = Math.min(w, h) * 0.055;
  switch (kind) {
    case "rectangle":
    case "rounded-rectangle":
    case "ellipse":
    case "circle":
      return null;
    case "diamond":
      return roundedPolygonPath(
        [
          [w / 2, 0],
          [w, h / 2],
          [w / 2, h],
          [0, h / 2],
        ],
        cornerRadius
      );
    case "triangle":
      return roundedPolygonPath(
        [
          [w / 2, 0],
          [w, h],
          [0, h],
        ],
        cornerRadius
      );
    case "right-triangle":
      return roundedPolygonPath(
        [
          [0, 0],
          [w, h],
          [0, h],
        ],
        cornerRadius
      );
    case "cylinder":
      return `M 0,${n(h * 0.14)} C 0,0 ${n(w)},0 ${n(w)},${n(h * 0.14)} V ${n(
        h * 0.86
      )} C ${n(w)},${n(h)} 0,${n(h)} 0,${n(h * 0.86)} Z M 0,${n(
        h * 0.14
      )} C 0,${n(h * 0.3)} ${n(w)},${n(h * 0.3)} ${n(w)},${n(h * 0.14)}`;
    case "chevron":
      return roundedPolygonPath(
        [
          [w * 0.06, h * 0.12],
          [w * 0.66, h * 0.12],
          [w, h / 2],
          [w * 0.66, h * 0.88],
          [w * 0.06, h * 0.88],
          [w * 0.32, h / 2],
        ],
        cornerRadius
      );
    case "pentagon":
      // Feishu's “五边形” is the right-pointing process shape; the regular
      // pentagon is retained under the legacy `octagon` kind below.
      return roundedPolygonPath(
        [
          [w * 0.06, h * 0.12],
          [w * 0.7, h * 0.12],
          [w, h / 2],
          [w * 0.7, h * 0.88],
          [w * 0.06, h * 0.88],
        ],
        cornerRadius
      );
    case "parallelogram":
      return roundedPolygonPath(
        [
          [w * 0.14, h * 0.1],
          [w, h * 0.1],
          [w * 0.84, h * 0.9],
          [0, h * 0.9],
        ],
        cornerRadius
      );
    case "trapezoid":
      return roundedPolygonPath(
        [
          [w * 0.2, h * 0.1],
          [w * 0.8, h * 0.1],
          [w, h * 0.9],
          [0, h * 0.9],
        ],
        cornerRadius
      );
    case "speech-bubble": {
      // Organic Feishu message bubble: an ellipse-like body with a small
      // lower-left tail rather than a rounded rectangle.
      return `M ${n(w * 0.95)},${n(h * 0.46)} C ${n(w * 0.95)},${n(
        h * 0.72
      )} ${n(w * 0.75)},${n(h * 0.87)} ${n(w * 0.5)},${n(h * 0.87)} C ${n(
        w * 0.43
      )},${n(h * 0.87)} ${n(w * 0.37)},${n(h * 0.86)} ${n(w * 0.31)},${n(
        h * 0.84
      )} L ${n(w * 0.14)},${n(h * 0.95)} Q ${n(w * 0.08)},${n(h)} ${n(
        w * 0.11
      )},${n(h * 0.87)} L ${n(w * 0.15)},${n(h * 0.77)} C ${n(w * 0.08)},${n(
        h * 0.67
      )} ${n(w * 0.05)},${n(h * 0.57)} ${n(w * 0.05)},${n(h * 0.46)} C ${n(
        w * 0.05
      )},${n(h * 0.21)} ${n(w * 0.25)},${n(h * 0.08)} ${n(w * 0.5)},${n(
        h * 0.08
      )} C ${n(w * 0.75)},${n(h * 0.08)} ${n(w * 0.95)},${n(h * 0.21)} ${n(
        w * 0.95
      )},${n(h * 0.46)} Z`;
    }
    case "speech-bubble-square": {
      const r = Math.min(w, h) * 0.16;
      const top = h * 0.08;
      const bottom = h * 0.8;
      return `M ${n(r)},${n(top)} H ${n(w - r)} Q ${n(w)},${n(top)} ${n(w)},${n(
        top + r
      )} V ${n(bottom - r)} Q ${n(w)},${n(bottom)} ${n(w - r)},${n(
        bottom
      )} H ${n(w * 0.43)} L ${n(w * 0.24)},${n(h * 0.97)} L ${n(w * 0.29)},${n(
        bottom
      )} H ${n(r)} Q 0,${n(bottom)} 0,${n(bottom - r)} V ${n(top + r)} Q 0,${n(
        top
      )} ${n(r)},${n(top)} Z`;
    }
    case "star":
      return starPath(w, h, cornerRadius * 0.55);
    case "hexagon":
      return regularPolygonPath(w, h, 6, 0, cornerRadius);
    case "octagon":
      // Persisted documents used the `octagon` kind for this regular
      // five-sided figure; keep that mapping stable while exposing the
      // correct 正五边形 label in the picker.
      return regularPolygonPath(w, h, 5, -Math.PI / 2, cornerRadius);
    case "left-arrow":
      return roundedPolygonPath(
        [
          [0, h / 2],
          [w * 0.38, 0],
          [w * 0.38, h * 0.28],
          [w, h * 0.28],
          [w, h * 0.72],
          [w * 0.38, h * 0.72],
          [w * 0.38, h],
        ],
        cornerRadius * 0.7
      );
    case "right-arrow":
      return roundedPolygonPath(
        [
          [0, h * 0.28],
          [w * 0.62, h * 0.28],
          [w * 0.62, 0],
          [w, h / 2],
          [w * 0.62, h],
          [w * 0.62, h * 0.72],
          [0, h * 0.72],
        ],
        cornerRadius * 0.7
      );
    case "double-arrow":
      return roundedPolygonPath(
        [
          [0, h / 2],
          [w * 0.25, 0],
          [w * 0.25, h * 0.28],
          [w * 0.75, h * 0.28],
          [w * 0.75, 0],
          [w, h / 2],
          [w * 0.75, h],
          [w * 0.75, h * 0.72],
          [w * 0.25, h * 0.72],
          [w * 0.25, h],
        ],
        cornerRadius * 0.7
      );
    case "cloud":
      return `M ${n(w * 0.22)},${n(h * 0.82)} C ${n(w * 0.1)},${n(
        h * 0.82
      )} ${n(w * 0.03)},${n(h * 0.74)} ${n(w * 0.03)},${n(h * 0.63)} C ${n(
        w * 0.03
      )},${n(h * 0.52)} ${n(w * 0.11)},${n(h * 0.45)} ${n(w * 0.21)},${n(
        h * 0.44
      )} C ${n(w * 0.18)},${n(h * 0.34)} ${n(w * 0.21)},${n(h * 0.25)} ${n(
        w * 0.29
      )},${n(h * 0.19)} C ${n(w * 0.39)},${n(h * 0.12)} ${n(w * 0.51)},${n(
        h * 0.16
      )} ${n(w * 0.57)},${n(h * 0.26)} C ${n(w * 0.64)},${n(h * 0.16)} ${n(
        w * 0.77
      )},${n(h * 0.14)} ${n(w * 0.86)},${n(h * 0.2)} C ${n(w * 0.95)},${n(
        h * 0.27
      )} ${n(w * 0.97)},${n(h * 0.38)} ${n(w * 0.94)},${n(h * 0.46)} C ${n(
        w * 0.98
      )},${n(h * 0.51)} ${n(w)},${n(h * 0.57)} ${n(w)},${n(h * 0.64)} C ${n(
        w
      )},${n(h * 0.75)} ${n(w * 0.91)},${n(h * 0.82)} ${n(w * 0.79)},${n(
        h * 0.82
      )} C ${n(w * 0.75)},${n(h * 0.9)} ${n(w * 0.65)},${n(h * 0.94)} ${n(
        w * 0.54
      )},${n(h * 0.94)} C ${n(w * 0.44)},${n(h * 0.94)} ${n(w * 0.36)},${n(
        h * 0.9
      )} ${n(w * 0.32)},${n(h * 0.84)} C ${n(w * 0.29)},${n(h * 0.83)} ${n(
        w * 0.25
      )},${n(h * 0.82)} ${n(w * 0.22)},${n(h * 0.82)} Z`;
    case "brace":
      return (() => {
        const braceWidth = braceShapeWidth(w);
        const spineX = w - braceWidth * 0.58;
        const tipX = w - braceWidth;
        return `M ${n(w)},0 C ${n(spineX)},0 ${n(spineX)},${n(h * 0.22)} ${n(
          spineX
        )},${n(h * 0.36)} C ${n(spineX)},${n(h * 0.47)} ${n(tipX)},${n(
          h * 0.48
        )} ${n(tipX)},${n(h * 0.5)} C ${n(tipX)},${n(h * 0.52)} ${n(
          spineX
        )},${n(h * 0.53)} ${n(spineX)},${n(h * 0.64)} C ${n(spineX)},${n(
          h * 0.78
        )} ${n(spineX)},${n(h)} ${n(w)},${n(h)}`;
      })();
    case "brace-right":
      return (() => {
        const braceWidth = braceShapeWidth(w);
        const spineX = braceWidth * 0.58;
        const tipX = braceWidth;
        return `M 0,0 C ${n(spineX)},0 ${n(spineX)},${n(h * 0.22)} ${n(
          spineX
        )},${n(h * 0.36)} C ${n(spineX)},${n(h * 0.47)} ${n(tipX)},${n(
          h * 0.48
        )} ${n(tipX)},${n(h * 0.5)} C ${n(tipX)},${n(h * 0.52)} ${n(
          spineX
        )},${n(h * 0.53)} ${n(spineX)},${n(h * 0.64)} C ${n(spineX)},${n(
          h * 0.78
        )} ${n(spineX)},${n(h)} 0,${n(h)}`;
      })();
    case "funnel":
      // The menu's final polygon is the eight-sided shape shown as 八边形.
      return regularPolygonPath(w, h, 8, Math.PI / 8, cornerRadius);
    case "cross":
      return roundedPolygonPath(
        [
          [w * 0.36, 0],
          [w * 0.64, 0],
          [w * 0.64, h * 0.36],
          [w, h * 0.36],
          [w, h * 0.64],
          [w * 0.64, h * 0.64],
          [w * 0.64, h],
          [w * 0.36, h],
          [w * 0.36, h * 0.64],
          [0, h * 0.64],
          [0, h * 0.36],
          [w * 0.36, h * 0.36],
        ],
        cornerRadius * 0.7
      );
  }
}

export function isShapeKind(value: unknown): value is ShapeKind {
  return COURSEWARE_WHITEBOARD_SHAPE_KINDS.includes(value as ShapeKind);
}
