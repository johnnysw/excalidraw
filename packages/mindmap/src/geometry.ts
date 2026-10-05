export interface RectangleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface FlippableRectangleGeometry extends RotatedRectangleGeometry {
  flipX?: boolean;
  flipY?: boolean;
}

/** Builds an SVG/Konva.Path-compatible rounded polyline without moving ends. */
export function roundedPolylinePathData(points: number[], radius = 8): string {
  const path: Point[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    path.push({ x: points[index], y: points[index + 1] });
  }
  if (!path.length) return "";
  if (path.length === 1) return `M ${path[0].x} ${path[0].y}`;
  let command = `M ${path[0].x} ${path[0].y}`;
  for (let index = 1; index < path.length - 1; index += 1) {
    const previous = path[index - 1];
    const corner = path[index];
    const next = path[index + 1];
    const incomingLength = Math.hypot(
      corner.x - previous.x,
      corner.y - previous.y
    );
    const outgoingLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    if (!incomingLength || !outgoingLength) continue;
    const cornerRadius = Math.min(
      Math.max(0, radius),
      incomingLength / 2,
      outgoingLength / 2
    );
    const before = {
      x: corner.x - ((corner.x - previous.x) / incomingLength) * cornerRadius,
      y: corner.y - ((corner.y - previous.y) / incomingLength) * cornerRadius,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) / outgoingLength) * cornerRadius,
      y: corner.y + ((next.y - corner.y) / outgoingLength) * cornerRadius,
    };
    command += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = path.at(-1) as Point;
  return `${command} L ${end.x} ${end.y}`;
}

export function rotatePoint(
  point: Point,
  origin: Point,
  rotation: number
): Point {
  if (!rotation) return point;
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  return {
    x: origin.x + x * cosine - y * sine,
    y: origin.y + x * sine + y * cosine,
  };
}

/**
 * Applies Konva-compatible center flips followed by the object's rotation.
 * This is also used for ports so connection anchors follow mirrored objects.
 */
export function transformRectanglePoint(
  geometry: FlippableRectangleGeometry,
  point: Point
): Point {
  const center = {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
  const flipped = {
    x: geometry.flipX ? center.x * 2 - point.x : point.x,
    y: geometry.flipY ? center.y * 2 - point.y : point.y,
  };
  return rotatePoint(
    flipped,
    { x: geometry.x, y: geometry.y },
    geometry.rotation
  );
}

/** Reverses transformRectanglePoint for collision checks in object space. */
export function inverseTransformRectanglePoint(
  geometry: FlippableRectangleGeometry,
  point: Point
): Point {
  const unrotated = rotatePoint(
    point,
    { x: geometry.x, y: geometry.y },
    -geometry.rotation
  );
  const center = {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
  return {
    x: geometry.flipX ? center.x * 2 - unrotated.x : unrotated.x,
    y: geometry.flipY ? center.y * 2 - unrotated.y : unrotated.y,
  };
}

export function transformedRectangleBounds(
  geometry: FlippableRectangleGeometry
): RectangleBounds {
  const corners = [
    { x: geometry.x, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y },
    { x: geometry.x + geometry.width, y: geometry.y + geometry.height },
    { x: geometry.x, y: geometry.y + geometry.height },
  ].map((point) => transformRectanglePoint(geometry, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  };
}

export interface RotatedRectangleGeometry extends RectangleBounds {
  rotation: number;
}
