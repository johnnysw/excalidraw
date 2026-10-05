import { buildMindmapTreeIndex } from "./tree";
import { normalizeMindmapLabelStyleRanges } from "./text";
import { normalizeMindmapProfessionalObjects, remapMindmapProfessionalObjects } from "./professional";
import type { MindmapObstacleObject, WhiteboardConnectorPort, WhiteboardMindmapNode, WhiteboardMindmapObject, MindmapBranchStyle, MindmapLayoutDirection, MindmapLayoutFamily } from './types';
import { inverseTransformRectanglePoint, transformRectanglePoint, transformedRectangleBounds, type RectangleBounds } from './geometry';
import { isShapeKind } from './shapeGeometry';
import { isMindmapNodeImagePlacement, resolveMindmapFontSize, resolveMindmapLayoutScale, resolveMindmapNodeContentGeometry, resolveMindmapNodeImageSize, resolveMindmapNodeVisualStyle, resolveMindmapObjectGeometry, type MindmapBranchPathDescriptor, type MindmapNodeGeometry } from './mindmap';

export function createId(prefix = "object"): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

/** The legacy field is kept as the wire-compatible representation. */
export const MINDMAP_LAYOUT_PRESETS: ReadonlyArray<{
  family: MindmapLayoutFamily;
  direction: MindmapLayoutDirection;
  legacy: WhiteboardMindmapObject["layout"];
}> = [
  { family: "mindmap", direction: "right", legacy: "right" },
  { family: "mindmap", direction: "left", legacy: "left" },
  { family: "mindmap", direction: "both", legacy: "both" },
  { family: "mindmap", direction: "top-down", legacy: "top-down" },
  { family: "tree", direction: "right", legacy: "right" },
  { family: "tree", direction: "left", legacy: "left" },
  { family: "tree", direction: "both", legacy: "both" },
  { family: "timeline", direction: "horizontal", legacy: "right" },
  { family: "timeline", direction: "vertical", legacy: "top-down" },
];

export interface ResolvedMindmapLayout {
  family: MindmapLayoutFamily;
  direction: MindmapLayoutDirection;
}

/**
 * Resolves a layout from either the new family/direction pair or a legacy
 * four-value `layout`. Invalid combinations intentionally fall back to a
 * normal right-facing mind map.
 */
export function resolveMindmapLayout(
  object: Pick<
    WhiteboardMindmapObject,
    "layout" | "layoutFamily" | "layoutDirection"
  >
): ResolvedMindmapLayout {
  const family = object.layoutFamily;
  const direction = object.layoutDirection;
  if (family === "timeline") {
    return {
      family,
      direction: direction === "vertical" ? "vertical" : "horizontal",
    };
  }
  if (family === "tree") {
    return {
      family,
      direction:
        direction === "left" || direction === "both" ? direction : "right",
    };
  }
  if (
    family === "mindmap" &&
    (direction === "right" ||
      direction === "left" ||
      direction === "both" ||
      direction === "top-down")
  ) {
    return { family, direction };
  }
  const legacy = object.layout;
  return {
    family: "mindmap",
    direction:
      legacy === "left" || legacy === "both" || legacy === "top-down"
        ? legacy
        : "right",
  };
}

/** Returns a copy with both the new layout fields and legacy field updated. */
export function withMindmapLayout(
  object: WhiteboardMindmapObject,
  family: MindmapLayoutFamily,
  direction: MindmapLayoutDirection
): WhiteboardMindmapObject {
  const legacy: WhiteboardMindmapObject["layout"] =
    direction === "top-down" || direction === "vertical"
      ? "top-down"
      : direction === "left" || direction === "right" || direction === "both"
      ? direction
      : family === "timeline"
      ? "right"
      : "right";
  return {
    ...object,
    layout: legacy,
    layoutFamily: family,
    layoutDirection: direction,
    // Choosing a layout is an explicit reset of manual node placement. The
    // next layout pass may therefore place every node according to the new
    // strategy instead of retaining coordinates from the previous layout.
    nodes: Object.fromEntries(
      Object.entries(object.nodes).map(([id, node]) => [
        id,
        node.positionLocked ? { ...node, positionLocked: false } : node,
      ])
    ),
  };
}

function normalizeMindmapNode(
  node: Partial<WhiteboardMindmapNode>,
  id: string,
  rootId: string,
  layoutScale = 1,
  recalculateSize = false
): WhiteboardMindmapNode {
  const resolvedLayoutScale = resolveMindmapLayoutScale(layoutScale);
  const minimumScale = Math.min(1, resolvedLayoutScale);
  const legacyShape = node.shape as string | undefined;
  const shape =
    legacyShape === "text" || isShapeKind(legacyShape)
      ? legacyShape
      : id === rootId
      ? "rounded-rectangle"
      : "text";
  const textDecoration = node.textDecoration;
  const imageAssetId = node.imageAssetId
    ? String(node.imageAssetId)
    : undefined;
  const imageSize = imageAssetId
    ? resolveMindmapNodeImageSize(
        node.imageWidth,
        node.imageHeight,
        resolvedLayoutScale
      )
    : undefined;
  const normalized: WhiteboardMindmapNode = {
    id,
    parentId: id === rootId ? null : node.parentId ?? null,
    label: String(node.label ?? ""),
    ...(node.widthMode === "auto" || node.widthMode === "fixed" ? { widthMode: node.widthMode } : {}),
    ...(Number.isFinite(node.textMaxWidth) && node.textMaxWidth! > 0 ? { textMaxWidth: node.textMaxWidth } : {}),
    ...(node.labelStyleRanges ? { labelStyleRanges: normalizeMindmapLabelStyleRanges(String(node.label ?? ""), node.labelStyleRanges) } : {}),
    ...(typeof node.link === "string" ? {link: node.link} : {}),
    ...(Array.isArray(node.tags) ? {tags: [...new Set(node.tags.filter(tag => typeof tag === "string"))]} : {}),
    ...(node.branchStyleOverrides ? {branchStyleOverrides: {...node.branchStyleOverrides}} : {}),
    ...(node.summary === undefined ? {} : { summary: String(node.summary) }),
    collapsed: Boolean(node.collapsed),
    x: Number.isFinite(node.x) ? node.x : 0,
    y: Number.isFinite(node.y) ? node.y : 0,
    positionLocked: Boolean(node.positionLocked),
    width: Math.max(
      48 * minimumScale,
      Number.isFinite(node.width) ? node.width! : 144 * resolvedLayoutScale
    ),
    height: Math.max(
      28 * minimumScale,
      Number.isFinite(node.height) ? node.height! : 44 * resolvedLayoutScale
    ),
    ...(node.branchSide === "left" ||
    node.branchSide === "right" ||
    node.branchSide === "top" ||
    node.branchSide === "bottom"
      ? { branchSide: node.branchSide }
      : {}),
    ...(node.shape ? {shape} : {}),
    ...(node.fill ? { fill: String(node.fill) } : {}),
    ...(node.color ? { color: String(node.color) } : {}),
    ...(node.stroke ? { stroke: String(node.stroke) } : {}),
    ...(Number.isFinite(node.strokeWidth)
      ? { strokeWidth: Math.max(0, node.strokeWidth!) }
      : {}),
    ...(node.lineStyle === "solid" ||
    node.lineStyle === "dash" ||
    node.lineStyle === "dot"
      ? { lineStyle: node.lineStyle }
      : {}),
    ...(Number.isFinite(node.opacity)
      ? { opacity: Math.max(0, Math.min(1, node.opacity!)) }
      : {}),
    ...(Number.isFinite(node.fontSize)
      ? {
          fontSize: resolveMindmapFontSize(node.fontSize!, resolvedLayoutScale),
        }
      : {}),
    ...(node.fontWeight ? { fontWeight: node.fontWeight } : {}),
    ...(node.fontStyle ? { fontStyle: node.fontStyle } : {}),
    ...(textDecoration ? { textDecoration } : {}),
    ...(node.align ? { align: node.align } : {}),
    ...(node.icon ? { icon: String(node.icon) } : {}),
    ...(node.sticker ? { sticker: String(node.sticker) } : {}),
    ...(imageAssetId ? { imageAssetId } : {}),
    ...(imageSize
      ? { imageWidth: imageSize.width, imageHeight: imageSize.height }
      : {}),
    ...(imageAssetId && isMindmapNodeImagePlacement(node.imagePlacement)
      ? { imagePlacement: node.imagePlacement }
      : {}),
  };
  // Persisted historical dimensions are not silently changed when a document is read.
  if (!recalculateSize && Number.isFinite(node.width) && Number.isFinite(node.height)) return normalized;
  const intrinsicSize = resolveMindmapNodeAutoSize(
    normalized,
    id === rootId,
    resolvedLayoutScale
  );
  return {
    ...normalized,
    width: Math.max(normalized.width || 0, intrinsicSize.width),
    height: Math.max(normalized.height || 0, intrinsicSize.height),
  };
}

/**
 * Resolves the content-driven Feishu-style node size used after editing or
 * import. Explicit line breaks participate in both width and height.
 */
export function resolveMindmapNodeAutoSize(
  node: Pick<
    WhiteboardMindmapNode,
    | "label"
    | "fontSize"
    | "icon"
    | "sticker"
    | "summary"
    | "imageAssetId"
    | "imageWidth"
    | "imageHeight"
    | "imagePlacement"
    | "widthMode"
    | "textMaxWidth"
    | "labelStyleRanges"
    | "fontWeight"
    | "fontStyle"
    | "textDecoration"
    | "color"
  >,
  isRoot = false,
  layoutScale = 1
): { width: number; height: number } {
  const geometry = resolveMindmapNodeContentGeometry(node, {
    isRoot,
    layoutScale,
  });
  return { width: geometry.width, height: geometry.height };
}

/** Applies a proportional embedded-image size and reflows the complete mindmap. */
export function resizeMindmapNodeImage(
  object: WhiteboardMindmapObject,
  nodeId: string,
  width: number,
  height: number
): WhiteboardMindmapObject {
  const node = object.nodes[nodeId];
  if (!node?.imageAssetId) return object;
  const imageSize = resolveMindmapNodeImageSize(
    width,
    height,
    object.layoutScale
  );
  const resizedNode = {
    ...node,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height,
  };
  return layoutMindmap({
    ...object,
    nodes: {
      ...object.nodes,
      [nodeId]: {
        ...resizedNode,
        ...resolveMindmapNodeAutoSize(
          resizedNode,
          nodeId === object.rootId,
          object.layoutScale
        ),
      },
    },
  });
}

/** Normalizes node identity and layout metadata without mutating the source. */
export function normalizeMindmapObject(
  object: WhiteboardMindmapObject,
  options: {recalculateSize?: boolean} = {}
): WhiteboardMindmapObject {
  const layoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const sourceNodes =
    object.nodes && typeof object.nodes === "object" ? object.nodes : {};
  const sourceIds = Object.keys(sourceNodes);
  const rootId = sourceNodes[object.rootId]
    ? object.rootId
    : sourceIds[0] || `${object.id}-root`;
  const nodes: WhiteboardMindmapObject["nodes"] = {};
  sourceIds.forEach((id) => {
    nodes[id] = normalizeMindmapNode(
      sourceNodes[id] || {},
      id,
      rootId,
      layoutScale,
      Boolean(options.recalculateSize)
    );
  });
  if (!nodes[rootId]) {
    nodes[rootId] = normalizeMindmapNode(
      {
        label: "中心主题",
        width: 144 * layoutScale,
        height: 44 * layoutScale,
      },
      rootId,
      rootId,
      layoutScale
    );
  }
  const validIds = new Set(Object.keys(nodes));
  for (const node of Object.values(nodes)) {
    if (node.id === rootId) node.parentId = null;
    else if (!node.parentId || !validIds.has(node.parentId)) node.parentId = rootId;
  }
  const checked = new Set<string>([rootId]);
  for (const id of Object.keys(nodes)) {
    const path: string[] = []; const inPath = new Set<string>(); let current: string | null = id;
    while (current && !checked.has(current)) {
      if (inPath.has(current)) { nodes[current].parentId = rootId; break; }
      inPath.add(current); path.push(current); current = nodes[current]?.parentId || null;
    }
    path.forEach(nodeId => checked.add(nodeId));
  }
  const seenOrder = new Set<string>();
  let order = (Array.isArray(object.order) ? object.order : []).filter(
    (id) => {
      if (!validIds.has(id) || seenOrder.has(id)) return false;
      seenOrder.add(id);
      return true;
    }
  );
  if (!seenOrder.has(rootId)) { order.unshift(rootId); seenOrder.add(rootId); }
  Object.keys(nodes).forEach((id) => {
    if (!seenOrder.has(id)) order.push(id);
  });
  // Geometry caches can reuse a valid persisted order through normalization.
  if (
    Array.isArray(object.order) &&
    order.length === object.order.length &&
    order.every((id, index) => id === object.order[index])
  )
    order = object.order;
  const resolved = resolveMindmapLayout(object);
  const sizingObject = { ...object, nodes, order, rootId, layoutScale };
  const index = buildMindmapTreeIndex(sizingObject);
  for (const id of order) {
    const node = nodes[id];
    if (!node.widthMode || (!options.recalculateSize && Number.isFinite(sourceNodes[id]?.width) && Number.isFinite(sourceNodes[id]?.height))) continue;
    const visual = resolveMindmapNodeVisualStyle(node, index.depth.get(id) || 0, sizingObject);
    const size = resolveMindmapNodeContentGeometry({...node, fontSize: visual.fontSize, fontWeight: visual.fontWeight, fontStyle: visual.fontStyle}, {isRoot: id === rootId, depth: index.depth.get(id), layoutScale});
    nodes[id] = {...node, width: size.width, height: size.height};
  }
  return {
    ...object,
    rootId,
    nodes,
    order,
    layoutScale,
    layout: object.layout || "right",
    layoutFamily: resolved.family,
    layoutDirection: resolved.direction,
    branchStyle: object.branchStyle || "curve",
    lineStyle: object.lineStyle || "solid",
  };
}

export function createMindmapObject(
  x = 240,
  y = 180,
  title = "中心主题"
): WhiteboardMindmapObject {
  const rootId = createId("mindmap-node");
  const root: WhiteboardMindmapNode = {
    id: rootId,
    parentId: null,
    label: title.trim() || "中心主题",
    widthMode: "auto",
    textMaxWidth: 320,
    width: 176,
    height: 56,
    // Defaults remain inherited so a theme can change an untouched root.
    shape: "rounded-rectangle",
  };
  return {
    id: createId("mindmap"),
    type: "mindmap",
    x,
    y,
    width: 620,
    height: 360,
    rotation: 0,
    locked: false,
    rootId,
    nodes: { [rootId]: root },
    order: [rootId],
    layoutScale: 1,
    layout: "right",
    layoutFamily: "mindmap",
    layoutDirection: "right",
    fill: "#dbeafe",
    color: "#172033",
    connector: "#60a5fa",
    branchStyle: "curve",
    lineStyle: "solid",
  };
}

export function childrenOf(object: WhiteboardMindmapObject, parentId: string) {
  return (buildMindmapTreeIndex(object).children.get(parentId) || []).map(id => object.nodes[id]);
}

export function mindmapSubtreeNodeIds(
  object: WhiteboardMindmapObject,
  nodeId: string
): string[] {
  const index = buildMindmapTreeIndex(object);
  const start = index.preorder.indexOf(nodeId);
  return start < 0 ? [] : index.preorder.slice(start, index.subtreeEnd.get(nodeId));
}

export function visibleMindmapNodeIds(
  object: WhiteboardMindmapObject
): string[] {
  return [...buildMindmapTreeIndex(object).visibleIds];
}

export function addMindmapNode(
  object: WhiteboardMindmapObject,
  anchorId: string,
  relation: "child" | "sibling" = "child",
  label = "新节点"
): WhiteboardMindmapObject {
  const anchor = object.nodes[anchorId] || object.nodes[object.rootId];
  if (!anchor) return object;
  const parentId =
    relation === "sibling" && anchor.parentId ? anchor.parentId : anchor.id;
  const layoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const nodeId = createId("mindmap-node");
  const nodeBase: WhiteboardMindmapNode = {
    id: nodeId,
    parentId,
    label,
    widthMode: "auto",
    textMaxWidth: 320 * layoutScale,
  };
  // New nodes use their measured text size. The initial three template
  // branches go through this same helper, so their connector-to-label gap
  // matches nodes created later from the toolbar or quick-create affordance.
  const node: WhiteboardMindmapNode = {
    ...nodeBase,
    ...resolveMindmapNodeAutoSize(nodeBase, false, layoutScale),
  };
  return layoutMindmap({
    ...object,
    nodes: { ...object.nodes, [nodeId]: node },
    order: relation === "sibling" && anchor.parentId
      ? (() => {const order = [...buildMindmapTreeIndex(object).preorder]; const subtree = new Set(mindmapSubtreeNodeIds(object, anchor.id)); let at = order.indexOf(anchor.id) + 1; while (at < order.length && subtree.has(order[at])) at++; order.splice(at, 0, nodeId); return order;})()
      : [...object.order, nodeId],
  });
}

/** Builds the complete draft shown while placing a new mind map. */
export function createMindmapTemplateObject(
  x = 240,
  y = 180,
  family: MindmapLayoutFamily = "mindmap",
  direction: MindmapLayoutDirection = "right",
  branchStyle: MindmapBranchStyle = "curve"
): WhiteboardMindmapObject {
  let template = withMindmapLayout(
    createMindmapObject(x, y),
    family,
    direction
  );
  ["分支主题", "分支主题", "分支主题"].forEach((label) => {
    template = addMindmapNode(template, template.rootId, "child", label);
  });
  return layoutMindmap({ ...template, branchStyle });
}

/** Positions the preview's root at the pointer without changing its identity. */
export function positionMindmapTemplateAt(
  template: WhiteboardMindmapObject,
  point: { x: number; y: number }
): WhiteboardMindmapObject {
  const root = template.nodes[template.rootId];
  return {
    ...template,
    x: point.x - (root?.x || 0),
    y: point.y - (root?.y || 0),
  };
}

/** Creates an independent mind map from the cached placement preview. */
export function instantiateMindmapTemplateAt(
  template: WhiteboardMindmapObject,
  point: { x: number; y: number }
): WhiteboardMindmapObject {
  const instance: WhiteboardMindmapObject = structuredClone(template);
  const nodeIds = new Map(
    Object.keys(instance.nodes).map((id) => [id, createId("mindmap-node")])
  );
  return positionMindmapTemplateAt(
    {
      ...instance,
      id: createId("mindmap"),
      rootId: nodeIds.get(instance.rootId)!,
      order: instance.order.map((id) => nodeIds.get(id)!),
      nodes: Object.fromEntries(
        Object.entries(instance.nodes).map(([id, node]) => {
          const nodeId = nodeIds.get(id)!;
          return [
            nodeId,
            {
              ...node,
              id: nodeId,
              parentId: node.parentId ? nodeIds.get(node.parentId)! : null,
            },
          ];
        })
      ),
    },
    point
  );
}

/** Maps a quick port click to a native mindmap branch operation. */
export function addMindmapNodeFromPort(
  object: WhiteboardMindmapObject,
  anchorId: string,
  port: WhiteboardConnectorPort,
  label = "新节点",
  obstacles?: Readonly<Record<string, MindmapObstacleObject>>
): WhiteboardMindmapObject {
  const anchor = object.nodes[anchorId];
  if (!anchor) return object;
  const resolved = resolveMindmapLayout(object);
  const vertical =
    resolved.direction === "top-down" || resolved.direction === "vertical";
  const relation: "child" | "sibling" =
    anchorId === object.rootId
      ? "child"
      : vertical
      ? port === "bottom"
        ? "child"
        : "sibling"
      : resolved.direction === "left"
      ? port === "left"
        ? "child"
        : "sibling"
      : resolved.direction === "both"
      ? port === "left" || port === "right"
        ? "child"
        : "sibling"
      : port === "right"
      ? "child"
      : "sibling";
  const next = addMindmapNode(object, anchorId, relation, label);
  const createdId = next.order.find((id) => !object.nodes[id]);
  const created = createdId ? next.nodes[createdId] : undefined;
  let result = next;
  if (createdId && created && resolved.direction === "both") {
    const root = next.nodes[next.rootId];
    if (created.parentId === next.rootId && root) {
      const rootCenter = (root.x || 0) + (root.width || 144) / 2;
      const anchorSide =
        anchor.branchSide ||
        ((anchor.x || 0) + (anchor.width || 144) / 2 < rootCenter
          ? "left"
          : "right");
      const branchSide =
        port === "left" || port === "right" ? port : anchorSide;
      result = layoutMindmap({
        ...next,
        nodes: {
          ...next.nodes,
          [createdId]: { ...created, branchSide },
        },
      });
    }
  }
  if (obstacles && createdId && result.nodes[createdId]) {
    return avoidMindmapQuickCreateObstacles(
      result,
      anchorId,
      createdId,
      port,
      obstacles
    );
  }
  return result;
}

export interface MindmapQuickCreatePreview {
  node: MindmapNodeGeometry;
  branch: MindmapBranchPathDescriptor;
}

const MINDMAP_QUICK_CREATE_CLEARANCE = 12;

const MINDMAP_QUICK_CREATE_STEP = 24;

const MINDMAP_QUICK_CREATE_MAX_AXIS_DISTANCE = 480;

const MINDMAP_QUICK_CREATE_MAX_PERPENDICULAR_DISTANCE = 240;

function quickCreateWorldPoint(
  object: WhiteboardMindmapObject,
  point: { x: number; y: number }
) {
  return transformRectanglePoint(object, {
    x: object.x + point.x,
    y: object.y + point.y,
  });
}

function quickCreatePointInObjectFrame(
  source: WhiteboardMindmapObject,
  target: WhiteboardMindmapObject,
  point: { x: number; y: number }
) {
  const world = quickCreateWorldPoint(target, point);
  const local = inverseTransformRectanglePoint(source, world);
  return { x: local.x - source.x, y: local.y - source.y };
}

function quickCreateBranchPath(
  branch: MindmapBranchPathDescriptor,
  points: Array<{ x: number; y: number }>
) {
  const format = (value: number) => String(Math.round(value * 1000) / 1000);
  const path =
    branch.kind === "curve" && points.length === 4
      ? `M ${format(points[0].x)} ${format(points[0].y)} C ${format(
          points[1].x
        )} ${format(points[1].y)} ${format(points[2].x)} ${format(
          points[2].y
        )} ${format(points[3].x)} ${format(points[3].y)}`
      : points.length
      ? `M ${format(points[0].x)} ${format(points[0].y)}${points
          .slice(1)
          .map((point) => ` L ${format(point.x)} ${format(point.y)}`)
          .join("")}`
      : "";
  return path;
}

function quickCreateNodeWorldBounds(
  object: WhiteboardMindmapObject,
  node: MindmapNodeGeometry
): RectangleBounds {
  const corners = [
    { x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y },
    { x: node.x + node.width, y: node.y + node.height },
    { x: node.x, y: node.y + node.height },
  ].map((point) => quickCreateWorldPoint(object, point));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(1, Math.max(...xs) - x),
    height: Math.max(1, Math.max(...ys) - y),
  };
}

function quickCreateObstacleBounds(
  object: MindmapObstacleObject,
  sourceObjectId: string,
  excludedNodeIds: ReadonlySet<string>
): RectangleBounds[] {
  if (
    object.type === "connector" ||
    object.type === "stroke" ||
    object.type === "section"
  )
    return [];
  if (object.type === "mindmap") {
    const geometry = resolveMindmapObjectGeometry(object, { padding: 0 });
    return geometry.visibleIds.flatMap((nodeId) => {
      if (object.id === sourceObjectId && excludedNodeIds.has(nodeId))
        return [];
      const node = geometry.nodes[nodeId];
      return node ? [quickCreateNodeWorldBounds(object, node)] : [];
    });
  }
  return [transformedRectangleBounds(object)];
}

function boundsOverlap(
  first: RectangleBounds,
  second: RectangleBounds,
  padding = 0
) {
  return (
    first.x < second.x + second.width + padding &&
    first.x + first.width > second.x - padding &&
    first.y < second.y + second.height + padding &&
    first.y + first.height > second.y - padding
  );
}

function segmentIntersectsBounds(
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds: RectangleBounds,
  padding = 0
) {
  let minimum = 0;
  let maximum = 1;
  const delta = { x: end.x - start.x, y: end.y - start.y };
  const limits = [
    [-delta.x, start.x - (bounds.x - padding)],
    [delta.x, bounds.x + bounds.width + padding - start.x],
    [-delta.y, start.y - (bounds.y - padding)],
    [delta.y, bounds.y + bounds.height + padding - start.y],
  ];
  for (const [coefficient, constant] of limits) {
    if (Math.abs(coefficient) < 1e-9) {
      if (constant < 0) return false;
      continue;
    }
    const value = constant / coefficient;
    if (coefficient < 0) minimum = Math.max(minimum, value);
    else maximum = Math.min(maximum, value);
    if (minimum > maximum) return false;
  }
  return maximum >= 0 && minimum <= 1;
}

function quickCreatePathIntersectsObstacles(
  object: WhiteboardMindmapObject,
  branch: MindmapBranchPathDescriptor,
  obstacles: readonly RectangleBounds[]
) {
  const points = branch.points.map((point) =>
    quickCreateWorldPoint(object, point)
  );
  return obstacles.some((obstacle) => {
    for (let index = 1; index < points.length; index += 1) {
      if (
        segmentIntersectsBounds(
          points[index - 1],
          points[index],
          obstacle,
          MINDMAP_QUICK_CREATE_CLEARANCE
        )
      )
        return true;
    }
    return false;
  });
}

function avoidMindmapQuickCreateObstacles(
  object: WhiteboardMindmapObject,
  anchorId: string,
  createdId: string,
  port: WhiteboardConnectorPort,
  allObjects: Readonly<Record<string, MindmapObstacleObject>>
) {
  const baseGeometry = resolveMindmapObjectGeometry(object, { padding: 0 });
  const baseNode = baseGeometry.nodes[createdId];
  const baseBranch = baseGeometry.branches.find(
    (branch) => branch.childId === createdId
  );
  if (!baseNode || !baseBranch) return object;
  const excludedNodeIds = new Set([anchorId, baseBranch.parentId]);
  const obstacles = Object.values(allObjects).flatMap((candidate) =>
    quickCreateObstacleBounds(candidate, object.id, excludedNodeIds)
  );
  if (!obstacles.length) return object;
  const horizontal = port === "left" || port === "right";
  const axisSign = port === "left" || port === "top" ? -1 : 1;
  const offsets: Array<{ axis: number; perpendicular: number }> = [];
  for (
    let axis = 0;
    axis <= MINDMAP_QUICK_CREATE_MAX_AXIS_DISTANCE;
    axis += MINDMAP_QUICK_CREATE_STEP
  ) {
    offsets.push({ axis, perpendicular: 0 });
    for (
      let perpendicular = MINDMAP_QUICK_CREATE_STEP;
      perpendicular <= MINDMAP_QUICK_CREATE_MAX_PERPENDICULAR_DISTANCE;
      perpendicular += MINDMAP_QUICK_CREATE_STEP
    ) {
      offsets.push({ axis, perpendicular });
      offsets.push({ axis, perpendicular: -perpendicular });
    }
  }
  for (const offset of offsets) {
    const dx = horizontal ? axisSign * offset.axis : offset.perpendicular;
    const dy = horizontal ? offset.perpendicular : axisSign * offset.axis;
    const candidateNode = {
      ...baseNode,
      x: baseNode.x + dx,
      y: baseNode.y + dy,
    };
    const candidateBounds = quickCreateNodeWorldBounds(object, candidateNode);
    if (
      obstacles.some((obstacle) =>
        boundsOverlap(candidateBounds, obstacle, MINDMAP_QUICK_CREATE_CLEARANCE)
      )
    )
      continue;
    const candidateObject = layoutMindmap({
      ...object,
      nodes: {
        ...object.nodes,
        [createdId]: {
          ...object.nodes[createdId],
          x: candidateNode.x,
          y: candidateNode.y,
          positionLocked: true,
        },
      },
    });
    const candidateGeometry = resolveMindmapObjectGeometry(candidateObject, {
      padding: 0,
    });
    const candidateBranch = candidateGeometry.branches.find(
      (branch) => branch.childId === createdId
    );
    if (!candidateBranch) continue;
    const resolvedCandidateNode = candidateGeometry.nodes[createdId];
    if (
      !resolvedCandidateNode ||
      quickCreatePathIntersectsObstacles(
        candidateObject,
        candidateBranch,
        obstacles
      )
    )
      continue;
    if (offset.axis === 0 && offset.perpendicular === 0) return object;
    return candidateObject;
  }
  return object;
}

/**
 * Computes the node and branch shown while hovering a mindmap quick-create
 * affordance. The candidate is translated as a unit and avoids every visible
 * object on the canvas, while preserving the anchor-to-node branch geometry.
 */
export function resolveMindmapQuickCreatePreview(
  object: WhiteboardMindmapObject,
  anchorId: string,
  port: WhiteboardConnectorPort,
  obstacles: Readonly<Record<string, MindmapObstacleObject>> = {}
): MindmapQuickCreatePreview | null {
  const next = addMindmapNodeFromPort(object, anchorId, port);
  const createdId = next.order.find((id) => !object.nodes[id]);
  if (!createdId || !next.nodes[createdId]) return null;
  const adjusted = avoidMindmapQuickCreateObstacles(
    next,
    anchorId,
    createdId,
    port,
    obstacles
  );
  const geometry = resolveMindmapObjectGeometry(adjusted, { padding: 0 });
  const node = geometry.nodes[createdId];
  const branch = geometry.branches.find(
    (candidate) => candidate.childId === createdId
  );
  if (!node || !branch) return null;
  if (adjusted.x === object.x && adjusted.y === object.y) {
    return { node, branch };
  }
  const nodeOrigin = quickCreatePointInObjectFrame(object, adjusted, {
    x: node.x,
    y: node.y,
  });
  const convertedNode = { ...node, x: nodeOrigin.x, y: nodeOrigin.y };
  const convertedPoints = branch.points.map((point) =>
    quickCreatePointInObjectFrame(object, adjusted, point)
  );
  return {
    node: convertedNode,
    branch: {
      ...branch,
      points: convertedPoints,
      path: quickCreateBranchPath(branch, convertedPoints),
    },
  };
}

/**
 * Inserts a new parent directly above `nodeId`. The root is intentionally
 * immutable: callers must create a new mindmap object when they need a new
 * root, so this helper can never orphan the existing tree.
 */
export function addMindmapParent(
  object: WhiteboardMindmapObject,
  nodeId: string,
  label = "父节点"
): WhiteboardMindmapObject {
  const node = object.nodes[nodeId];
  if (!node || nodeId === object.rootId) return object;
  const parentId = node.parentId || object.rootId;
  const layoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const newId = createId("mindmap-node");
  const parent: WhiteboardMindmapNode = {
    id: newId,
    parentId,
    label: label.trim() || "父节点",
    widthMode: "auto",
    textMaxWidth: 320 * layoutScale,
    width: 144 * layoutScale,
    height: 44 * layoutScale,
  };
  const insertionIndex = Math.max(0, object.order.indexOf(nodeId));
  const order = [...object.order];
  order.splice(insertionIndex, 0, newId);
  return layoutMindmap({
    ...object,
    nodes: {
      ...object.nodes,
      [newId]: parent,
      [nodeId]: { ...node, parentId: newId },
    },
    order,
  });
}

export function removeMindmapNode(
  object: WhiteboardMindmapObject,
  nodeId: string
): WhiteboardMindmapObject {
  if (nodeId === object.rootId || !object.nodes[nodeId]) return object;
  const removed = new Set(mindmapSubtreeNodeIds(object, nodeId));
  const nodes = Object.fromEntries(
    Object.entries(object.nodes).filter(([id]) => !removed.has(id))
  ) as WhiteboardMindmapObject["nodes"];
  return layoutMindmap({
    ...object,
    nodes,
    order: object.order.filter((id) => !removed.has(id)),
  });
}

export function toggleMindmapNode(
  object: WhiteboardMindmapObject,
  nodeId: string
): WhiteboardMindmapObject {
  const node = object.nodes[nodeId];
  if (!node || !childrenOf(object, nodeId).length) return object;
  return layoutMindmap({
    ...object,
    nodes: {
      ...object.nodes,
      [nodeId]: { ...node, collapsed: !node.collapsed },
    },
  });
}

export function cycleMindmapLayout(
  object: WhiteboardMindmapObject
): WhiteboardMindmapObject {
  // Preserve the historical four-step cycle for existing clients. New
  // family-aware callers can use cycleMindmapLayoutMode below.
  const layouts: WhiteboardMindmapObject["layout"][] = [
    "right",
    "left",
    "both",
    "top-down",
  ];
  const index = layouts.indexOf(object.layout);
  return layoutMindmap(
    withMindmapLayout(object, "mindmap", layouts[(index + 1) % layouts.length])
  );
}

/** Cycle through the nine Feishu-style layout presets. */
export function cycleMindmapLayoutMode(
  object: WhiteboardMindmapObject
): WhiteboardMindmapObject {
  const current = resolveMindmapLayout(object);
  const currentIndex = MINDMAP_LAYOUT_PRESETS.findIndex(
    (preset) =>
      preset.family === current.family && preset.direction === current.direction
  );
  const next =
    MINDMAP_LAYOUT_PRESETS[(currentIndex + 1) % MINDMAP_LAYOUT_PRESETS.length];
  return layoutMindmap(withMindmapLayout(object, next.family, next.direction));
}

export function layoutMindmap(
  object: WhiteboardMindmapObject
): WhiteboardMindmapObject {
  const normalizedInput = normalizeMindmapProfessionalObjects(normalizeMindmapObject(object, {recalculateSize: true}));
  const layoutScale = resolveMindmapLayoutScale(normalizedInput.layoutScale);
  const rootBeforeLayout = normalizedInput.nodes[normalizedInput.rootId];
  const rootWorldPosition = {
    x: normalizedInput.x + (rootBeforeLayout?.x || 0),
    y: normalizedInput.y + (rootBeforeLayout?.y || 0),
  };
  const next = { ...normalizedInput, nodes: { ...normalizedInput.nodes } };
  const geometry = resolveMindmapObjectGeometry(next, {
    rootPosition: {
      x: rootBeforeLayout?.x || 0,
      y: rootBeforeLayout?.y || 0,
    },
    padding: 24 * layoutScale,
  });
  geometry.visibleIds.forEach((id) => {
    const node = next.nodes[id];
    const resolvedNode = geometry.nodes[id];
    if (!node || !resolvedNode) return;
    next.nodes[id] = {
      ...node,
      x: resolvedNode.x,
      y: resolvedNode.y,
      width: resolvedNode.width,
      height: resolvedNode.height,
      ...(id === next.rootId || !resolvedNode.side
        ? {}
        : { branchSide: resolvedNode.side }),
    };
  });
  const normalized = normalizeMindmapBounds(next);
  const normalizedRoot = normalized.nodes[normalized.rootId];
  return {
    ...normalized,
    x:
      normalized.x +
      rootWorldPosition.x -
      (normalized.x + (normalizedRoot?.x || 0)),
    y:
      normalized.y +
      rootWorldPosition.y -
      (normalized.y + (normalizedRoot?.y || 0)),
  };
}

export function normalizeMindmapBounds(
  object: WhiteboardMindmapObject
): WhiteboardMindmapObject {
  const visible = visibleMindmapNodeIds(object)
    .map((id) => ({ id, node: object.nodes[id] }))
    .filter((entry): entry is { id: string; node: WhiteboardMindmapNode } =>
      Boolean(entry.node)
    );
  if (!visible.length) return object;
  const layoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const padding = 24 * layoutScale;
  const treeIndex = buildMindmapTreeIndex(object);
  const footprints = visible.map(({ id, node }) => {
    const bodyWidth = node.width || 144 * layoutScale;
    const bodyHeight = node.height || 44 * layoutScale;
    const footprint = resolveMindmapNodeContentGeometry(node, {
      isRoot: id === object.rootId,
      depth: treeIndex.depth.get(id),
      preserveSize: !node.widthMode,
      layoutScale,
      width: bodyWidth,
      height: bodyHeight,
    }).footprint;
    return {
      x: (node.x || 0) + footprint.x,
      y: (node.y || 0) + footprint.y,
      width: footprint.width,
      height: footprint.height,
    };
  });
  if (object.summaries?.length || object.boundaries?.length || object.relations?.length) {
    const geometry = resolveMindmapObjectGeometry(object, {padding: 0});
    footprints.push(geometry.bounds);
  }
  const minX = Math.min(...footprints.map((footprint) => footprint.x));
  const minY = Math.min(...footprints.map((footprint) => footprint.y));
  const maxX = Math.max(
    ...footprints.map((footprint) => footprint.x + footprint.width)
  );
  const maxY = Math.max(
    ...footprints.map((footprint) => footprint.y + footprint.height)
  );
  const offsetX = minX - padding;
  const offsetY = minY - padding;
  const nodes = Object.fromEntries(
    Object.entries(object.nodes).map(([id, node]) => [
      id,
      {
        ...node,
        x: (node.x || 0) - offsetX,
        y: (node.y || 0) - offsetY,
      },
    ])
  ) as WhiteboardMindmapObject["nodes"];
  return {
    ...object,
    x: object.x + offsetX,
    y: object.y + offsetY,
    width: Math.max(192 * layoutScale, maxX - minX + padding * 2),
    height: Math.max(92 * layoutScale, maxY - minY + padding * 2),
    nodes,
  };
}

export function moveMindmapNode(
  object: WhiteboardMindmapObject,
  nodeId: string,
  parentId: string
): WhiteboardMindmapObject {
  return moveMindmapNodeAt(object, nodeId, { parentId });
}

export interface MindmapNodeMoveTarget {
  parentId: string;
  siblingId?: string;
  position?: "before" | "after";
}

/** Returns visible nodes that can legally become the dragged node's parent. */
export function validMindmapDropTargetIds(
  object: WhiteboardMindmapObject,
  nodeId: string
): string[] {
  if (nodeId === object.rootId || !object.nodes[nodeId]) return [];
  const excluded = new Set(mindmapSubtreeNodeIds(object, nodeId));
  return visibleMindmapNodeIds(object).filter((id) => !excluded.has(id));
}

/**
 * Reparents or reorders a complete branch. A sibling target must belong to
 * `parentId`; omitting it appends the branch after the parent's last child.
 */
export function moveMindmapNodeAt(
  object: WhiteboardMindmapObject,
  nodeId: string,
  target: MindmapNodeMoveTarget
): WhiteboardMindmapObject {
  const normalized = normalizeMindmapObject(object);
  const { parentId, siblingId, position = "after" } = target;
  if (
    nodeId === normalized.rootId ||
    nodeId === parentId ||
    !normalized.nodes[nodeId] ||
    !normalized.nodes[parentId]
  )
    return object;
  const subtreeOrder = mindmapSubtreeNodeIds(normalized, nodeId);
  const subtreeIds = new Set(subtreeOrder);
  if (subtreeIds.has(parentId)) return object;
  if (
    siblingId &&
    (subtreeIds.has(siblingId) ||
      normalized.nodes[siblingId]?.parentId !== parentId)
  )
    return object;

  const treeOrder = mindmapSubtreeNodeIds(normalized, normalized.rootId);
  const remainingOrder = treeOrder.filter((id) => !subtreeIds.has(id));
  let insertionIndex: number;
  if (siblingId) {
    const siblingIndex = remainingOrder.indexOf(siblingId);
    if (siblingIndex < 0) return object;
    if (position === "before") {
      insertionIndex = siblingIndex;
    } else {
      const siblingSubtree = new Set(
        mindmapSubtreeNodeIds(normalized, siblingId)
      );
      insertionIndex = siblingIndex + 1;
      while (
        insertionIndex < remainingOrder.length &&
        siblingSubtree.has(remainingOrder[insertionIndex])
      ) {
        insertionIndex += 1;
      }
    }
  } else {
    const siblings = childrenOf(normalized, parentId).filter(
      (node) => !subtreeIds.has(node.id)
    );
    const lastSibling = siblings.at(-1);
    if (!lastSibling) {
      insertionIndex = remainingOrder.indexOf(parentId) + 1;
    } else {
      const lastSubtree = new Set(
        mindmapSubtreeNodeIds(normalized, lastSibling.id)
      );
      insertionIndex = remainingOrder.indexOf(lastSibling.id) + 1;
      while (
        insertionIndex < remainingOrder.length &&
        lastSubtree.has(remainingOrder[insertionIndex])
      ) {
        insertionIndex += 1;
      }
    }
  }
  const order = [...remainingOrder];
  order.splice(insertionIndex, 0, ...subtreeOrder);
  return layoutMindmap({
    ...normalized,
    nodes: {
      ...normalized.nodes,
      ...Object.fromEntries(
        subtreeOrder.map((id) => [
          id,
          {
            ...normalized.nodes[id],
            ...(id === nodeId ? { parentId } : {}),
            positionLocked: false,
          },
        ])
      ),
    },
    order,
  });
}

export interface MindmapBranchClipboardData {
  kind: "whiteboard-mindmap-branch";
  version: 1;
  rootId: string;
  nodes: Record<string, WhiteboardMindmapNode>;
  order: string[];
  /** Source visual scale; omitted by legacy clipboard payloads. */
  layoutScale?: number;
  summaries?: WhiteboardMindmapObject["summaries"];
  boundaries?: WhiteboardMindmapObject["boundaries"];
  relations?: WhiteboardMindmapObject["relations"];
}

export interface PasteMindmapBranchResult {
  object: WhiteboardMindmapObject;
  rootNodeId: string;
  nodeIdMap: Record<string, string>;
}

/** Copies a self-contained branch without retaining its external parent. */
export function copyMindmapBranch(
  object: WhiteboardMindmapObject,
  nodeId: string
): MindmapBranchClipboardData | undefined {
  if (!object.nodes[nodeId]) return undefined;
  const order = mindmapSubtreeNodeIds(object, nodeId);
  const nodes = Object.fromEntries(
    order.map((id) => {
      const node = structuredClone(object.nodes[id]);
      return [id, id === nodeId ? { ...node, parentId: null } : node];
    })
  ) as Record<string, WhiteboardMindmapNode>;
  return {
    ...remapMindmapProfessionalObjects(object, Object.fromEntries(order.map(id => [id,id])), prefix => createId(prefix)),
    kind: "whiteboard-mindmap-branch",
    version: 1,
    rootId: nodeId,
    nodes,
    order,
    layoutScale: resolveMindmapLayoutScale(object.layoutScale),
  };
}

/** Pastes copied nodes as the target node's last child with all ids remapped. */
export function pasteMindmapBranch(
  object: WhiteboardMindmapObject,
  targetParentId: string,
  clipboard: MindmapBranchClipboardData
): PasteMindmapBranchResult | undefined {
  if (
    !object.nodes[targetParentId] ||
    clipboard.kind !== "whiteboard-mindmap-branch" ||
    clipboard.version !== 1 ||
    !clipboard.nodes[clipboard.rootId]
  )
    return undefined;
  const sourceOrder = mindmapSubtreeNodeIds(
    {
      ...object,
      rootId: clipboard.rootId,
      nodes: clipboard.nodes,
      order: clipboard.order,
    },
    clipboard.rootId
  );
  if (!sourceOrder.length) return undefined;
  const nodeIdMap = Object.fromEntries(
    sourceOrder.map((id) => [id, createId("mindmap-node")])
  );
  const sourceLayoutScale = resolveMindmapLayoutScale(clipboard.layoutScale);
  const targetLayoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const scale = targetLayoutScale / sourceLayoutScale;
  const pastedNodes = Object.fromEntries(
    sourceOrder.map((id) => {
      const source = structuredClone(clipboard.nodes[id]);
      const mappedId = nodeIdMap[id];
      const mappedParentId =
        id === clipboard.rootId
          ? targetParentId
          : source.parentId && nodeIdMap[source.parentId]
          ? nodeIdMap[source.parentId]
          : nodeIdMap[clipboard.rootId];
      return [
        mappedId,
        {
          ...source,
          id: mappedId,
          parentId: mappedParentId,
          x: (source.x || 0) * scale,
          y: (source.y || 0) * scale,
          width: (source.width || 144 * sourceLayoutScale) * scale,
          height: (source.height || 44 * sourceLayoutScale) * scale,
          ...(source.textMaxWidth !== undefined ? {textMaxWidth: source.textMaxWidth * scale} : {}),
          ...(source.fontSize !== undefined
            ? { fontSize: source.fontSize * scale }
            : {}),
          ...(source.strokeWidth !== undefined
            ? { strokeWidth: source.strokeWidth * scale }
            : {}),
          ...(source.imageWidth !== undefined
            ? { imageWidth: source.imageWidth * scale }
            : {}),
          ...(source.imageHeight !== undefined
            ? { imageHeight: source.imageHeight * scale }
            : {}),
        },
      ];
    })
  ) as Record<string, WhiteboardMindmapNode>;
  const rootNodeId = nodeIdMap[clipboard.rootId];
  const professional = remapMindmapProfessionalObjects(clipboard, nodeIdMap, createId);
  const withPastedNodes = {
    ...object,
    summaries: [...(object.summaries || []), ...(professional.summaries || [])],
    boundaries: [...(object.boundaries || []), ...(professional.boundaries || [])],
    relations: [...(object.relations || []), ...(professional.relations || [])],
    nodes: { ...object.nodes, ...pastedNodes },
    order: [...object.order, ...sourceOrder.map((id) => nodeIdMap[id])],
  };
  const next = layoutMindmap({
    ...withPastedNodes,
    order: mindmapSubtreeNodeIds(withPastedNodes, withPastedNodes.rootId),
  });
  return { object: next, rootNodeId, nodeIdMap };
}

export function moveMindmapNodePosition(
  object: WhiteboardMindmapObject,
  nodeId: string,
  x: number,
  y: number
): WhiteboardMindmapObject {
  const node = object.nodes[nodeId];
  if (!node || !Number.isFinite(x) || !Number.isFinite(y)) return object;
  return normalizeMindmapBounds({
    ...object,
    nodes: {
      ...object.nodes,
      [nodeId]: { ...node, x, y, positionLocked: true },
    },
  });
}
