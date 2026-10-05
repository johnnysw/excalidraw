import type { MindmapObject } from "./types";
import {
  resolveMindmapObjectGeometry,
  resolveMindmapNodeVisualStyle,
  resolveMindmapNodeContentGeometry,
  resolveMindmapNodeDecoration,
  resolveMindmapStrokeDash,
  resolveMindmapSummaryVisualStyle,
  mindmapBranchPathData,
  resolveMindmapLayoutScale,
  type MindmapGeometryResult,
} from "./mindmap";
import { shapePathData } from "./shapeGeometry";
import { getMindmapTextMetricsRevision, type MindmapTextMetrics } from "./text";
import { resolveMindmapProfessionalGeometry } from "./professional";
import { buildMindmapTreeIndex } from "./tree";
export const MINDMAP_FONT_FAMILY = "Arial, sans-serif";
function transparent(color: string) {
  return (
    color === "transparent" ||
    color === "none" ||
    /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(color) ||
    /^#[\da-f]{6}00$/i.test(color)
  );
}
const renderCache = new WeakMap<
  MindmapObject,
  { revision: number; data: MindmapRenderData }
>();
export function resolveMindmapRenderData(
  model: MindmapObject,
  options: {
    geometry?: MindmapGeometryResult;
    metrics?: MindmapTextMetrics;
  } = {}
): MindmapRenderData {
  const revision = getMindmapTextMetricsRevision();
  const cached = renderCache.get(model);
  if (
    cached &&
    cached.revision === revision &&
    !options.geometry &&
    !options.metrics
  )
    return cached.data;
  const geometry = options.geometry || resolveMindmapObjectGeometry(model);
  const scale = resolveMindmapLayoutScale(model.layoutScale);
  const professional = resolveMindmapProfessionalGeometry(model, geometry);
  const treeIndex = buildMindmapTreeIndex(model);
  const topBranches = treeIndex.children.get(model.rootId) || [];
  const branchColors = new Map<string, string>();
  for (const id of treeIndex.preorder) {
    const node = model.nodes[id];
    if (node.parentId === model.rootId && model.theme?.branchColors.length) {
      branchColors.set(
        id,
        model.theme.branchColors[
          topBranches.indexOf(id) % model.theme.branchColors.length
        ]
      );
    } else if (node.parentId && branchColors.has(node.parentId)) {
      branchColors.set(id, branchColors.get(node.parentId)!);
    }
  }
  const data = {
    geometry,
    flipX: Boolean(model.flipX),
    flipY: Boolean(model.flipY),
    scale,
    connector: model.connector,
    branchWidth: 2 * scale,
    branchDash:
      model.lineStyle === "dash"
        ? [10 * scale, 8 * scale]
        : model.lineStyle === "dot"
        ? [2 * scale, 7 * scale]
        : [],
    summaryStyle: resolveMindmapSummaryVisualStyle(),
    ...professional,
    branches: geometry.branches.map((branch) => ({
      id: branch.id,
      path: mindmapBranchPathData(branch, model.branchStyle || "curve", scale),
      color: branchColors.get(branch.childId) || model.connector,
    })),
    nodes: geometry.visibleIds.map((id) => {
      const node = model.nodes[id],
        bounds = geometry.nodes[id],
        style = resolveMindmapNodeVisualStyle(node, bounds.depth, model);
      const content = resolveMindmapNodeContentGeometry(
        {
          ...node,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontStyle: style.fontStyle,
          textDecoration: style.textDecoration,
          align: style.align,
          color: style.color,
        },
        {
          isRoot: id === model.rootId,
          depth: bounds.depth,
          layoutScale: scale,
          preserveSize: true,
          width: bounds.width,
          height: bounds.height,
          metrics: options.metrics,
        }
      );
      const background =
        style.shape === "text" &&
        style.fillSource !== "default" &&
        !transparent(style.fill)
          ? { fill: style.fill, radius: 4 * scale }
          : null;
      return {
        node,
        bounds,
        style,
        content,
        textBackground: background,
        opacity: Math.max(0, Math.min(1, style.opacity ?? 1)),
        shapePath:
          style.shape === "text" ||
          style.shape === "ellipse" ||
          style.shape === "circle"
            ? null
            : shapePathData(style.shape, bounds.width, bounds.height),
        dash: resolveMindmapStrokeDash(style.lineStyle, scale) || [],
        decoration: resolveMindmapNodeDecoration(node),
        labelLines: content.labelLines,
        textRuns: content.textRuns,
      };
    }),
  };
  if (!options.geometry && !options.metrics)
    renderCache.set(model, { revision, data });
  return data;
}
export interface MindmapRenderData {
  geometry: MindmapGeometryResult;
  flipX: boolean;
  flipY: boolean;
  scale: number;
  connector: string;
  branchWidth: number;
  branchDash: number[];
  summaryStyle: ReturnType<typeof resolveMindmapSummaryVisualStyle>;
  summaries: ReturnType<typeof resolveMindmapProfessionalGeometry>["summaries"];
  boundaries: ReturnType<
    typeof resolveMindmapProfessionalGeometry
  >["boundaries"];
  relations: ReturnType<typeof resolveMindmapProfessionalGeometry>["relations"];
  branches: { id: string; path: string; color: string }[];
  nodes: {
    node: MindmapObject["nodes"][string];
    bounds: MindmapGeometryResult["nodes"][string];
    style: ReturnType<typeof resolveMindmapNodeVisualStyle>;
    content: ReturnType<typeof resolveMindmapNodeContentGeometry>;
    textBackground: { fill: string; radius: number } | null;
    opacity: number;
    shapePath: string | null;
    dash: number[];
    decoration: ReturnType<typeof resolveMindmapNodeDecoration>;
    labelLines: string[];
    textRuns: ReturnType<typeof resolveMindmapNodeContentGeometry>["textRuns"];
  }[];
}
