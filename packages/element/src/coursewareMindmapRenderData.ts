import { MINDMAP_FONT_FAMILY, resolveMindmapRenderData, getMindmapTextMetricsRevision } from "@excalidraw/mindmap";
import { getCoursewareMindmap } from "./coursewareMindmapType";
import { getCoursewareMindmapGeometry } from "./coursewareMindmapGeometry";
import type { MindmapRenderData, WhiteboardMindmapObject } from "@excalidraw/mindmap";
import type { ExcalidrawElement } from "./types";

export const COURSEWARE_MINDMAP_FONT_FAMILY = MINDMAP_FONT_FAMILY;
const cache = new WeakMap<WhiteboardMindmapObject, { revision: number; data: MindmapRenderData }>();
/** Canvas, SVG, presenter, hit testing and editing use the shared drawing description. */
export const getCoursewareMindmapRenderData = (
  element: Pick<ExcalidrawElement, "type" | "customData">,
): MindmapRenderData | null => {
  const model = getCoursewareMindmap(element);
  if (!model) return null;
  const revision = getMindmapTextMetricsRevision();
  const previous = cache.get(model);
  if (previous?.revision === revision) return previous.data;
  const geometry = getCoursewareMindmapGeometry(element);
  if (!geometry) return null;
  const data = resolveMindmapRenderData(model, { geometry });
  cache.set(model, { revision, data });
  return data;
};
