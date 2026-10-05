import { describe, expect, it } from "vitest";
import {
  addMindmapNode,
  addMindmapNodeFromPort,
  addMindmapParent,
  childrenOf,
  copyMindmapBranch,
  createMindmapTemplateObject,
  instantiateMindmapTemplateAt,
  layoutMindmap,
  MINDMAP_LAYOUT_PRESETS,
  moveMindmapNodeAt,
  moveMindmapNodePosition,
  normalizeMindmapObject,
  pasteMindmapBranch,
  removeMindmapNode,
  resizeMindmapNodeImage,
  resolveMindmapNavigationTarget,
  resolveMindmapNodeAffordances,
  resolveMindmapNodeAutoSize,
  resolveMindmapNodeContentGeometry,
  resolveMindmapNodeImageDropPlacement,
  resolveMindmapNodeInitialImageSize,
  resolveMindmapObjectGeometry,
  scaleMindmapForTransform,
  shapePathData,
  toggleMindmapNode,
  validMindmapDropTargetIds,
  visibleMindmapNodeIds,
  type MindmapObject,
} from "../src";

const rootPoint = (map: MindmapObject) => ({
  x: map.x + (map.nodes[map.rootId].x || 0),
  y: map.y + (map.nodes[map.rootId].y || 0),
});
const branchIds = (map: MindmapObject) => childrenOf(map, map.rootId).map(n => n.id);

describe("shared mind map core", () => {
  it.each(MINDMAP_LAYOUT_PRESETS)("lays out and places $family/$direction independently", ({ family, direction }) => {
    const map = createMindmapTemplateObject(40, 60, family, direction);
    const geometry = resolveMindmapObjectGeometry(map, { padding: 0 });
    expect(map.order).toHaveLength(4);
    expect(geometry.visibleIds).toHaveLength(4);
    expect(geometry.branches).toHaveLength(3);
    expect(geometry.bounds.width).toBeGreaterThan(0);
    expect(geometry.bounds.height).toBeGreaterThan(0);
    expect(geometry.nodes[map.rootId].x).toBe(map.nodes[map.rootId].x);
    const placed = instantiateMindmapTemplateAt(map, { x: 400, y: 300 });
    expect(rootPoint(placed)).toEqual({ x: 400, y: 300 });
    expect(placed.id).not.toBe(map.id);
    expect(placed.order.every(id => !map.nodes[id])).toBe(true);
    expect(branchIds(placed)).toHaveLength(3);
  });

  it.each(MINDMAP_LAYOUT_PRESETS)("preserves the root anchor through $family/$direction structural edits", ({ family, direction }) => {
    const map = createMindmapTemplateObject(150, 190, family, direction);
    const branch = branchIds(map)[0];
    const baseline = structuredClone(map);
    let edited = addMindmapNode(map, branch);
    edited = addMindmapParent(edited, branch, "parent");
    edited = toggleMindmapNode(edited, branch);
    expect(rootPoint(edited)).toEqual(rootPoint(map));
    expect(map).toEqual(baseline);
    expect(removeMindmapNode(map, map.rootId)).toBe(map);
  });

  it("removes a complete subtree and prevents hidden-node navigation and cyclic reparenting", () => {
    let map = createMindmapTemplateObject();
    const branch = branchIds(map)[0];
    map = addMindmapNode(map, branch);
    const descendant = map.order.at(-1)!;
    expect(validMindmapDropTargetIds(map, branch)).not.toContain(descendant);
    expect(moveMindmapNodeAt(map, branch, { parentId: descendant })).toBe(map);
    const collapsed = toggleMindmapNode(map, branch);
    expect(visibleMindmapNodeIds(collapsed)).not.toContain(descendant);
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const) {
      expect(resolveMindmapNavigationTarget(collapsed, branch, key)).not.toBe(descendant);
    }
    const removed = removeMindmapNode(map, branch);
    expect(removed.nodes[branch]).toBeUndefined();
    expect(removed.nodes[descendant]).toBeUndefined();
    expect(rootPoint(removed)).toEqual(rootPoint(map));
  });

  it("reorders whole subtrees and retains a manually placed node across relayout", () => {
    let map = createMindmapTemplateObject();
    const [first, second, third] = branchIds(map);
    map = addMindmapNode(map, first);
    const descendant = map.order.at(-1)!;
    const moved = moveMindmapNodeAt(map, first, { parentId: map.rootId, siblingId: third, position: "after" });
    expect(branchIds(moved)).toEqual([second, third, first]);
    expect(moved.nodes[descendant].parentId).toBe(first);
    const positioned = moveMindmapNodePosition(moved, first, 720, 350);
    const world = { x: positioned.x + positioned.nodes[first].x!, y: positioned.y + positioned.nodes[first].y! };
    const relaid = layoutMindmap(positioned);
    expect({ x: relaid.x + relaid.nodes[first].x!, y: relaid.y + relaid.nodes[first].y! }).toEqual(world);
  });

  it("copies a styled subtree into a differently scaled map with fresh node identities", () => {
    let source = createMindmapTemplateObject();
    const branch = branchIds(source)[0];
    source = addMindmapNode(source, branch, "child", "descendant");
    source.nodes[branch] = { ...source.nodes[branch], color: "#f00", summary: "description", fontSize: 16, imageAssetId: "image", imageWidth: 72, imageHeight: 48 };
    const clipboard = copyMindmapBranch(source, branch)!;
    let target = createMindmapTemplateObject();
    target = scaleMindmapForTransform(target, { x: target.x, y: target.y, width: target.width * 2, height: target.height * 2, rotation: 0 });
    const pasted = pasteMindmapBranch(target, target.rootId, clipboard)!;
    const root = pasted.object.nodes[pasted.rootNodeId];
    expect(root.parentId).toBe(target.rootId);
    expect(root.color).toBe("#f00");
    expect(root.summary).toBe("description");
    expect(root.fontSize).toBe(32);
    expect(root.imageWidth).toBe(144);
    expect(Object.values(pasted.nodeIdMap).every(id => !source.nodes[id])).toBe(true);
    expect(childrenOf(pasted.object, pasted.rootNodeId)[0].label).toBe("descendant");
  });

  it("shares automatic text, description and four-way image geometry without layout overlap", () => {
    const node = { label: "explicit\nline break", summary: "description", imageAssetId: "image", imageWidth: 64, imageHeight: 48 };
    for (const placement of ["top", "right", "bottom", "left"] as const) {
      const content = resolveMindmapNodeContentGeometry({ ...node, imagePlacement: placement });
      expect(content.image).toBeDefined();
      expect(content.summary!.y).toBeGreaterThanOrEqual(content.height);
      const text = content.text;
      const image = content.image!;
      expect(image.x + image.width <= text.x || text.x + text.width <= image.x || image.y + image.height <= text.y || text.y + text.height <= image.y).toBe(true);
    }
    const size = resolveMindmapNodeInitialImageSize(1200, 800);
    expect(size.width).toBe(96);
    expect(size.height).toBe(64);
    expect(resolveMindmapNodeAutoSize({ label: "one\ntwo" }).height).toBeGreaterThan(resolveMindmapNodeAutoSize({ label: "one" }).height);
  });

  it("resizes embedded images while preserving the root anchor", () => {
    let map = createMindmapTemplateObject();
    const branch = branchIds(map)[0];
    map.nodes[branch] = { ...map.nodes[branch], imageAssetId: "image", imageWidth: 60, imageHeight: 40 };
    map = layoutMindmap(map);
    const resized = resizeMindmapNodeImage(map, branch, 120, 80);
    expect(rootPoint(resized)).toEqual(rootPoint(map));
    expect(resized.nodes[branch].imageWidth).toBe(120);
    expect(resized.nodes[branch].imageHeight).toBe(80);
  });

  it("keeps all mutations disabled in read-only and locked states", () => {
    for (const mode of [{ editable: false }, { editable: true, locked: true }]) {
      const affordances = resolveMindmapNodeAffordances({ family: "mindmap", direction: "right", isRoot: false, depth: 1, hasChildren: true, collapsed: true, ...mode });
      expect(affordances.actions.expand).toBe(false);
      expect(affordances.actions.addChild).toBe(false);
      expect(affordances.collapseControl.enabled).toBe(false);
      expect(affordances.quickCreatePorts).toHaveLength(0);
    }
  });

  it("normalizes malformed imported identities and parent cycles without mutating input", () => {
    const map = createMindmapTemplateObject();
    const [first, second] = branchIds(map);
    map.nodes[first].parentId = second;
    map.nodes[second].parentId = first;
    map.order = [first, first, "missing"];
    const original = structuredClone(map);
    const normalized = normalizeMindmapObject(map);
    expect(map).toEqual(original);
    expect(new Set(normalized.order).size).toBe(normalized.order.length);
    expect(visibleMindmapNodeIds(normalized)).toHaveLength(4);
  });

  it("resolves quick creation and shape paths using only semantic canvas data", () => {
    const map = createMindmapTemplateObject(40, 60, "mindmap", "both");
    const result = addMindmapNodeFromPort(map, map.rootId, "left");
    const created = result.order.find(id => !map.nodes[id])!;
    expect(result.nodes[created].branchSide).toBe("left");
    expect(shapePathData("triangle", 120, 60)).toContain("M");
  });
});
