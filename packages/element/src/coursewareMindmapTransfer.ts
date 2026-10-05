import { pointFrom } from "@excalidraw/math";
import type { LocalPoint } from "@excalidraw/math";
import type { MindmapTransferResult, MindmapExternalRelation } from "@excalidraw/mindmap";
import { Scene } from "./Scene";
import { deepCopyElement } from "./duplicate";
import { updateBoundElements } from "./binding";
import { newArrowElement, newTextElement } from "./newElement";
import { newElementWith } from "./newElementWith";
import { updateCoursewareMindmapElement } from "./coursewareMindmap";
import { getCoursewareMindmap, isCoursewareMindmapElement } from "./coursewareMindmapType";
import { getCoursewareMindmapGeometry } from "./coursewareMindmapGeometry";
import { coursewareMindmapLocalToScene, coursewareMindmapSceneToLocal } from "./coursewareMindmapTransform";
import type { CoursewareMindmapElement } from "./coursewareMindmapType";
import type { ExcalidrawElement, ExcalidrawArrowElement, ExcalidrawRectangleElement, FixedPointBinding } from "./types";

const relationElements = (
  relation: MindmapExternalRelation,
  elements: Map<string, ExcalidrawElement>,
): ExcalidrawElement[] => {
  const source = elements.get(relation.sourceMapId);
  const target = elements.get(relation.targetMapId);
  if (!isCoursewareMindmapElement(source) || !isCoursewareMindmapElement(target)) return [];
  const visibleNode = (element: CoursewareMindmapElement, id: string) => {
    const geometry = getCoursewareMindmapGeometry(element), model = getCoursewareMindmap(element)!;
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (geometry?.nodes[id]) return geometry.nodes[id];
      seen.add(id); id = model.nodes[id]?.parentId || "";
    }
    return undefined;
  };
  const sourceNode = visibleNode(source, relation.sourceId);
  const targetNode = visibleNode(target, relation.targetId);
  if (!sourceNode || !targetNode) return [];
  const sourceCenter = coursewareMindmapLocalToScene(source, { x: sourceNode.x + sourceNode.width / 2, y: sourceNode.y + sourceNode.height / 2 });
  const targetCenter = coursewareMindmapLocalToScene(target, { x: targetNode.x + targetNode.width / 2, y: targetNode.y + targetNode.height / 2 });
  const anchor = (element: CoursewareMindmapElement, node: typeof sourceNode, toward: { x: number; y: number }, nodeId: string) => {
    const local = coursewareMindmapSceneToLocal(element, toward);
    const dx = local.x - node.x - node.width / 2, dy = local.y - node.y - node.height / 2;
    const ratio = Math.min(dx ? node.width / 2 / Math.abs(dx) : Infinity, dy ? node.height / 2 / Math.abs(dy) : Infinity);
    const normalized: [number, number] = Number.isFinite(ratio) ? [0.5 + dx * ratio / node.width, 0.5 + dy * ratio / node.height] : [0.5, 0.5];
    return {
      point: coursewareMindmapLocalToScene(element, { x: node.x + normalized[0] * node.width, y: node.y + normalized[1] * node.height }),
      binding: { elementId: element.id, fixedPoint: normalized, mode: "inside", mindmapNodeId: nodeId, mindmapNodePoint: normalized } as FixedPointBinding,
    };
  };
  const start = anchor(source, sourceNode, targetCenter, relation.sourceId), end = anchor(target, targetNode, sourceCenter, relation.targetId);
  const dx = end.point.x - start.point.x, dy = end.point.y - start.point.y;
  const scale = getCoursewareMindmap(source)?.layoutScale || 1;
  const points = relation.style === "right-angle" || relation.style === "round-angle"
    ? [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(dx / 2, 0), pointFrom<LocalPoint>(dx / 2, dy), pointFrom<LocalPoint>(dx, dy)]
    : [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(dx / 2 - dy / 8, dy / 2 + dx / 8), pointFrom<LocalPoint>(dx, dy)];
  let arrow = newArrowElement({ type: "arrow", x: start.point.x, y: start.point.y, width: Math.abs(dx), height: Math.abs(dy), points,
    strokeColor: relation.color || "#64748b", strokeWidth: 2 * scale, strokeStyle: relation.lineStyle === "dot" ? "dotted" : relation.lineStyle === "dash" ? "dashed" : "solid", roughness: 0,
    roundness: relation.style === "right-angle" ? null : { type: 2 }, startArrowhead: relation.startArrow ? "arrow" : null, endArrowhead: relation.endArrow === false ? null : "arrow",
    customData: { mindmapRelationId: relation.id },
  });
  arrow = { ...arrow, startBinding: start.binding, endBinding: end.binding };
  if (!relation.label) return [arrow];
  const label = newTextElement({ text: relation.label, x: (start.point.x + end.point.x) / 2, y: (start.point.y + end.point.y) / 2, fontSize: 14 * scale, textAlign: "center", verticalAlign: "middle", containerId: arrow.id, strokeColor: arrow.strokeColor });
  arrow = { ...arrow, boundElements: [{ id: label.id, type: "text" }] };
  return [arrow, label];
};

/** Prepare every map, arrow and reverse reference before publishing one host transaction. */
export const createCoursewareMindmapTransferElements = (
  allElements: readonly ExcalidrawElement[],
  transfers: readonly MindmapTransferResult[],
  additions: readonly ExcalidrawRectangleElement[] = [],
): ExcalidrawElement[] => {
  const originals = new Map(allElements.map(element => [element.id, element]));
  const prepared = new Map([...allElements, ...additions].map(element => [element.id, deepCopyElement(element)]));
  const affected = new Set<string>();
  for (const transfer of transfers) {
    for (const model of [transfer.source, transfer.target]) {
      const element = prepared.get(model.id);
      if (!isCoursewareMindmapElement(element)) throw new Error("思维导图移动目标已不存在");
      prepared.set(model.id, updateCoursewareMindmapElement(element, model));
      affected.add(model.id);
    }
    for (const element of prepared.values()) {
      if (element.type !== "arrow" || element.isDeleted) continue;
      const patch: { startBinding?: FixedPointBinding | null; endBinding?: FixedPointBinding | null } = {};
      for (const key of ["startBinding", "endBinding"] as const) {
        const binding = element[key];
        if (!binding?.mindmapNodeId) continue;
        const owner = transfer.ownerChanges.find(change => change.before.mapId === binding.elementId && change.before.nodeId === binding.mindmapNodeId);
        if (owner) patch[key] = { ...binding, elementId: owner.after.mapId, mindmapNodeId: owner.after.nodeId };
      }
      if (Object.keys(patch).length) prepared.set(element.id, newElementWith(element, patch));
    }
  }
  // Relations spanning maps become native externally bound arrows, retaining their text and style.
  for (let index = 0; index < transfers.length; index++) for (const original of transfers[index].externalRelations) {
    const relation = { ...original };
    for (const later of transfers.slice(index + 1)) for (const owner of later.ownerChanges) {
      if (owner.before.mapId === relation.sourceMapId && owner.before.nodeId === relation.sourceId) {
        relation.sourceMapId = owner.after.mapId; relation.sourceId = owner.after.nodeId;
      }
      if (owner.before.mapId === relation.targetMapId && owner.before.nodeId === relation.targetId) {
        relation.targetMapId = owner.after.mapId; relation.targetId = owner.after.nodeId;
      }
    }
    for (const element of relationElements(relation, prepared)) prepared.set(element.id, element);
  }
  // Rebuild both sides from forward bindings; stale and duplicate arrow references cannot survive.
  for (const id of affected) {
    const element = prepared.get(id)!;
    const refs = (element.boundElements || []).filter(ref => ref.type !== "arrow");
    for (const arrow of prepared.values()) if (arrow.type === "arrow" && !arrow.isDeleted && (arrow.startBinding?.elementId === id || arrow.endBinding?.elementId === id)) refs.push({ id: arrow.id, type: "arrow" });
    prepared.set(id, newElementWith(element, { boundElements: [...new Map(refs.map(ref => [ref.id, ref])).values()] }));
  }
  return finalizeCoursewareMindmapElements([...prepared.values()], affected, originals);
};

/** Resolve mutable native bindings on owned records before the host publishes its transaction. */
export const finalizeCoursewareMindmapElements = (
  elements: readonly ExcalidrawElement[],
  affected: ReadonlySet<string>,
  originals = new Map(elements.map(element => [element.id, element])),
): ExcalidrawElement[] => {
  const scene = new Scene(elements.map(deepCopyElement), { skipValidation: true });
  try {
    for (const id of affected) {
      const element = scene.getElement(id);
      if (element && !element.isDeleted) updateBoundElements(element as Exclude<typeof element, null> & { isDeleted: false }, scene);
    }
    return scene.getElementsIncludingDeleted().map(element => {
      const original = originals.get(element.id);
      return original && original.version === element.version && original.versionNonce === element.versionNonce ? original : element;
    });
  } finally {
    scene.destroy();
  }
};
