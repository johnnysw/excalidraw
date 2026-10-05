import {
  layoutMindmap,
  applyMindmapCommand,
  searchMindmap,
  withMindmapLayout,
  mindmapSubtreeNodeIds,
} from "@excalidraw/mindmap";
import type {
  WhiteboardMindmapNode,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { MindmapToolPreference } from "./config";

export const patchMindmapNode = (
  model: WhiteboardMindmapObject,
  nodeId: string,
  patch: Partial<WhiteboardMindmapNode>,
) =>
  applyMindmapCommand(model, { type: "patch", nodeIds: [nodeId], patch })
    .object;
export const changeMindmapLayout = (
  model: WhiteboardMindmapObject,
  value: MindmapToolPreference,
) =>
  layoutMindmap({
    ...withMindmapLayout(model, value.family, value.direction),
    branchStyle: value.branchStyle,
  });
export const getMindmapPreference = (
  model: WhiteboardMindmapObject,
): MindmapToolPreference => ({
  family: model.layoutFamily ?? "mindmap",
  direction: model.layoutDirection ?? model.layout,
  branchStyle: model.branchStyle ?? "curve",
});
export const searchMindmapNodes = (
  model: WhiteboardMindmapObject,
  query: string,
) => {
  return [...new Set(searchMindmap(model, query).map((match) => match.nodeId))];
};
export const expandMindmapAncestors = (
  model: WhiteboardMindmapObject,
  nodeId: string,
) => {
  let parentId = model.nodes[nodeId]?.parentId;
  const nodes = { ...model.nodes };
  const visited = new Set<string>();
  while (parentId && nodes[parentId] && !visited.has(parentId)) {
    visited.add(parentId);
    nodes[parentId] = { ...nodes[parentId], collapsed: false };
    parentId = nodes[parentId].parentId;
  }
  return layoutMindmap({ ...model, nodes });
};
export const removeMindmapArrows = (
  model: WhiteboardMindmapObject,
  nodeId: string,
) => new Set(mindmapSubtreeNodeIds(model, nodeId));
export const MINDMAP_NODE_STYLE_KEYS = [
  "shape",
  "fill",
  "color",
  "stroke",
  "strokeWidth",
  "lineStyle",
  "opacity",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "align",
] as const;
export const copyMindmapNodeStyle = (
  node: WhiteboardMindmapNode,
): Partial<WhiteboardMindmapNode> =>
  Object.fromEntries(MINDMAP_NODE_STYLE_KEYS.map((key) => [key, node[key]]));
