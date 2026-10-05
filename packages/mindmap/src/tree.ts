import type { MindmapObject } from "./types";

export interface MindmapTreeIndex {
  children: ReadonlyMap<string, readonly string[]>;
  depth: ReadonlyMap<string, number>;
  preorder: readonly string[];
  visibleIds: readonly string[];
  subtreeEnd: ReadonlyMap<string, number>;
}
const indexes = new WeakMap<
  MindmapObject["nodes"],
  { order: string[]; rootId: string; index: MindmapTreeIndex }
>();
/** Derived, immutable tree data. No index is ever serialized. */
export function buildMindmapTreeIndex(
  object: Pick<MindmapObject, "nodes" | "order" | "rootId">
): MindmapTreeIndex {
  const cached = indexes.get(object.nodes);
  if (cached?.order === object.order && cached.rootId === object.rootId)
    return cached.index;
  const children = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const id of [...object.order, ...Object.keys(object.nodes)]) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node = object.nodes[id];
    if (!node?.parentId) continue;
    const siblings = children.get(node.parentId) || [];
    siblings.push(id);
    children.set(node.parentId, siblings);
  }
  const depth = new Map<string, number>();
  const preorder: string[] = [];
  const visibleIds: string[] = [];
  const subtreeEnd = new Map<string, number>();
  const stack: {
    id: string;
    depth: number;
    visible: boolean;
    exit?: boolean;
  }[] = [{ id: object.rootId, depth: 0, visible: true }];
  while (stack.length) {
    const entry = stack.pop()!;
    if (entry.exit) {
      subtreeEnd.set(entry.id, preorder.length);
      continue;
    }
    if (!object.nodes[entry.id] || depth.has(entry.id)) continue;
    depth.set(entry.id, entry.depth);
    preorder.push(entry.id);
    if (entry.visible) visibleIds.push(entry.id);
    stack.push({ ...entry, exit: true });
    const childIds = children.get(entry.id) || [];
    for (let i = childIds.length - 1; i >= 0; i--)
      stack.push({
        id: childIds[i],
        depth: entry.depth + 1,
        visible: entry.visible && !object.nodes[entry.id].collapsed,
      });
  }
  const index = { children, depth, preorder, visibleIds, subtreeEnd };
  indexes.set(object.nodes, {
    order: object.order,
    rootId: object.rootId,
    index,
  });
  return index;
}
export function normalizeMindmapSelectionRoots(
  object: MindmapObject,
  ids: readonly string[]
): string[] {
  const selected = new Set(ids.filter((id) => Boolean(object.nodes[id])));
  return buildMindmapTreeIndex(object).preorder.filter((id) => {
    if (!selected.has(id)) return false;
    const seen = new Set<string>();
    let parent = object.nodes[id].parentId;
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return false;
      seen.add(parent);
      parent = object.nodes[parent]?.parentId || null;
    }
    return true;
  });
}
