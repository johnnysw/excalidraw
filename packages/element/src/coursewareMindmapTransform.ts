import {
  distanceToLineSegment,
  ellipse,
  ellipseDistanceFromPoint,
  ellipseIncludesPoint,
  lineSegment,
  pointFrom,
  polygonIncludesPointNonZero,
} from "@excalidraw/math";
import { pointsOnPath } from "points-on-path";

import { getCoursewareMindmapGeometry } from "./coursewareMindmapGeometry";
import { getCoursewareMindmap } from "./coursewareMindmapType";
import { getCoursewareMindmapRenderData } from "./coursewareMindmapRenderData";

import type { MindmapContentRect } from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "./types";

type Point = { x: number; y: number };

const rotate = ({ x, y }: Point, angle: number): Point => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});

/** Core layout coordinates -> native rectangle -> rotated scene coordinates. */
export const coursewareMindmapLocalToScene = (
  element: ExcalidrawRectangleElement,
  point: Point,
): Point => {
  const bounds = getCoursewareMindmapGeometry(element)?.bounds;
  if (!bounds) {
    return { x: element.x + point.x, y: element.y + point.y };
  }
  const local = rotate(
    {
      x:
        (((point.x - bounds.x) * element.width) / Math.max(1, bounds.width) -
          element.width / 2) *
        (getCoursewareMindmap(element)?.flipX ? -1 : 1),
      y:
        (((point.y - bounds.y) * element.height) / Math.max(1, bounds.height) -
          element.height / 2) *
        (getCoursewareMindmap(element)?.flipY ? -1 : 1),
    },
    element.angle,
  );
  return {
    x: element.x + element.width / 2 + local.x,
    y: element.y + element.height / 2 + local.y,
  };
};

export const coursewareMindmapSceneToLocal = (
  element: ExcalidrawRectangleElement,
  point: Point,
): Point => {
  const bounds = getCoursewareMindmapGeometry(element)?.bounds;
  if (!bounds) {
    return { x: point.x - element.x, y: point.y - element.y };
  }
  const local = rotate(
    {
      x: point.x - element.x - element.width / 2,
      y: point.y - element.y - element.height / 2,
    },
    -element.angle,
  );
  return {
    x:
      bounds.x +
      ((local.x * (getCoursewareMindmap(element)?.flipX ? -1 : 1) +
        element.width / 2) *
        bounds.width) /
        Math.max(1, element.width),
    y:
      bounds.y +
      ((local.y * (getCoursewareMindmap(element)?.flipY ? -1 : 1) +
        element.height / 2) *
        bounds.height) /
        Math.max(1, element.height),
  };
};

type RenderData = NonNullable<
  ReturnType<typeof getCoursewareMindmapRenderData>
>;
type RenderNode = RenderData["nodes"][number];
type PathPoints = [number, number][][];

const bodyPaths = new WeakMap<RenderNode, PathPoints>();

const getBodyPaths = (item: RenderNode, scale: number): PathPoints => {
  let paths = bodyPaths.get(item);
  if (paths) {
    return paths;
  }
  const { width, height } = item.bounds;
  if (item.shapePath) {
    // Flatten the same SVG paths the renderers use. This also covers rounded
    // polygons, curved clouds and open braces without a DOM or Path2D.
    paths = pointsOnPath(item.shapePath, 0.1);
  } else if (item.style.shape === "rounded-rectangle" || item.textBackground) {
    const r = Math.min(
      item.textBackground?.radius ?? 12 * scale,
      width / 2,
      height / 2,
    );
    paths = pointsOnPath(
      `M ${r},0 H ${width - r} A ${r},${r} 0 0 1 ${width},${r} V ${
        height - r
      } A ${r},${r} 0 0 1 ${width - r},${height} H ${r} A ${r},${r} 0 0 1 0,${
        height - r
      } V ${r} A ${r},${r} 0 0 1 ${r},0 Z`,
      0.1,
    );
  } else {
    paths = [
      [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
        [0, 0],
      ],
    ];
  }
  bodyPaths.set(item, paths);
  return paths;
};

const rectDistance = (point: Point, rect: MindmapContentRect) => {
  const left = point.x - rect.x;
  const top = point.y - rect.y;
  const outsideX = Math.max(-left, left - rect.width, 0);
  const outsideY = Math.max(-top, top - rect.height, 0);
  return {
    inside: !outsideX && !outsideY,
    distance:
      outsideX || outsideY
        ? Math.hypot(outsideX, outsideY)
        : Math.min(left, rect.width - left, top, rect.height - top),
  };
};

const scaleRect = (
  rect: MindmapContentRect,
  scaleX: number,
  scaleY: number,
) => ({
  x: rect.x * scaleX,
  y: rect.y * scaleY,
  width: rect.width * scaleX,
  height: rect.height * scaleY,
});

/** Description is a distinct visible block; its gap from the body stays empty. */
const getContentRects = (item: RenderNode): MindmapContentRect[] => {
  const { content } = item;
  const rects = [content.text, content.image].filter(
    (rect): rect is MindmapContentRect =>
      !!rect && rect.width > 0 && rect.height > 0,
  );
  if (content.summary && content.summaryQuoteLine) {
    const x = Math.min(content.summary.x, content.summaryQuoteLine.x);
    const y = Math.min(content.summary.y, content.summaryQuoteLine.y);
    rects.push({
      x,
      y,
      width:
        Math.max(
          content.summary.x + content.summary.width,
          content.summaryQuoteLine.x + content.summaryQuoteLine.width,
        ) - x,
      height:
        Math.max(
          content.summary.y + content.summary.height,
          content.summaryQuoteLine.y + content.summaryQuoteLine.height,
        ) - y,
    });
  }
  return rects;
};

const bodyDistance = (
  item: RenderNode,
  point: Point,
  scaleX: number,
  scaleY: number,
  layoutScale: number,
) => {
  const shape = item.style.shape;
  if (shape === "text" && !item.textBackground) {
    return { inside: false, distance: Infinity };
  }
  if (shape === "ellipse" || shape === "circle") {
    const radius = Math.min(item.bounds.width, item.bounds.height) / 2;
    const halfWidth =
      (shape === "circle" ? radius : item.bounds.width / 2) * scaleX;
    const halfHeight =
      (shape === "circle" ? radius : item.bounds.height / 2) * scaleY;
    const center = pointFrom(
      (item.bounds.width * scaleX) / 2,
      (item.bounds.height * scaleY) / 2,
    );
    const body = ellipse(center, halfWidth, halfHeight);
    const p = pointFrom(point.x, point.y);
    const distance =
      point.x === center[0] && point.y === center[1]
        ? Math.min(halfWidth, halfHeight)
        : ellipseDistanceFromPoint(p, body);
    return { inside: ellipseIncludesPoint(p, body), distance };
  }
  const paths = getBodyPaths(item, layoutScale);
  const p = pointFrom(point.x, point.y);
  let distance = Infinity;
  let inside = false;
  for (const path of paths) {
    const scaledPath = path.map(([x, y]): [number, number] => [
      x * scaleX,
      y * scaleY,
    ]);
    if (shape !== "brace" && shape !== "brace-right") {
      inside ||= polygonIncludesPointNonZero([point.x, point.y], scaledPath);
    }
    for (let index = 1; index < scaledPath.length; index++) {
      distance = Math.min(
        distance,
        distanceToLineSegment(
          p,
          lineSegment(
            pointFrom(...scaledPath[index - 1]),
            pointFrom(...scaledPath[index]),
          ),
        ),
      );
    }
  }
  return { inside, distance };
};

/** Internal hit testing uses visible silhouettes, content and descriptions. */
export const hitCoursewareMindmapNode = (
  element: ExcalidrawRectangleElement,
  scenePoint: Point,
  threshold = 0,
): string | null => {
  const data = getCoursewareMindmapRenderData(element);
  if (!data) {
    return null;
  }
  const { geometry } = data;
  const point = coursewareMindmapSceneToLocal(element, scenePoint);
  const scaleX = element.width / Math.max(1, geometry.bounds.width);
  const scaleY = element.height / Math.max(1, geometry.bounds.height);
  for (let index = data.nodes.length - 1; index >= 0; index--) {
    const item = data.nodes[index];
    const local = {
      x: (point.x - item.bounds.x) * scaleX,
      y: (point.y - item.bounds.y) * scaleY,
    };
    const footprint = scaleRect(
      {
        ...item.bounds.footprint,
        x: item.bounds.footprint.x - item.bounds.x,
        y: item.bounds.footprint.y - item.bounds.y,
      },
      scaleX,
      scaleY,
    );
    const tolerance =
      Math.max(0, threshold) +
      (item.style.strokeWidth * Math.max(scaleX, scaleY)) / 2;
    const broadHit = rectDistance(local, footprint);
    if (!broadHit.inside && broadHit.distance > tolerance) {
      continue;
    }
    const body = bodyDistance(item, local, scaleX, scaleY, data.scale);
    if (
      body.inside ||
      body.distance <= tolerance ||
      getContentRects(item).some((rect) => {
        const hit = rectDistance(local, scaleRect(rect, scaleX, scaleY));
        return hit.inside || hit.distance <= Math.max(0, threshold);
      })
    ) {
      return item.node.id;
    }
  }
  return null;
};

/** Distance to visible node silhouettes/content, never the enclosing rectangle. */
export const distanceToCoursewareMindmap = (
  element: ExcalidrawRectangleElement,
  scenePoint: Point,
): number => {
  const data = getCoursewareMindmapRenderData(element);
  if (!data) return Infinity;
  const { geometry } = data;
  const point = coursewareMindmapSceneToLocal(element, scenePoint);
  const scaleX = element.width / Math.max(1, geometry.bounds.width);
  const scaleY = element.height / Math.max(1, geometry.bounds.height);
  let distance = Infinity;
  for (const item of data.nodes) {
    const local = {
      x: (point.x - item.bounds.x) * scaleX,
      y: (point.y - item.bounds.y) * scaleY,
    };
    const body = bodyDistance(item, local, scaleX, scaleY, data.scale);
    distance = Math.min(distance, body.distance);
    for (const rect of getContentRects(item)) {
      // Interior text/image boxes do not introduce new edges inside a filled
      // node, but their parts outside its silhouette and descriptions do.
      if (body.inside && rect.y < item.bounds.height) {
        continue;
      }
      distance = Math.min(
        distance,
        rectDistance(local, scaleRect(rect, scaleX, scaleY)).distance,
      );
    }
  }
  return distance;
};
