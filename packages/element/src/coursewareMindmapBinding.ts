import { pointFrom } from "@excalidraw/math";
import type { GlobalPoint } from "@excalidraw/math";
import {
  coursewareMindmapLocalToScene,
  coursewareMindmapSceneToLocal,
  hitCoursewareMindmapNode,
} from "./coursewareMindmapTransform";
import { getCoursewareMindmapGeometry } from "./coursewareMindmapGeometry";
import { isCoursewareMindmapElement } from "./coursewareMindmapType";
import type { ExcalidrawElement, FixedPointBinding } from "./types";

/** A node anchor supplements the ordinary element binding, never replaces it. */
export const createMindmapNodeBinding = (
  element: ExcalidrawElement,
  point: GlobalPoint,
): Pick<FixedPointBinding, "mindmapNodeId" | "mindmapNodePoint"> => {
  if (!isCoursewareMindmapElement(element)) return {};
  const id = hitCoursewareMindmapNode(
    element,
    { x: point[0], y: point[1] },
    24,
  );
  const node = id && getCoursewareMindmapGeometry(element)?.nodes[id];
  if (!id || !node) return {};
  const local = coursewareMindmapSceneToLocal(element, {
    x: point[0],
    y: point[1],
  });
  const x = Math.max(
    0,
    Math.min(1, (local.x - node.x) / Math.max(1, node.width)),
  );
  const y = Math.max(
    0,
    Math.min(1, (local.y - node.y) / Math.max(1, node.height)),
  );
  // Choose the closest side; arrows do not end in the node's text.
  const distances = [x, 1 - x, y, 1 - y];
  const side = distances.indexOf(Math.min(...distances));
  return {
    mindmapNodeId: id,
    mindmapNodePoint: [
      side === 0 ? 0 : side === 1 ? 1 : x,
      side === 2 ? 0 : side === 3 ? 1 : y,
    ],
  };
};

/** Hidden nodes deliberately have no live anchor: keep the previous endpoint. */
export const resolveMindmapNodeBinding = (
  element: ExcalidrawElement,
  binding: FixedPointBinding | null | undefined,
): GlobalPoint | null => {
  if (!binding?.mindmapNodeId || !isCoursewareMindmapElement(element))
    return null;
  const geometry = getCoursewareMindmapGeometry(element);
  if (!geometry?.visibleIds.includes(binding.mindmapNodeId)) return null;
  const node = geometry.nodes[binding.mindmapNodeId];
  const [x, y] = binding.mindmapNodePoint ?? [0.5, 0.5];
  const point = coursewareMindmapLocalToScene(element, {
    x: node.x + node.width * x,
    y: node.y + node.height * y,
  });
  return pointFrom<GlobalPoint>(point.x, point.y);
};
