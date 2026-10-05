import { resolveMindmapObjectGeometry, getMindmapTextMetricsRevision } from "@excalidraw/mindmap";
import { getCoursewareMindmap } from "./coursewareMindmapType";

import type {
  MindmapGeometryResult,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { ExcalidrawElement } from "./types";

const cache = new WeakMap<WhiteboardMindmapObject, { revision: number; geometry: MindmapGeometryResult }>();

export const cacheCoursewareMindmapGeometry = (
  model: WhiteboardMindmapObject,
  geometry: MindmapGeometryResult,
) => cache.set(model, { revision: getMindmapTextMetricsRevision(), geometry });

export const getCoursewareMindmapGeometry = (
  element: Pick<ExcalidrawElement, "type" | "customData">,
): MindmapGeometryResult | null => {
  const model = getCoursewareMindmap(element);
  if (!model) {
    return null;
  }
  const revision = getMindmapTextMetricsRevision();
  const cached = cache.get(model);
  if (cached?.revision === revision) return cached.geometry;
  const geometry = resolveMindmapObjectGeometry(model, { padding: 0 });
  cache.set(model, { revision, geometry });
  return geometry;
};
