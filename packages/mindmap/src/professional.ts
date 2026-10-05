import type {
  MindmapBoundary,
  MindmapObject,
  MindmapRelation,
  MindmapSummary,
} from "./types";
import type {
  MindmapBounds,
  MindmapGeometryResult,
  MindmapNodeGeometry,
  MindmapPoint,
} from "./mindmap";
import { measureMindmapText } from "./text";
import { roundedPolylinePathData } from "./geometry";
import { buildMindmapTreeIndex } from "./tree";

export interface MindmapProfessionalPath {
  id: string;
  type: "summary" | "boundary" | "relation";
  path: string;
  bounds: MindmapBounds;
  label?: string;
  labelBounds?: MindmapBounds;
  color: string;
  fill?: string;
  lineStyle: "solid" | "dash" | "dot";
  startArrow?: boolean;
  endArrow?: boolean;
  startArrowPath?: string;
  endArrowPath?: string;
  source?: MindmapPoint;
  target?: MindmapPoint;
}
export interface MindmapProfessionalGeometry {
  summaries: MindmapProfessionalPath[];
  boundaries: MindmapProfessionalPath[];
  relations: MindmapProfessionalPath[];
}
export type MindmapProfessionalObject =
  | MindmapSummary
  | MindmapBoundary
  | MindmapRelation;
export interface MindmapProfessionalEditResult<
  T extends MindmapProfessionalObject
> {
  status: "changed" | "noop" | "conflict" | "missing";
  value?: T;
  changedKeys: (keyof T)[];
}
/**
 * Rebase an existing object's local draft without reviving deleted objects or
 * overwriting unrelated concurrent fields. Hosts validate nodes and permissions.
 * New objects are created explicitly and do not use an editing baseline.
 */
export function resolveMindmapProfessionalEdit<
  T extends MindmapProfessionalObject
>(
  latest: T | undefined,
  baseline: T,
  draft: T
): MindmapProfessionalEditResult<T> {
  if (!latest || latest.id !== baseline.id)
    return { status: "missing", changedKeys: [] };
  if (draft.id !== baseline.id)
    return { status: "conflict", changedKeys: ["id"] };
  const equal = (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right);
  const changedKeys = [
    ...new Set([...Object.keys(baseline), ...Object.keys(draft)]),
  ].filter(
    (key) =>
      key !== "id" && !equal(baseline[key as keyof T], draft[key as keyof T])
  ) as (keyof T)[];
  if (!changedKeys.length)
    return { status: "noop", value: latest, changedKeys };
  if (
    changedKeys.some(
      (key) =>
        !equal(latest[key], baseline[key]) && !equal(latest[key], draft[key])
    )
  )
    return { status: "conflict", changedKeys };
  if (changedKeys.every((key) => equal(latest[key], draft[key])))
    return { status: "noop", value: latest, changedKeys };
  const value = { ...latest } as T;
  for (const key of changedKeys) {
    if (Object.prototype.hasOwnProperty.call(draft, key))
      value[key] = structuredClone(draft[key]);
    else delete value[key];
  }
  return { status: "changed", value, changedKeys };
}
export function isValidMindmapSummary(
  object: MindmapObject,
  summary: Pick<MindmapSummary, "nodeIds">
) {
  const ids = [...new Set(summary.nodeIds)].filter((id) =>
    Boolean(object.nodes[id])
  );
  if (ids.length < 2) return false;
  const parent = object.nodes[ids[0]].parentId;
  if (!parent || ids.some((id) => object.nodes[id].parentId !== parent))
    return false;
  const siblings = buildMindmapTreeIndex(object).children.get(parent) || [];
  const positions = ids.map((id) => siblings.indexOf(id)).sort((a, b) => a - b);
  return (
    positions[positions.length - 1] - positions[0] + 1 === positions.length
  );
}
/** Discard invalid references after every structural command, never during preview-only selection. */
export function normalizeMindmapProfessionalObjects(
  object: MindmapObject
): MindmapObject {
  const nodes = object.nodes;
  const summaries = (object.summaries || [])
    .filter(
      (item) =>
        item && typeof item.id === "string" && Array.isArray(item.nodeIds)
    )
    .map((item) => ({
      ...item,
      nodeIds: [...new Set(item.nodeIds)].filter((id) => Boolean(nodes[id])),
      label: String(item.label || ""),
    }))
    .filter((item) => isValidMindmapSummary(object, item));
  const boundaries = (object.boundaries || [])
    .filter(
      (item) =>
        item && typeof item.id === "string" && Array.isArray(item.nodeIds)
    )
    .map((item) => ({
      ...item,
      nodeIds: [...new Set(item.nodeIds)].filter((id) => Boolean(nodes[id])),
      ...(item.title === undefined ? {} : { title: String(item.title) }),
    }))
    .filter((item) => item.nodeIds.length > 0);
  const relations = (object.relations || []).filter(
    (item) =>
      item &&
      typeof item.id === "string" &&
      nodes[item.sourceId] &&
      nodes[item.targetId] &&
      item.sourceId !== item.targetId
  );
  return {
    ...object,
    ...(object.summaries ? { summaries } : {}),
    ...(object.boundaries ? { boundaries } : {}),
    ...(object.relations ? { relations } : {}),
  };
}
export function remapMindmapProfessionalObjects(
  object: Pick<MindmapObject, "summaries" | "boundaries" | "relations">,
  nodeIdMap: Record<string, string>,
  idFactory: (prefix: string) => string
): Pick<MindmapObject, "summaries" | "boundaries" | "relations"> {
  const inside = (ids: string[]) =>
    ids.length > 0 && ids.every((id) => Boolean(nodeIdMap[id]));
  return {
    summaries: (object.summaries || [])
      .filter((item) => inside(item.nodeIds))
      .map((item) => ({
        ...item,
        id: idFactory("mindmap-summary"),
        nodeIds: item.nodeIds.map((id) => nodeIdMap[id]),
      })),
    boundaries: (object.boundaries || [])
      .filter((item) => inside(item.nodeIds))
      .map((item) => ({
        ...item,
        id: idFactory("mindmap-boundary"),
        nodeIds: item.nodeIds.map((id) => nodeIdMap[id]),
      })),
    relations: (object.relations || [])
      .filter((item) => nodeIdMap[item.sourceId] && nodeIdMap[item.targetId])
      .map((item) => ({
        ...item,
        id: idFactory("mindmap-relation"),
        sourceId: nodeIdMap[item.sourceId],
        targetId: nodeIdMap[item.targetId],
      })),
  };
}
function union(bounds: MindmapBounds[], padding = 0): MindmapBounds {
  if (!bounds.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...bounds.map((b) => b.x)) - padding,
    y = Math.min(...bounds.map((b) => b.y)) - padding;
  return {
    x,
    y,
    width: Math.max(...bounds.map((b) => b.x + b.width)) - x + padding,
    height: Math.max(...bounds.map((b) => b.y + b.height)) - y + padding,
  };
}
function nodeBounds(node: MindmapNodeGeometry): MindmapBounds {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}
function visibleNode(
  object: MindmapObject,
  geometry: MindmapGeometryResult,
  id: string
): MindmapNodeGeometry | undefined {
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    if (geometry.nodes[id]) return geometry.nodes[id];
    seen.add(id);
    id = object.nodes[id]?.parentId || "";
  }
  return undefined;
}
export function resolveMindmapProfessionalGeometry(
  object: MindmapObject,
  geometry: MindmapGeometryResult
): MindmapProfessionalGeometry {
  const scale = object.layoutScale || 1;
  const index = buildMindmapTreeIndex(object);
  const memberBounds = (ids: string[]) => {
    const members = new Set<string>();
    for (const id of ids) {
      const start = index.preorder.indexOf(id);
      if (start >= 0)
        for (const child of index.preorder.slice(
          start,
          index.subtreeEnd.get(id)
        ))
          members.add(child);
    }
    const visible = [...members]
      .map((id) => visibleNode(object, geometry, id))
      .filter((node): node is MindmapNodeGeometry => Boolean(node));
    return union(visible.map(nodeBounds), 12 * scale);
  };
  const boundaries = (object.boundaries || []).map(
    (item): MindmapProfessionalPath => {
      const b = memberBounds(item.nodeIds),
        r = item.shape === "rectangle" ? 0 : 8 * scale;
      const path = `M ${b.x + r} ${b.y} H ${b.x + b.width - r} Q ${
        b.x + b.width
      } ${b.y} ${b.x + b.width} ${b.y + r} V ${b.y + b.height - r} Q ${
        b.x + b.width
      } ${b.y + b.height} ${b.x + b.width - r} ${b.y + b.height} H ${
        b.x + r
      } Q ${b.x} ${b.y + b.height} ${b.x} ${b.y + b.height - r} V ${
        b.y + r
      } Q ${b.x} ${b.y} ${b.x + r} ${b.y} Z`;
      return {
        id: item.id,
        type: "boundary",
        path,
        bounds: b,
        label: item.title,
        labelBounds: item.title
          ? {
              x: b.x + 8 * scale,
              y: b.y - 20 * scale,
              width: Math.max(
                80 * scale,
                measureMindmapText(item.title, 14 * scale)
              ),
              height: 20 * scale,
            }
          : undefined,
        color: item.stroke || "#94a3b8",
        fill: item.fill || "transparent",
        lineStyle: item.lineStyle || "dash",
      };
    }
  );
  const summaries = (object.summaries || []).map(
    (item): MindmapProfessionalPath => {
      const b = memberBounds(item.nodeIds),
        side = visibleNode(object, geometry, item.nodeIds[0])?.side || "right";
      const vertical = side === "left" || side === "right",
        outward = side === "left" || side === "top" ? -1 : 1;
      const baseline = vertical
        ? side === "left"
          ? b.x - 8 * scale
          : b.x + b.width + 8 * scale
        : side === "top"
        ? b.y - 8 * scale
        : b.y + b.height + 8 * scale;
      const tip = baseline + outward * 12 * scale,
        mid = vertical ? b.y + b.height / 2 : b.x + b.width / 2;
      const from = vertical ? b.y : b.x,
        to = vertical ? b.y + b.height : b.x + b.width;
      const coord = (main: number, cross: number) =>
        vertical ? `${main} ${cross}` : `${cross} ${main}`;
      const path =
        item.bracketStyle === "curve"
          ? `M ${coord(baseline, from)} Q ${coord(tip, from)} ${coord(
              tip,
              mid - 6 * scale
            )} Q ${coord(tip + outward * 12 * scale, mid)} ${coord(
              tip,
              mid + 6 * scale
            )} Q ${coord(tip, to)} ${coord(baseline, to)}`
          : `M ${coord(baseline, from)} L ${coord(tip, from)} L ${coord(
              tip,
              mid
            )} L ${coord(tip + outward * 8 * scale, mid)} M ${coord(
              tip,
              mid
            )} L ${coord(tip, to)} L ${coord(baseline, to)}`;
      const labelWidth = Math.max(
          80 * scale,
          measureMindmapText(item.label, 14 * scale)
        ),
        labelHeight = 20 * scale;
      const labelBounds = vertical
        ? {
            x: outward > 0 ? tip + 18 * scale : tip - 18 * scale - labelWidth,
            y: mid - labelHeight / 2,
            width: labelWidth,
            height: labelHeight,
          }
        : {
            x: mid - labelWidth / 2,
            y: outward > 0 ? tip + 12 * scale : tip - 12 * scale - labelHeight,
            width: labelWidth,
            height: labelHeight,
          };
      return {
        id: item.id,
        type: "summary",
        path,
        bounds: union([b, labelBounds]),
        label: item.label,
        labelBounds,
        color: item.color || object.connector || "#64748b",
        lineStyle: item.lineStyle || "solid",
      };
    }
  );
  const relations = (object.relations || [])
    .map((item): MindmapProfessionalPath | undefined => {
      const a = visibleNode(object, geometry, item.sourceId),
        b = visibleNode(object, geometry, item.targetId);
      if (!a || !b || a.id === b.id) return undefined;
      const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
        bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const coincident = bc.x === ac.x && bc.y === ac.y;
      const dx = coincident ? 1 : bc.x - ac.x,
        dy = bc.y - ac.y;
      const factor = (node: MindmapNodeGeometry) =>
        Math.min(
          Math.abs(dx) > 0 ? node.width / 2 / Math.abs(dx) : Infinity,
          Math.abs(dy) > 0 ? node.height / 2 / Math.abs(dy) : Infinity
        );
      const af = factor(a),
        bf = factor(b),
        source = { x: ac.x + dx * af, y: ac.y + dy * af },
        target = { x: bc.x - dx * bf, y: bc.y - dy * bf };
      const mid = {
        x: (source.x + target.x) / 2,
        y: (source.y + target.y) / 2,
      };
      const bend = coincident
        ? 40 * scale
        : Math.min(80 * scale, Math.hypot(dx, dy) / 4);
      const length = Math.hypot(dx, dy) || 1;
      const control = {
        x: mid.x - (dy / length) * bend,
        y: mid.y + (dx / length) * bend,
      };
      const orthogonal =
        item.style === "right-angle" || item.style === "round-angle";
      const points = [
        source.x,
        source.y,
        mid.x,
        source.y,
        mid.x,
        target.y,
        target.x,
        target.y,
      ];
      const path = orthogonal
        ? item.style === "round-angle"
          ? roundedPolylinePathData(points, 8 * scale)
          : `M ${source.x} ${source.y} L ${mid.x} ${source.y} L ${mid.x} ${target.y} L ${target.x} ${target.y}`
        : `M ${source.x} ${source.y} Q ${control.x} ${control.y} ${target.x} ${target.y}`;
      const arrow = (point: MindmapPoint, toward: MindmapPoint) => {
        const angle = Math.atan2(point.y - toward.y, point.x - toward.x),
          length = 8 * scale,
          spread = 4 * scale;
        const back = {
          x: point.x - Math.cos(angle) * length,
          y: point.y - Math.sin(angle) * length,
        };
        return `M ${back.x + Math.sin(angle) * spread} ${
          back.y - Math.cos(angle) * spread
        } L ${point.x} ${point.y} L ${back.x - Math.sin(angle) * spread} ${
          back.y + Math.cos(angle) * spread
        }`;
      };
      const startArrowPath = item.startArrow
        ? arrow(source, orthogonal ? { x: mid.x, y: source.y } : control)
        : undefined;
      const endArrowPath =
        item.endArrow !== false
          ? arrow(target, orthogonal ? { x: mid.x, y: target.y } : control)
          : undefined;
      const labelBounds = item.label
        ? {
            x:
              control.x -
              Math.max(80 * scale, measureMindmapText(item.label, 14 * scale)) /
                2,
            y: control.y - 10 * scale,
            width: Math.max(
              80 * scale,
              measureMindmapText(item.label, 14 * scale)
            ),
            height: 20 * scale,
          }
        : undefined;
      return {
        id: item.id,
        type: "relation",
        path,
        bounds: union([
          {
            x: Math.min(source.x, target.x, control.x),
            y: Math.min(source.y, target.y, control.y),
            width:
              Math.max(source.x, target.x, control.x) -
              Math.min(source.x, target.x, control.x),
            height:
              Math.max(source.y, target.y, control.y) -
              Math.min(source.y, target.y, control.y),
          },
          ...(labelBounds ? [labelBounds] : []),
        ]),
        label: item.label,
        labelBounds,
        color: item.color || object.connector || "#64748b",
        lineStyle: item.lineStyle || "dash",
        source,
        target,
        startArrow: item.startArrow,
        endArrow: item.endArrow !== false,
        startArrowPath,
        endArrowPath,
      };
    })
    .filter((item): item is MindmapProfessionalPath => Boolean(item));
  return { summaries, boundaries, relations };
}
