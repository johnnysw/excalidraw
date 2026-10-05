import type {
  MindmapObject,
  MindmapNode,
  MindmapNodeStyle,
  MindmapSummary,
  MindmapBoundary,
  MindmapRelation,
  MindmapThemeSnapshot,
} from "./types";
import {
  addMindmapNode,
  addMindmapParent,
  createId,
  layoutMindmap,
  mindmapSubtreeNodeIds,
  moveMindmapNodeAt,
  withMindmapLayout,
  type MindmapNodeMoveTarget,
} from "./model";
import { normalizeMindmapSelectionRoots } from "./tree";
import { normalizeMindmapProfessionalObjects } from "./professional";
import { resolveMindmapObjectGeometry } from "./mindmap";
import {
  normalizeMindmapLabelStyleRanges,
  reconcileMindmapTextChange,
} from "./text";
export type MindmapCommand =
  | {
      type: "add";
      anchorId: string;
      relation?: "child" | "sibling" | "parent";
      label?: string;
      nodeId?: string;
    }
  | {
      type: "patch";
      nodeIds: string[];
      patch: Partial<MindmapNode>;
      scope?: "node" | "branch" | "map";
    }
  | { type: "remove"; nodeIds: string[] }
  | { type: "move"; nodeIds: string[]; target: MindmapNodeMoveTarget }
  | { type: "manual-position"; nodeIds: string[]; dx: number; dy: number }
  | { type: "reset-position"; nodeIds?: string[] }
  | { type: "collapse"; nodeIds: string[]; collapsed: boolean }
  | {
      type: "layout";
      family: NonNullable<MindmapObject["layoutFamily"]>;
      direction: NonNullable<MindmapObject["layoutDirection"]>;
    }
  | { type: "theme"; theme: MindmapThemeSnapshot }
  | {
      type: "reset-style";
      nodeIds: string[];
      scope?: "node" | "branch" | "map";
    }
  | { type: "summary"; value: MindmapSummary }
  | { type: "boundary"; value: MindmapBoundary }
  | { type: "relation"; value: MindmapRelation }
  | { type: "remove-professional"; id: string };
export interface MindmapCommandResult {
  object: MindmapObject;
  changed: boolean;
  selectionIds: string[];
  removedNodeIds: string[];
  removedSummaryIds: string[];
  invalidation: "none" | "paint" | "geometry" | "measure" | "layout";
}
const styleKeys: (keyof MindmapNodeStyle)[] = [
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
];
const measurementKeys = [
  "label",
  "summary",
  "shape",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "icon",
  "sticker",
  "imageAssetId",
  "imageWidth",
  "imageHeight",
  "imagePlacement",
  "widthMode",
  "textMaxWidth",
];
const professionalGeometryChanged = <T extends { id: string }>(
  before: T | undefined,
  after: T,
  keys: (keyof T)[]
) =>
  !before ||
  keys.some(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );

/** Reframe professional content around saved nodes without measuring or laying out the tree. */
function updateMindmapProfessionalBounds(object: MindmapObject): MindmapObject {
  const bounds = resolveMindmapObjectGeometry(object, { padding: 0 }).bounds;
  const scale = object.layoutScale || 1;
  const padding = 24 * scale;
  const offsetX = bounds.x - padding,
    offsetY = bounds.y - padding;
  return {
    ...object,
    x: object.x + offsetX,
    y: object.y + offsetY,
    width: Math.max(192 * scale, bounds.width + padding * 2),
    height: Math.max(92 * scale, bounds.height + padding * 2),
    nodes:
      offsetX || offsetY
        ? Object.fromEntries(
            Object.entries(object.nodes).map(([id, node]) => [
              id,
              {
                ...node,
                x: (node.x || 0) - offsetX,
                y: (node.y || 0) - offsetY,
              },
            ])
          )
        : object.nodes,
  };
}
/** One pure semantic command. Host history and saving see only the returned final model. */
export function applyMindmapCommand(
  object: MindmapObject,
  command: MindmapCommand
): MindmapCommandResult {
  let next = object;
  let selectionIds: string[] = [];
  let invalidation: MindmapCommandResult["invalidation"] = "layout";
  if (object.locked)
    return {
      object,
      changed: false,
      selectionIds,
      removedNodeIds: [],
      removedSummaryIds: [],
      invalidation: "none",
    };
  const ids = ("nodeIds" in command ? command.nodeIds || [] : []).filter((id) =>
    Boolean(object.nodes[id])
  );
  const affected = (scope?: "node" | "branch" | "map") =>
    scope === "map"
      ? [...object.order]
      : scope === "branch"
      ? [...new Set(ids.flatMap((id) => mindmapSubtreeNodeIds(object, id)))]
      : ids;
  switch (command.type) {
    case "add": {
      if (!object.nodes[command.anchorId]) break;
      next =
        command.relation === "parent"
          ? addMindmapParent(object, command.anchorId, command.label)
          : addMindmapNode(
              object,
              command.anchorId,
              command.relation || "child",
              command.label || "主题"
            );
      const generated = Object.keys(next.nodes).find((id) => !object.nodes[id]);
      if (
        generated &&
        command.nodeId &&
        generated !== command.nodeId &&
        !object.nodes[command.nodeId]
      ) {
        const nodes = {
          ...next.nodes,
          [command.nodeId]: { ...next.nodes[generated], id: command.nodeId },
        };
        delete nodes[generated];
        for (const [id, node] of Object.entries(nodes))
          if (node.parentId === generated)
            nodes[id] = { ...node, parentId: command.nodeId };
        next = {
          ...next,
          nodes,
          order: next.order.map((id) =>
            id === generated ? command.nodeId! : id
          ),
        };
      }
      selectionIds = generated
        ? [
            command.nodeId && !object.nodes[command.nodeId]
              ? command.nodeId
              : generated,
          ]
        : [];
      break;
    }
    case "patch": {
      const targets = affected(command.scope);
      const patch = { ...command.patch };
      delete patch.id;
      delete patch.parentId;
      const nodes = { ...object.nodes };
      let changed = false;
      let rangesMeasured = false;
      for (const id of targets) {
        const node = nodes[id];
        const clearsLocalFormatting =
          !patch.labelStyleRanges &&
          node.labelStyleRanges?.some(
            (range) =>
              ("color" in patch && range.color !== undefined) ||
              ("fontWeight" in patch && range.bold !== undefined) ||
              ("fontStyle" in patch && range.italic !== undefined) ||
              ("textDecoration" in patch &&
                (range.underline !== undefined ||
                  range.strikethrough !== undefined))
          );
        if (
          !clearsLocalFormatting &&
          Object.entries(patch).every(
            ([key, value]) =>
              JSON.stringify(node[key as keyof MindmapNode]) ===
              JSON.stringify(value)
          )
        )
          continue;
        if (
          patch.labelStyleRanges &&
          JSON.stringify(
            node.labelStyleRanges?.map((r) => [
              r.start,
              r.end,
              r.bold,
              r.italic,
            ])
          ) !==
            JSON.stringify(
              patch.labelStyleRanges.map((r) => [
                r.start,
                r.end,
                r.bold,
                r.italic,
              ])
            )
        )
          rangesMeasured = true;
        let merged = { ...node, ...patch };
        if (
          patch.label !== undefined &&
          !patch.labelStyleRanges &&
          node.labelStyleRanges
        )
          merged.labelStyleRanges = reconcileMindmapTextChange(
            node.label,
            patch.label,
            node.labelStyleRanges
          ).labelStyleRanges;
        if (!patch.labelStyleRanges && node.labelStyleRanges) {
          const removals: string[] = [];
          if ("color" in patch) removals.push("color");
          if ("fontWeight" in patch) removals.push("bold");
          if ("fontStyle" in patch) removals.push("italic");
          if ("textDecoration" in patch)
            removals.push("underline", "strikethrough");
          if (removals.length)
            merged.labelStyleRanges = normalizeMindmapLabelStyleRanges(
              merged.label,
              (merged.labelStyleRanges || []).map((range) => {
                const value = { ...range };
                for (const key of removals)
                  delete (value as unknown as Record<string, unknown>)[key];
                return value;
              })
            );
        }
        if (patch.labelStyleRanges || patch.label !== undefined)
          merged = {
            ...merged,
            labelStyleRanges: normalizeMindmapLabelStyleRanges(
              merged.label,
              merged.labelStyleRanges
            ),
          };
        if (patch.label !== undefined && !merged.widthMode)
          merged = {
            ...merged,
            widthMode: "auto",
            textMaxWidth: 320 * (object.layoutScale || 1),
          };
        if (rangesMeasured || measurementKeys.some((key) => key in patch)) {
          merged = { ...merged, width: undefined, height: undefined };
        }
        nodes[id] = merged;
        changed = true;
      }
      if (command.scope === "branch" || command.scope === "map") {
        const inherited: MindmapNodeStyle = {};
        for (const key of styleKeys)
          if (key in patch)
            (inherited as Record<string, unknown>)[key] = patch[key];
        if (Object.keys(inherited).length)
          for (const root of command.scope === "map"
            ? [object.rootId]
            : normalizeMindmapSelectionRoots(object, ids)) {
            nodes[root] = {
              ...nodes[root],
              branchStyleOverrides: {
                ...nodes[root].branchStyleOverrides,
                ...inherited,
              },
            };
            changed = true;
          }
      }
      invalidation =
        rangesMeasured || measurementKeys.some((key) => key in patch)
          ? "measure"
          : "paint";
      next = changed ? { ...object, nodes } : object;
      selectionIds = ids;
      break;
    }
    case "remove": {
      const removed = new Set(
        normalizeMindmapSelectionRoots(object, ids)
          .filter((id) => id !== object.rootId)
          .flatMap((id) => mindmapSubtreeNodeIds(object, id))
      );
      if (removed.size) {
        next = {
          ...object,
          nodes: Object.fromEntries(
            Object.entries(object.nodes).filter(([id]) => !removed.has(id))
          ),
          order: object.order.filter((id) => !removed.has(id)),
        };
        selectionIds = [object.rootId];
      }
      break;
    }
    case "move": {
      const roots = normalizeMindmapSelectionRoots(object, ids);
      let target = command.target;
      if (
        roots.some((id) =>
          mindmapSubtreeNodeIds(object, id).includes(target.parentId)
        )
      )
        break;
      const professional = {
        summaries: object.summaries,
        boundaries: object.boundaries,
        relations: object.relations,
      };
      next = { ...object, summaries: [], boundaries: [], relations: [] };
      for (const id of roots) {
        next = moveMindmapNodeAt(next, id, target);
        target = { ...target, siblingId: id, position: "after" };
      }
      next = { ...next, ...professional };
      selectionIds = roots;
      break;
    }
    case "manual-position": {
      if (!Number.isFinite(command.dx) || !Number.isFinite(command.dy)) break;
      if (command.dx === 0 && command.dy === 0) break;
      const targets = [
        ...new Set(
          normalizeMindmapSelectionRoots(object, ids).flatMap((id) =>
            mindmapSubtreeNodeIds(object, id)
          )
        ),
      ];
      next = { ...object, nodes: { ...object.nodes } };
      for (const id of targets)
        next.nodes[id] = {
          ...next.nodes[id],
          x: (next.nodes[id].x || 0) + command.dx,
          y: (next.nodes[id].y || 0) + command.dy,
          positionLocked: true,
        };
      selectionIds = ids;
      break;
    }
    case "reset-position": {
      next = { ...object, nodes: { ...object.nodes } };
      const targets = command.nodeIds?.length
        ? affected("branch")
        : object.order;
      for (const id of targets)
        next.nodes[id] = { ...next.nodes[id], positionLocked: false };
      selectionIds = ids;
      break;
    }
    case "collapse": {
      next = { ...object, nodes: { ...object.nodes } };
      for (const id of ids)
        next.nodes[id] = { ...next.nodes[id], collapsed: command.collapsed };
      selectionIds = ids;
      break;
    }
    case "layout":
      next = withMindmapLayout(object, command.family, command.direction);
      break;
    case "theme":
      next = {
        ...object,
        theme: structuredClone(command.theme),
        connector: command.theme.connector,
      };
      break;
    case "reset-style": {
      next = { ...object, nodes: { ...object.nodes } };
      for (const id of affected(command.scope)) {
        const node = { ...next.nodes[id] };
        for (const key of styleKeys) delete node[key];
        delete node.branchStyleOverrides;
        delete node.labelStyleRanges;
        node.width = undefined;
        node.height = undefined;
        next.nodes[id] = node;
      }
      selectionIds = ids;
      invalidation = "measure";
      break;
    }
    case "summary": {
      const items = object.summaries || [];
      invalidation = professionalGeometryChanged(
        items.find((item) => item.id === command.value.id),
        command.value,
        ["nodeIds", "label", "bracketStyle"]
      )
        ? "geometry"
        : "paint";
      next = {
        ...object,
        summaries: [
          ...items.filter((item) => item.id !== command.value.id),
          structuredClone(command.value),
        ],
      };
      break;
    }
    case "boundary": {
      const items = object.boundaries || [];
      invalidation = professionalGeometryChanged(
        items.find((item) => item.id === command.value.id),
        command.value,
        ["nodeIds", "title", "shape"]
      )
        ? "geometry"
        : "paint";
      next = {
        ...object,
        boundaries: [
          ...items.filter((item) => item.id !== command.value.id),
          structuredClone(command.value),
        ],
      };
      break;
    }
    case "relation": {
      const items = object.relations || [];
      invalidation = professionalGeometryChanged(
        items.find((item) => item.id === command.value.id),
        command.value,
        ["sourceId", "targetId", "label", "style", "startArrow", "endArrow"]
      )
        ? "geometry"
        : "paint";
      next = {
        ...object,
        relations: [
          ...items.filter((item) => item.id !== command.value.id),
          structuredClone(command.value),
        ],
      };
      break;
    }
    case "remove-professional":
      if (
        ![
          ...(object.summaries || []),
          ...(object.boundaries || []),
          ...(object.relations || []),
        ].some((item) => item.id === command.id)
      )
        break;
      invalidation = "geometry";
      next = {
        ...object,
        summaries: object.summaries?.filter((item) => item.id !== command.id),
        boundaries: object.boundaries?.filter((item) => item.id !== command.id),
        relations: object.relations?.filter((item) => item.id !== command.id),
      };
      break;
  }
  if (next !== object) {
    next = normalizeMindmapProfessionalObjects(next);
    if (invalidation === "geometry")
      next = updateMindmapProfessionalBounds(next);
    // Manual positioning translates saved geometry. Re-running automatic layout here
    // would resize untouched legacy nodes and move unrelated branches.
    else if (invalidation !== "paint" && command.type !== "manual-position")
      next = layoutMindmap(next);
  }
  const changed =
    next !== object && JSON.stringify(next) !== JSON.stringify(object);
  if (!changed) next = object;
  return {
    object: next,
    changed,
    selectionIds,
    removedNodeIds: object.order.filter((id) => !next.nodes[id]),
    removedSummaryIds: (object.summaries || [])
      .filter(
        (item) => !(next.summaries || []).some((after) => after.id === item.id)
      )
      .map((item) => item.id),
    invalidation: changed ? invalidation : "none",
  };
}
export interface MindmapNodeOwnerChange {
  before: { mapId: string; nodeId: string };
  after: { mapId: string; nodeId: string };
}
export interface MindmapExternalRelation extends MindmapRelation {
  sourceMapId: string;
  targetMapId: string;
}
export interface MindmapTransferResult {
  source: MindmapObject;
  target: MindmapObject;
  nodeIdMap: Record<string, string>;
  ownerChanges: MindmapNodeOwnerChange[];
  externalRelations: MindmapExternalRelation[];
  movedRootIds: string[];
}
/** Moves without deleting resources or regenerating nonconflicting IDs. */
export function moveMindmapBranchesBetween(
  source: MindmapObject,
  target: MindmapObject,
  nodeIds: readonly string[],
  destination: MindmapNodeMoveTarget
): MindmapTransferResult | undefined {
  if (
    source.locked ||
    target.locked ||
    !target.nodes[destination.parentId] ||
    (destination.siblingId &&
      target.nodes[destination.siblingId]?.parentId !== destination.parentId)
  )
    return undefined;
  if (source.id === target.id) {
    const result = applyMindmapCommand(source, {
      type: "move",
      nodeIds: [...nodeIds],
      target: destination,
    });
    return {
      source: result.object,
      target: result.object,
      nodeIdMap: {},
      ownerChanges: [],
      externalRelations: [],
      movedRootIds: result.selectionIds,
    };
  }
  const roots = normalizeMindmapSelectionRoots(source, nodeIds).filter(
    (id) => id !== source.rootId
  );
  if (!roots.length) return undefined;
  const movedIds = [
      ...new Set(roots.flatMap((id) => mindmapSubtreeNodeIds(source, id))),
    ],
    moved = new Set(movedIds),
    rootSet = new Set(roots);
  const nodeIdMap = Object.fromEntries(
    movedIds.map((id) => [id, target.nodes[id] ? createId("mindmap-node") : id])
  );
  const scale = (target.layoutScale || 1) / (source.layoutScale || 1);
  const donorNodes = Object.fromEntries(
    Object.entries(source.nodes).filter(([id]) => !moved.has(id))
  );
  const receiverNodes = { ...target.nodes };
  for (const id of movedIds) {
    const original = source.nodes[id],
      node = {
        ...structuredClone(original),
        id: nodeIdMap[id],
        parentId: rootSet.has(id)
          ? destination.parentId
          : nodeIdMap[original.parentId!] || destination.parentId,
        positionLocked: false,
      };
    for (const key of [
      "width",
      "height",
      "x",
      "y",
      "fontSize",
      "strokeWidth",
      "imageWidth",
      "imageHeight",
      "textMaxWidth",
    ] as const) {
      const value = original[key];
      if (value !== undefined)
        (node as unknown as Record<string, unknown>)[key] = value * scale;
    }
    if (original.branchStyleOverrides)
      node.branchStyleOverrides = {
        ...original.branchStyleOverrides,
        ...(original.branchStyleOverrides.fontSize !== undefined
          ? { fontSize: original.branchStyleOverrides.fontSize * scale }
          : {}),
        ...(original.branchStyleOverrides.strokeWidth !== undefined
          ? { strokeWidth: original.branchStyleOverrides.strokeWidth * scale }
          : {}),
      };
    receiverNodes[node.id] = node;
  }
  const externalRelations: MindmapExternalRelation[] = [];
  const movedProfessional = <T extends MindmapSummary | MindmapBoundary>(
    items: T[] | undefined
  ) =>
    (items || [])
      .filter((item) => item.nodeIds.every((id) => moved.has(id)))
      .map((item) => ({
        ...structuredClone(item),
        nodeIds: item.nodeIds.map((id) => nodeIdMap[id]),
        id: [...(target.summaries || []), ...(target.boundaries || [])].some(
          (other) => other.id === item.id
        )
          ? createId("mindmap-object")
          : item.id,
      }));
  const movedSummaries = movedProfessional(source.summaries),
    movedBoundaries = movedProfessional(source.boundaries);
  const movedRelations = (source.relations || [])
    .filter((item) => moved.has(item.sourceId) && moved.has(item.targetId))
    .map((item) => ({
      ...item,
      id: (target.relations || []).some((other) => other.id === item.id)
        ? createId("mindmap-relation")
        : item.id,
      sourceId: nodeIdMap[item.sourceId],
      targetId: nodeIdMap[item.targetId],
    }));
  for (const relation of source.relations || [])
    if (moved.has(relation.sourceId) !== moved.has(relation.targetId))
      externalRelations.push({
        ...relation,
        sourceId: nodeIdMap[relation.sourceId] || relation.sourceId,
        targetId: nodeIdMap[relation.targetId] || relation.targetId,
        sourceMapId: moved.has(relation.sourceId) ? target.id : source.id,
        targetMapId: moved.has(relation.targetId) ? target.id : source.id,
      });
  let donor = layoutMindmap(
    normalizeMindmapProfessionalObjects({
      ...source,
      nodes: donorNodes,
      order: source.order.filter((id) => !moved.has(id)),
    })
  );
  let receiver: MindmapObject = {
    ...target,
    nodes: receiverNodes,
    order: [...target.order, ...movedIds.map((id) => nodeIdMap[id])],
    summaries: [...(target.summaries || []), ...movedSummaries],
    boundaries: [...(target.boundaries || []), ...movedBoundaries],
    relations: [...(target.relations || []), ...movedRelations],
  };
  const professional = {
    summaries: receiver.summaries,
    boundaries: receiver.boundaries,
    relations: receiver.relations,
  };
  receiver = { ...receiver, summaries: [], boundaries: [], relations: [] };
  let dest = destination;
  for (const id of roots) {
    receiver = moveMindmapNodeAt(receiver, nodeIdMap[id], dest);
    dest = { ...destination, siblingId: nodeIdMap[id], position: "after" };
  }
  receiver = layoutMindmap(
    normalizeMindmapProfessionalObjects({ ...receiver, ...professional })
  );
  return {
    source: donor,
    target: receiver,
    nodeIdMap,
    ownerChanges: movedIds.map((id) => ({
      before: { mapId: source.id, nodeId: id },
      after: { mapId: target.id, nodeId: nodeIdMap[id] },
    })),
    externalRelations,
    movedRootIds: roots.map((id) => nodeIdMap[id]),
  };
}
/** A split keeps node identities and map-level transform; host positions the root at its world drop point. */
export function splitMindmapBranches(
  source: MindmapObject,
  nodeIds: readonly string[],
  newMapId = createId("mindmap")
): MindmapTransferResult | undefined {
  const roots = normalizeMindmapSelectionRoots(source, nodeIds).filter(
    (id) => id !== source.rootId
  );
  if (!roots.length || source.locked) return undefined;
  const rootId = createId("mindmap-node");
  const target: MindmapObject = {
    ...source,
    id: newMapId,
    rootId,
    nodes: {
      [rootId]: {
        id: rootId,
        parentId: null,
        label: "中心主题",
        widthMode: "auto",
        textMaxWidth: 320 * (source.layoutScale || 1),
      },
    },
    order: [rootId],
    summaries: [],
    boundaries: [],
    relations: [],
  };
  const result = moveMindmapBranchesBetween(source, target, roots, {
    parentId: rootId,
  });
  if (!result) return undefined;
  if (roots.length === 1) {
    const promoted = result.movedRootIds[0];
    const nodes = {
      ...result.target.nodes,
      [promoted]: { ...result.target.nodes[promoted], parentId: null },
    };
    delete nodes[rootId];
    result.target = layoutMindmap({
      ...result.target,
      rootId: promoted,
      nodes,
      order: result.target.order.filter((id) => id !== rootId),
    });
  }
  return result;
}
export function mergeMindmapInto(
  source: MindmapObject,
  target: MindmapObject,
  parentId: string
): MindmapTransferResult | undefined {
  if (
    source.id === target.id ||
    source.locked ||
    target.locked ||
    !target.nodes[parentId]
  )
    return undefined;
  // Temporarily attach the source root beneath an empty donor root so transfer preserves every ID.
  const donorRoot = createId("mindmap-node");
  const donor: MindmapObject = {
    ...source,
    rootId: donorRoot,
    nodes: {
      ...source.nodes,
      [source.rootId]: { ...source.nodes[source.rootId], parentId: donorRoot },
      [donorRoot]: { id: donorRoot, parentId: null, label: "中心主题" },
    },
    order: [donorRoot, ...source.order],
  };
  return moveMindmapBranchesBetween(donor, target, [source.rootId], {
    parentId,
  });
}
/** Paste a portable forest. Unlike move, every node and professional object gets a fresh identity. */
export function pasteMindmapExchangeBranches(
  target: MindmapObject,
  parentId: string,
  source: MindmapObject,
  rootNodeIds: readonly string[] = [source.rootId],
  insertion?: Pick<MindmapNodeMoveTarget, "siblingId" | "position">
): MindmapTransferResult | undefined {
  const cloneIds = Object.fromEntries(
    Object.keys(source.nodes).map((id) => [id, createId("mindmap-node")])
  );
  const nodes = Object.fromEntries(
    Object.entries(source.nodes).map(([id, node]) => [
      cloneIds[id],
      {
        ...structuredClone(node),
        id: cloneIds[id],
        parentId: node.parentId ? cloneIds[node.parentId] : null,
      },
    ])
  );
  const sourceRootId = cloneIds[source.rootId];
  const clone: MindmapObject = {
    ...structuredClone(source),
    id: createId("mindmap-copy"),
    rootId: sourceRootId,
    nodes,
    order: source.order.map((id) => cloneIds[id]),
    summaries: source.summaries?.map((item) => ({
      ...item,
      id: createId("mindmap-summary"),
      nodeIds: item.nodeIds.map((id) => cloneIds[id]),
    })),
    boundaries: source.boundaries?.map((item) => ({
      ...item,
      id: createId("mindmap-boundary"),
      nodeIds: item.nodeIds.map((id) => cloneIds[id]),
    })),
    relations: source.relations?.map((item) => ({
      ...item,
      id: createId("mindmap-relation"),
      sourceId: cloneIds[item.sourceId],
      targetId: cloneIds[item.targetId],
    })),
    locked: false,
  };
  let donor = clone;
  const roots = rootNodeIds.map((id) => cloneIds[id]).filter(Boolean);
  if (roots.includes(sourceRootId)) {
    const artificial = createId("mindmap-node");
    donor = {
      ...clone,
      rootId: artificial,
      nodes: {
        ...clone.nodes,
        [sourceRootId]: { ...clone.nodes[sourceRootId], parentId: artificial },
        [artificial]: { id: artificial, parentId: null, label: "中心主题" },
      },
      order: [artificial, ...clone.order],
    };
  }
  const result = moveMindmapBranchesBetween(donor, target, roots, {
    parentId,
    ...insertion,
  });
  if (!result) return undefined;
  result.nodeIdMap = Object.fromEntries(
    Object.entries(cloneIds)
      .filter(([, id]) => result.nodeIdMap[id])
      .map(([id, cloneId]) => [id, result.nodeIdMap[cloneId]])
  );
  result.ownerChanges = [];
  result.externalRelations = [];
  return result;
}
