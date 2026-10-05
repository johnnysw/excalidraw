import type { MindmapObject } from "./types";
import type {
  MindmapBounds,
  MindmapNodeGeometry,
  MindmapPoint,
} from "./mindmap";
import type { MindmapNodeMoveTarget } from "./model";
import { buildMindmapTreeIndex, normalizeMindmapSelectionRoots } from "./tree";
export interface MindmapSelection {
  primary: { mapId: string; nodeId: string } | null;
  nodesByMap: Record<string, readonly string[]>;
  wholeMapIds: readonly string[];
}
export type MindmapDropIntent = {
  kind: "inside" | "before" | "after";
  nodeId: string;
  target: MindmapNodeMoveTarget;
  indicator: MindmapBounds;
};
/** Input is in screen space, including transformed node geometry supplied by the host. */
export function resolveMindmapDropIntent(input: {
  point: MindmapPoint;
  node: MindmapNodeGeometry;
  bounds?: MindmapBounds;
  rootId: string;
  axis?: "x" | "y";
  reverse?: boolean;
  minHitSize?: number;
}): MindmapDropIntent | undefined {
  const b = input.bounds || input.node,
    minimum = input.minHitSize || 24;
  const hit = {
    x: b.x - Math.max(0, minimum - b.width) / 2,
    y: b.y - Math.max(0, minimum - b.height) / 2,
    width: Math.max(minimum, b.width),
    height: Math.max(minimum, b.height),
  };
  if (
    input.point.x < hit.x ||
    input.point.x > hit.x + hit.width ||
    input.point.y < hit.y ||
    input.point.y > hit.y + hit.height
  )
    return undefined;
  const axis =
    input.axis ||
    (input.node.side === "top" || input.node.side === "bottom" ? "x" : "y");
  const position =
    axis === "x"
      ? (input.point.x - hit.x) / hit.width
      : (input.point.y - hit.y) / hit.height;
  const edge =
    position < 0.25 ? "before" : position > 0.75 ? "after" : "inside";
  const kind =
    input.node.id === input.rootId
      ? "inside"
      : input.reverse
      ? edge === "before"
        ? "after"
        : edge === "after"
        ? "before"
        : edge
      : edge;
  const target: MindmapNodeMoveTarget =
    kind === "inside"
      ? { parentId: input.node.id }
      : {
          parentId: input.node.parentId || input.rootId,
          siblingId: input.node.id,
          position: kind,
        };
  const indicator =
    kind === "inside"
      ? { x: b.x, y: b.y, width: b.width, height: b.height }
      : axis === "x"
      ? {
          x: (position < 0.25 ? b.x : b.x + b.width) - 1,
          y: b.y,
          width: 2,
          height: b.height,
        }
      : {
          x: b.x,
          y: (position < 0.25 ? b.y : b.y + b.height) - 1,
          width: b.width,
          height: 2,
        };
  return { kind, nodeId: input.node.id, target, indicator };
}
export function resolveMindmapSplitCandidate(
  point: MindmapPoint,
  start: MindmapPoint,
  bounds: readonly MindmapBounds[]
): boolean {
  if (Math.hypot(point.x - start.x, point.y - start.y) <= 64) return false;
  return bounds.every(
    (b) =>
      point.x < b.x - 32 ||
      point.x > b.x + b.width + 32 ||
      point.y < b.y - 32 ||
      point.y > b.y + b.height + 32
  );
}
export function resolveMindmapEdgePan(
  point: MindmapPoint,
  bounds: MindmapBounds,
  margin = 32
): MindmapPoint {
  const axis = (value: number, min: number, max: number) =>
    value < min + margin
      ? -Math.min(16, (min + margin - value) / 2)
      : value > max - margin
      ? Math.min(16, (value - max + margin) / 2)
      : 0;
  return {
    x: axis(point.x, bounds.x, bounds.x + bounds.width),
    y: axis(point.y, bounds.y, bounds.y + bounds.height),
  };
}
export type MindmapKeyboardDecision =
  | "edit"
  | "edit-description"
  | "add-child"
  | "add-parent"
  | "add-sibling"
  | "commit"
  | "commit-add-child"
  | "commit-add-parent"
  | "newline"
  | "cancel"
  | "none";
export function isMindmapComposing(
  event: { isComposing?: boolean; keyCode?: number; which?: number },
  composing = false
) {
  return (
    composing ||
    Boolean(event.isComposing) ||
    event.keyCode === 229 ||
    event.which === 229
  );
}
export function resolveMindmapKeyboardDecision(input: {
  key: string;
  shiftKey?: boolean;
  composing?: boolean;
  isRoot?: boolean;
  editing?: "label" | "summary" | null;
}): MindmapKeyboardDecision {
  if (input.composing) return "none";
  if (input.key === "Escape") return "cancel";
  if (input.editing) {
    if (input.key === "Enter") return input.shiftKey ? "newline" : "commit";
    if (input.key === "Tab" && input.editing === "label")
      return input.shiftKey
        ? input.isRoot
          ? "commit"
          : "commit-add-parent"
        : "commit-add-child";
    return "none";
  }
  if (input.key === "F2") return "edit";
  if (input.key === "Enter")
    return input.shiftKey
      ? "edit-description"
      : input.isRoot
      ? "edit"
      : "add-sibling";
  if (input.key === "Tab")
    return input.shiftKey
      ? input.isRoot
        ? "none"
        : "add-parent"
      : "add-child";
  return "none";
}
export function selectMindmapNodesInBounds(
  object: MindmapObject,
  bounds: MindmapBounds,
  nodeBounds: Record<string, MindmapBounds>
) {
  const visible = buildMindmapTreeIndex(object).visibleIds;
  const ids = visible.filter((id) => {
    const node = nodeBounds[id];
    return (
      node &&
      node.x >= bounds.x &&
      node.y >= bounds.y &&
      node.x + node.width <= bounds.x + bounds.width &&
      node.y + node.height <= bounds.y + bounds.height
    );
  });
  return {
    nodeIds: ids,
    wholeMap: ids.length > 0 && ids.length === visible.length,
  };
}
export { normalizeMindmapSelectionRoots };
