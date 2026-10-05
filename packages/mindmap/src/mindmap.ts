import type {
  MindmapBranchStyle,
  MindmapLayoutDirection,
  MindmapLayoutFamily,
  MindmapLineStyle,
  MindmapNodeImagePlacement,
  MindmapNodeShape,
  WhiteboardConnectorPort,
  WhiteboardMindmapNode,
  WhiteboardMindmapObject,
  WhiteboardTheme,
} from "./types";
import { roundedPolylinePathData, transformRectanglePoint } from "./geometry";
import {
  measureMindmapText,
  getMindmapTextMetricsRevision,
  resolveMindmapTextLayout,
  type MindmapTextMetrics,
  type MindmapTextRun,
} from "./text";
import { resolveMindmapProfessionalGeometry } from "./professional";
import { buildMindmapTreeIndex } from "./tree";
import { isShapeKind } from "./shapeGeometry";

export type MindmapBranchSide = "left" | "right" | "top" | "bottom";
export type MindmapNodeRole = "root" | "branch" | "leaf" | "collapsed";
export type MindmapNodeRelation = "child" | "sibling" | "parent";

export interface MindmapContentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MindmapNodeContentGeometry {
  labelLines: string[];
  labelLineHeight: number;
  textRuns: MindmapTextRun[];
  /** Persisted node body size. External description content is excluded. */
  width: number;
  height: number;
  body: MindmapContentRect;
  /** Union of the node body and its external description, relative to the body. */
  footprint: MindmapContentRect;
  placement: MindmapNodeImagePlacement;
  text: MindmapContentRect;
  label: MindmapContentRect;
  /** Description text rectangle, positioned below the visible node content. */
  summary?: MindmapContentRect;
  /** The quote bar shown immediately to the left of the description text. */
  summaryQuoteLine?: MindmapContentRect;
  /** Pre-wrapped, at-most-three-line text shared by canvas and SVG export. */
  summaryLines?: string[];
  summaryLineCount: number;
  summaryTruncated: boolean;
  summaryFontSize: number;
  summaryLineHeight: number;
  decoration?: MindmapContentRect;
  image?: MindmapContentRect;
}

export interface MindmapNodeContentGeometryOptions {
  isRoot?: boolean;
  depth?: number;
  metrics?: MindmapTextMetrics;
  preserveSize?: boolean;
  layoutScale?: number;
  width?: number;
  height?: number;
}

export interface MindmapLayoutSpec {
  family: MindmapLayoutFamily;
  direction: MindmapLayoutDirection;
}

export interface MindmapQuickCreatePort {
  port: WhiteboardConnectorPort;
  relation: MindmapNodeRelation;
  branchSide?: MindmapBranchSide;
}

export type MindmapToolbarAction =
  /** Layout picker shown for the root node only. */
  | "layout"
  /** Node appearance controls. These are intentionally separate actions so
   * a consumer can render Feishu's one-control-per-popover toolbar. */
  | "node-shape"
  | "fill"
  | "stroke"
  | "text-color"
  | "font-size"
  | "format"
  | "summary"
  | "comment"
  | "more";

export type MindmapMenuAction =
  | "add-child"
  | "add-sibling"
  | "add-parent"
  | "collapse"
  | "expand"
  | "copy"
  | "copy-as-image"
  | "paste"
  | "duplicate"
  | "layer"
  | "copy-style"
  | "paste-style"
  | "lock"
  | "delete";

export interface MindmapActionItem<TAction extends string> {
  action: TAction;
  enabled: boolean;
}

export interface MindmapActionAvailability {
  addChild: boolean;
  addSibling: boolean;
  addParent: boolean;
  collapse: boolean;
  expand: boolean;
  edit: boolean;
  copy: boolean;
  duplicate: boolean;
  delete: boolean;
  comment: boolean;
  link: boolean;
  layout: boolean;
}

/**
 * The interaction state used by Feishu's node affordance matrix.  Keeping it
 * in the model layer makes the distinction between a passive hover, a real
 * selection and text editing explicit for canvas and non-canvas consumers.
 */
export type MindmapNodeInteractionState =
  | "idle"
  | "hovered"
  | "selected"
  | "editing";

export interface MindmapInteractionAffordances {
  /** Whether the node's quick-create (+) controls should be painted. */
  showQuickCreate: boolean;
  /** Whether collapse/expand controls should be painted. */
  showCollapse: boolean;
  /** Whether external connector anchors should be painted. */
  showExternalConnection: boolean;
  /** Whether the node toolbar should be attached to the selection. */
  showToolbar: boolean;
}

export interface MindmapCollapseControl {
  visible: boolean;
  ports: WhiteboardConnectorPort[];
  action: "collapse" | "expand";
  enabled: boolean;
}

export interface ResolveMindmapNodeAffordancesInput extends MindmapLayoutSpec {
  isRoot: boolean;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  branchSide?: MindmapBranchSide;
  /** Position among siblings, used for Feishu's alternating timeline branches. */
  siblingIndex?: number;
  /** Whether the document permits mutations. */
  editable: boolean;
  /** Locked nodes stay selectable so the menu can expose the unlock action. */
  locked?: boolean;
  /**
   * Optional interaction state. Existing callers omit this field because they
   * decide visibility at render time; when supplied, the policy exposes the
   * same hover/click/edit distinction used by Feishu.
   */
  interaction?: MindmapNodeInteractionState;
  /** Connector tool mode suppresses structural quick-create affordances. */
  connectionMode?: boolean;
}

export interface MindmapNodeAffordances {
  role: MindmapNodeRole;
  branchSide?: MindmapBranchSide;
  quickCreatePorts: MindmapQuickCreatePort[];
  externalConnectionPorts: WhiteboardConnectorPort[];
  collapseControl: MindmapCollapseControl;
  interaction: MindmapInteractionAffordances;
  actions: MindmapActionAvailability;
  toolbarActions: Array<MindmapActionItem<MindmapToolbarAction>>;
  menuActions: Array<MindmapActionItem<MindmapMenuAction>>;
}

function timelineSide(
  direction: MindmapLayoutDirection,
  branchSide: MindmapBranchSide | undefined,
  siblingIndex: number
): MindmapBranchSide {
  if (direction === "vertical") {
    if (branchSide === "left" || branchSide === "right") return branchSide;
    return siblingIndex % 2 === 0 ? "left" : "right";
  }
  if (branchSide === "top" || branchSide === "bottom") return branchSide;
  // Existing documents only persist left/right. Preserve their intent when a
  // mind map is switched to a horizontal timeline.
  if (branchSide === "left") return "top";
  if (branchSide === "right") return "bottom";
  return siblingIndex % 2 === 0 ? "top" : "bottom";
}

function resolvedBranchSide(
  input: ResolveMindmapNodeAffordancesInput
): MindmapBranchSide | undefined {
  if (input.isRoot) return undefined;
  if (input.family === "timeline") {
    return timelineSide(
      input.direction,
      input.branchSide,
      input.siblingIndex || 0
    );
  }
  if (input.family === "tree") {
    if (input.branchSide === "left" || input.branchSide === "right") {
      return input.branchSide;
    }
    if (input.direction === "left") return "left";
    return "right";
  }
  if (input.direction === "top-down") return "bottom";
  if (input.branchSide === "left" || input.branchSide === "right") {
    return input.branchSide;
  }
  return input.direction === "left" ? "left" : "right";
}

function portForSide(side: MindmapBranchSide): WhiteboardConnectorPort {
  return side;
}

function rootCreatePorts(
  family: MindmapLayoutFamily,
  direction: MindmapLayoutDirection
): MindmapQuickCreatePort[] {
  if (family === "tree") {
    return [{ port: "bottom", relation: "child" }];
  }
  if (family === "timeline") {
    return [
      {
        port: direction === "vertical" ? "bottom" : "right",
        relation: "child",
      },
    ];
  }
  if (direction === "both") {
    return [
      { port: "left", relation: "child", branchSide: "left" },
      { port: "right", relation: "child", branchSide: "right" },
    ];
  }
  if (direction === "left") {
    return [{ port: "left", relation: "child", branchSide: "left" }];
  }
  if (direction === "top-down") {
    return [{ port: "bottom", relation: "child", branchSide: "bottom" }];
  }
  return [{ port: "right", relation: "child", branchSide: "right" }];
}

export function resolveMindmapNodeRole(
  input: Pick<
    ResolveMindmapNodeAffordancesInput,
    "isRoot" | "hasChildren" | "collapsed"
  >
): MindmapNodeRole {
  if (input.isRoot) return "root";
  if (input.hasChildren && input.collapsed) return "collapsed";
  return input.hasChildren ? "branch" : "leaf";
}

/**
 * Resolve the node toolbar in Feishu order.  Toolbar controls are modeled as
 * individual actions (rather than one generic "style" action) so that a
 * caller can attach the correct tooltip/popover to each control and hide root
 * only controls for branch/leaf nodes.
 */
export function resolveMindmapToolbarActions(
  input: Pick<
    ResolveMindmapNodeAffordancesInput,
    "isRoot" | "editable" | "locked" | "interaction"
  >
): Array<MindmapActionItem<MindmapToolbarAction>> {
  const interaction = input.interaction ?? "selected";
  const canEdit = input.editable && !input.locked && interaction !== "editing";
  const canOpenMenu = input.editable && interaction !== "editing";
  const actions: MindmapToolbarAction[] = input.isRoot
    ? [
        "layout",
        "node-shape",
        "fill",
        "stroke",
        "text-color",
        "font-size",
        "format",
        "summary",
        "comment",
        "more",
      ]
    : [
        "node-shape",
        "stroke",
        "text-color",
        "font-size",
        "format",
        "summary",
        "comment",
        "more",
      ];
  return actions.map((action) => ({
    action,
    enabled:
      action === "more"
        ? canOpenMenu
        : action === "layout"
        ? canEdit && input.isRoot
        : action === "comment"
        ? canEdit
        : canEdit,
  }));
}

/**
 * Central policy for Feishu-style mind map node controls. The result is
 * intentionally presentation agnostic so canvas controls, menus and keyboard
 * commands cannot drift apart.
 */
export function resolveMindmapNodeAffordances(
  input: ResolveMindmapNodeAffordancesInput
): MindmapNodeAffordances {
  const role = resolveMindmapNodeRole(input);
  const branchSide = resolvedBranchSide(input);
  const interaction = input.interaction ?? "selected";
  const writable = input.editable && !input.locked && interaction !== "editing";
  const visibleInteraction =
    interaction === "hovered" || interaction === "selected";
  const quickCreatePorts = writable
    ? input.isRoot
      ? rootCreatePorts(input.family, input.direction)
      : [
          {
            port: portForSide(branchSide || "right"),
            relation: "child" as const,
            branchSide,
          },
        ]
    : [];
  // Feishu keeps the root uncluttered: branch collapse controls belong to
  // non-root nodes, while collapsing the whole map remains available in the
  // node menu.
  const collapsePorts = input.isRoot
    ? []
    : [portForSide(branchSide || "right")];
  const actions: MindmapActionAvailability = {
    addChild: writable,
    addSibling: writable && !input.isRoot,
    addParent: writable && !input.isRoot,
    collapse:
      writable && !input.isRoot && input.hasChildren && !input.collapsed,
    expand: writable && !input.isRoot && input.hasChildren && input.collapsed,
    edit: writable,
    copy: writable,
    duplicate: writable,
    delete: writable,
    comment: writable,
    link: writable,
    layout: writable && input.isRoot,
  };
  const toolbarActions = resolveMindmapToolbarActions(input);
  const menuActions: Array<MindmapActionItem<MindmapMenuAction>> = [
    ...(!input.isRoot
      ? [{ action: "add-sibling" as const, enabled: actions.addSibling }]
      : []),
    { action: "add-child", enabled: actions.addChild },
    ...(!input.isRoot
      ? [{ action: "add-parent" as const, enabled: actions.addParent }]
      : []),
    ...(!input.isRoot && input.hasChildren
      ? [
          {
            action: (input.collapsed ? "expand" : "collapse") as
              | "collapse"
              | "expand",
            enabled: input.collapsed ? actions.expand : actions.collapse,
          },
        ]
      : []),
    { action: "copy", enabled: actions.copy },
    { action: "copy-as-image", enabled: actions.copy },
    { action: "paste", enabled: writable },
    { action: "duplicate", enabled: actions.duplicate },
    { action: "layer", enabled: writable },
    { action: "copy-style", enabled: writable },
    { action: "paste-style", enabled: writable },
    { action: "lock", enabled: input.editable && interaction !== "editing" },
    { action: "delete", enabled: actions.delete },
  ];

  const quickAxes = new Set(
    quickCreatePorts.map((item) =>
      item.port === "left" || item.port === "right" ? "horizontal" : "vertical"
    )
  );
  // The connector tool exposes a complete four-sided target ring, just like
  // regular whiteboard objects. In selection mode we keep the structural
  // quick-create axis clear and expose the perpendicular pair instead.
  const externalConnectionPorts = writable
    ? input.connectionMode
      ? (["top", "right", "bottom", "left"] as WhiteboardConnectorPort[])
      : quickAxes.has("horizontal")
      ? (["top", "bottom"] as WhiteboardConnectorPort[])
      : (["left", "right"] as WhiteboardConnectorPort[])
    : [];

  return {
    role,
    branchSide,
    quickCreatePorts,
    externalConnectionPorts,
    collapseControl: {
      visible: !input.isRoot && input.hasChildren,
      ports: !input.isRoot && input.hasChildren ? collapsePorts : [],
      action: input.collapsed ? "expand" : "collapse",
      enabled:
        writable &&
        input.hasChildren &&
        (input.collapsed ? actions.expand : actions.collapse),
    },
    interaction: {
      // Feishu keeps node affordances quiet until the node is hovered or
      // selected, and hides them while text editing is active.  Selection is
      // the default for backwards-compatible callers that do not pass an
      // interaction state explicitly.
      showQuickCreate:
        !input.connectionMode &&
        visibleInteraction &&
        quickCreatePorts.length > 0,
      showCollapse:
        !input.connectionMode &&
        visibleInteraction &&
        input.hasChildren &&
        collapsePorts.length > 0,
      showExternalConnection:
        visibleInteraction && externalConnectionPorts.length > 0,
      showToolbar: interaction === "selected",
    },
    actions,
    toolbarActions,
    menuActions,
  };
}

export interface MindmapPoint {
  x: number;
  y: number;
}

export interface MindmapGeometryNodeInput {
  widthMode?: WhiteboardMindmapNode["widthMode"];
  textMaxWidth?: number;
  labelStyleRanges?: WhiteboardMindmapNode["labelStyleRanges"];
  textDecoration?: WhiteboardMindmapNode["textDecoration"];
  color?: string;
  id: string;
  parentId: string | null;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  /** Preserve a manually positioned node while recalculating other nodes. */
  positionLocked?: boolean;
  collapsed?: boolean;
  branchSide?: MindmapBranchSide;
  label?: string;
  summary?: string;
  fontSize?: number;
  fontWeight?: WhiteboardMindmapNode["fontWeight"];
  fontStyle?: WhiteboardMindmapNode["fontStyle"];
  shape?: WhiteboardMindmapNode["shape"];
  icon?: string;
  sticker?: string;
  imageAssetId?: string;
  imageWidth?: number;
  imageHeight?: number;
  imagePlacement?: MindmapNodeImagePlacement;
}

export interface MindmapGeometryInput extends MindmapLayoutSpec {
  rootId: string;
  nodes: Readonly<Record<string, MindmapGeometryNodeInput>>;
  order: readonly string[];
  /** Uniform scale for layout spacing and implicit node defaults. */
  layoutScale?: number;
  /** Root top-left position. Defaults to the root node's current coordinates. */
  rootPosition?: MindmapPoint;
  padding?: number;
  levelGap?: number;
  crossGap?: number;
  preserveSize?: boolean;
}

export interface MindmapNodeGeometry {
  id: string;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Absolute layout and object-boundary footprint, including description. */
  footprint: MindmapBounds;
  depth: number;
  side?: MindmapBranchSide;
}

export interface MindmapBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MindmapBranchPathDescriptor {
  id: string;
  parentId: string;
  childId: string;
  side: MindmapBranchSide;
  kind: "curve" | "elbow" | "timeline";
  points: MindmapPoint[];
  path: string;
}

export type { MindmapBranchStyle } from "./types";

/**
 * The visual defaults used by the canvas and SVG exporter for each node
 * depth.  Keeping this in the geometry module prevents imported documents
 * from rendering with one set of defaults on screen and another on export.
 */
export interface MindmapNodeVisualStyle {
  shape: MindmapNodeShape;
  fill: string;
  fillSource?: "node" | "branch" | "theme" | "default";
  stroke: string;
  color: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: WhiteboardMindmapNode["textDecoration"];
  align?: WhiteboardMindmapNode["align"];
  opacity?: number;
  strokeWidth: number;
  lineStyle: MindmapLineStyle;
}

export function resolveMindmapStrokeDash(
  lineStyle: MindmapLineStyle = "solid",
  scale = 1
): number[] | undefined {
  if (lineStyle === "dash") return [9 * scale, 6 * scale];
  if (lineStyle === "dot") return [2 * scale, 6 * scale];
  return undefined;
}

export interface MindmapSummaryVisualStyle {
  textColor: string;
  selectedTextColor: string;
  quoteColor: string;
  selectedQuoteColor: string;
  editorBackground: string;
}

/** Keeps external descriptions readable across every whiteboard theme. */
export function resolveMindmapSummaryVisualStyle(
  theme?: Pick<
    WhiteboardTheme,
    "mutedText" | "text" | "border" | "primary" | "surface"
  >
): MindmapSummaryVisualStyle {
  return {
    textColor: theme?.mutedText || "#646a73",
    selectedTextColor: theme?.text || "#1f2329",
    quoteColor: theme?.border || "#bbbfc4",
    selectedQuoteColor: theme?.primary || "#1677ff",
    editorBackground: theme?.surface || "#ffffff",
  };
}

/**
 * Node decorations are shared by the Konva canvas and SVG exporter.  Feishu
 * stores these as Iconify names (or, for older documents, a short emoji).
 * Keeping the small path registry here avoids rendering an Iconify name as
 * visible text in one surface while drawing the icon in another.
 */
export interface MindmapNodeIconArtwork {
  path: string;
  mode: "fill" | "stroke";
}

export interface MindmapNodeDecoration {
  artwork?: MindmapNodeIconArtwork;
  glyph?: string;
}

const MINDMAP_NODE_ICON_ARTWORKS: Record<string, MindmapNodeIconArtwork> = {
  "lucide:star": {
    path: "M12 2.75 14.89 8.6l6.46.94-4.67 4.55 1.1 6.43L12 17.48l-5.78 3.04 1.1-6.43L2.65 9.54l6.46-.94L12 2.75Z",
    mode: "fill",
  },
  "mdi:star": {
    path: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
    mode: "fill",
  },
  "lucide:flag": {
    path: "M5 21V4m0 0c5-3 9 3 14 0v10c-5 3-9-3-14 0",
    mode: "stroke",
  },
  "lucide:lightbulb": {
    path: "M9 18h6m-5 3h4m-7-8a6 6 0 1 1 8 0c-1.1 1-1.5 2-1.5 3h-5c0-1-.4-2-1.5-3Z",
    mode: "stroke",
  },
  "lucide:target": {
    path: "M12 2v20M2 12h20m-10-5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    mode: "stroke",
  },
  "lucide:pin": {
    path: "m12 17v5m-4-9 4-4 4 4m-8 0h16M9 9V4h6v5",
    mode: "stroke",
  },
};

const shortGlyph = (value: unknown) => {
  const candidate = typeof value === "string" ? value : "";
  return candidate &&
    !candidate.includes(":") &&
    Array.from(candidate).length <= 4
    ? candidate
    : undefined;
};

export function resolveMindmapNodeDecoration(
  node: Pick<WhiteboardMindmapNode, "icon" | "sticker">
): MindmapNodeDecoration {
  const icon = typeof node.icon === "string" ? node.icon : "";
  const artwork =
    MINDMAP_NODE_ICON_ARTWORKS[icon] ||
    (icon.includes(":")
      ? MINDMAP_NODE_ICON_ARTWORKS["lucide:star"]
      : undefined);
  if (artwork) return { artwork };
  return { glyph: shortGlyph(node.icon) || shortGlyph(node.sticker) };
}

function depthVisualDefaults(
  depth: number,
  object: Pick<WhiteboardMindmapObject, "color" | "fill" | "connector">
): MindmapNodeVisualStyle {
  if (depth <= 0) {
    return {
      shape: "rounded-rectangle",
      fill: "#5b7cfa",
      stroke: "#4665d8",
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "bold",
      strokeWidth: 2.5,
      lineStyle: "solid",
    };
  }
  if (depth === 1) {
    return {
      shape: "text",
      fill: "rgba(255, 255, 255, 0.001)",
      stroke: "rgba(91, 124, 250, 0)",
      color: object.color,
      fontSize: 14,
      fontWeight: "normal",
      strokeWidth: 1.5,
      lineStyle: "solid",
    };
  }
  if (depth === 2) {
    return {
      shape: "text",
      fill: "rgba(255, 255, 255, 0.001)",
      stroke: "rgba(91, 124, 250, 0)",
      color: "#475569",
      fontSize: 13,
      fontWeight: "normal",
      strokeWidth: 1,
      lineStyle: "solid",
    };
  }
  return {
    shape: "text",
    fill: "rgba(255, 255, 255, 0.001)",
    stroke: "rgba(91, 124, 250, 0)",
    color: "#64748b",
    fontSize: 12,
    fontWeight: "normal",
    strokeWidth: 1,
    lineStyle: "solid",
  };
}

function isMindmapNodeShape(value: unknown): value is MindmapNodeShape {
  return value === "text" || isShapeKind(value);
}

/** Resolve a node's complete visual style from the shared depth defaults. */
export function resolveMindmapNodeVisualStyle(
  node: Pick<
    WhiteboardMindmapNode,
    | "shape"
    | "fill"
    | "stroke"
    | "color"
    | "fontSize"
    | "lineStyle"
    | "fontWeight"
    | "strokeWidth"
  > &
    Partial<
      Pick<
        WhiteboardMindmapNode,
        "id" | "fontStyle" | "textDecoration" | "align" | "opacity"
      >
    >,
  depth: number,
  object: Pick<
    WhiteboardMindmapObject,
    "color" | "fill" | "connector" | "layoutScale"
  > &
    Partial<
      Pick<WhiteboardMindmapObject, "theme" | "nodes" | "order" | "rootId">
    >
): MindmapNodeVisualStyle {
  const baseDefaults = depthVisualDefaults(depth, object);
  const theme = object.theme;
  const themeStyle = theme
    ? depth === 0
      ? theme.root
      : depth === 1
      ? theme.branch
      : theme.leaf
    : {};
  let inherited: Partial<WhiteboardMindmapNode> = {};
  let branchColor: string | undefined;
  if (node.id && object.nodes) {
    const ancestors: string[] = [];
    const seen = new Set<string>();
    let parent = object.nodes[node.id]?.parentId;
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      ancestors.unshift(parent);
      parent = object.nodes[parent]?.parentId;
    }
    for (const id of ancestors)
      inherited = { ...inherited, ...object.nodes[id]?.branchStyleOverrides };
    if (
      theme?.branchColors.length &&
      object.rootId &&
      object.order &&
      depth > 0
    ) {
      const branchId =
        ancestors.find((id) => object.nodes![id]?.parentId === object.rootId) ||
        node.id;
      const branches = object.order.filter(
        (id) => object.nodes![id]?.parentId === object.rootId
      );
      branchColor =
        theme.branchColors[
          Math.max(0, branches.indexOf(branchId)) % theme.branchColors.length
        ];
    }
  }
  const fallback = {
    ...baseDefaults,
    ...themeStyle,
    ...(branchColor ? { color: branchColor, stroke: branchColor } : {}),
    ...inherited,
  };

  const layoutScale = resolveMindmapLayoutScale(object.layoutScale);
  return {
    shape: isMindmapNodeShape(node.shape) ? node.shape : fallback.shape,
    fill: node.fill || fallback.fill || object.fill,
    fillSource: node.fill
      ? "node"
      : inherited.fill
      ? "branch"
      : themeStyle.fill
      ? "theme"
      : "default",
    stroke: node.stroke || fallback.stroke || object.connector,
    color: node.color || fallback.color || object.color,
    fontSize: Number.isFinite(node.fontSize)
      ? resolveMindmapFontSize(node.fontSize as number, layoutScale)
      : inherited.fontSize !== undefined
      ? inherited.fontSize
      : fallback.fontSize * layoutScale,
    fontWeight: node.fontWeight || fallback.fontWeight,
    fontStyle:
      node.fontStyle || inherited.fontStyle || themeStyle.fontStyle || "normal",
    textDecoration:
      node.textDecoration ||
      inherited.textDecoration ||
      themeStyle.textDecoration ||
      "none",
    align:
      node.align ||
      inherited.align ||
      themeStyle.align ||
      (depth === 0 ? "center" : "left"),
    opacity: node.opacity ?? inherited.opacity ?? themeStyle.opacity ?? 1,
    strokeWidth: Number.isFinite(node.strokeWidth)
      ? Math.max(0, node.strokeWidth as number)
      : inherited.strokeWidth !== undefined
      ? inherited.strokeWidth
      : fallback.strokeWidth * layoutScale,
    lineStyle:
      (node.lineStyle || inherited.lineStyle || themeStyle.lineStyle) ===
        "dash" ||
      (node.lineStyle || inherited.lineStyle || themeStyle.lineStyle) === "dot"
        ? ((node.lineStyle ||
            inherited.lineStyle ||
            themeStyle.lineStyle) as MindmapLineStyle)
        : "solid",
  };
}

export type MindmapTransformGeometry = Pick<
  WhiteboardMindmapObject,
  "x" | "y" | "width" | "height" | "rotation"
>;

/**
 * Returns the visible mind-map rectangle used by Konva's selection outline.
 * Persisted mind maps keep layout padding around their nodes, so using the
 * object's stored rectangle would place external controls too far away.
 */
export function resolveMindmapVisibleTransformGeometry(
  object: WhiteboardMindmapObject
): MindmapTransformGeometry {
  const bounds = resolveMindmapObjectGeometry(object, { padding: 0 }).bounds;
  const origin = transformRectanglePoint(object, {
    x: object.x + bounds.x + (object.flipX ? bounds.width : 0),
    y: object.y + bounds.y + (object.flipY ? bounds.height : 0),
  });
  return {
    x: origin.x,
    y: origin.y,
    width: bounds.width,
    height: bounds.height,
    rotation: object.rotation,
  };
}

function resolvedTransformPosition(
  sourcePosition: number,
  requestedPosition: number,
  requestedScale: number,
  effectiveScale: number
) {
  const requestedDelta = requestedScale - 1;
  if (Math.abs(requestedDelta) < 0.000001) return sourcePosition;
  return (
    sourcePosition +
    (requestedPosition - sourcePosition) *
      ((effectiveScale - 1) / requestedDelta)
  );
}

/** Applies one uniform mind-map transform using the same clamped scale everywhere. */
export function scaleMindmapForTransform(
  object: WhiteboardMindmapObject,
  geometry: MindmapTransformGeometry
): WhiteboardMindmapObject {
  const requestedScaleX = geometry.width / Math.max(0.001, object.width);
  const requestedScaleY = geometry.height / Math.max(0.001, object.height);
  const requestedVisualScale = Math.sqrt(
    Math.abs(requestedScaleX * requestedScaleY)
  );
  const currentGeometry = resolveMindmapObjectGeometry(object, { padding: 0 });
  const currentLayoutScale = resolveMindmapLayoutScale(object.layoutScale);
  const nextLayoutScale = resolveMindmapLayoutScale(
    currentLayoutScale * requestedVisualScale
  );
  const effectiveVisualScale = nextLayoutScale / currentLayoutScale;
  const scaleAdjustment =
    requestedVisualScale > 0 ? effectiveVisualScale / requestedVisualScale : 1;
  const effectiveScaleX = requestedScaleX * scaleAdjustment;
  const effectiveScaleY = requestedScaleY * scaleAdjustment;
  const nodes = Object.fromEntries(
    Object.entries(object.nodes).map(([nodeId, node]) => {
      const geometryNode = currentGeometry.nodes[nodeId];
      const visualStyle = geometryNode
        ? resolveMindmapNodeVisualStyle(node, geometryNode.depth, object)
        : undefined;
      const sourceFontSize = node.fontSize ?? visualStyle?.fontSize;
      const sourceStrokeWidth = node.strokeWidth ?? visualStyle?.strokeWidth;
      return [
        nodeId,
        {
          ...node,
          x: (node.x || 0) * effectiveScaleX,
          y: (node.y || 0) * effectiveScaleY,
          width: (node.width || 144 * currentLayoutScale) * effectiveScaleX,
          height: (node.height || 44 * currentLayoutScale) * effectiveScaleY,
          ...(sourceFontSize !== undefined
            ? {
                fontSize: resolveMindmapFontSize(
                  sourceFontSize * effectiveVisualScale,
                  nextLayoutScale
                ),
              }
            : {}),
          ...(sourceStrokeWidth !== undefined
            ? {
                strokeWidth: Math.max(
                  0.01,
                  sourceStrokeWidth * effectiveVisualScale
                ),
              }
            : {}),
          ...(node.textMaxWidth !== undefined
            ? { textMaxWidth: node.textMaxWidth * effectiveVisualScale }
            : {}),
          ...(node.branchStyleOverrides
            ? {
                branchStyleOverrides: {
                  ...node.branchStyleOverrides,
                  ...(node.branchStyleOverrides.fontSize !== undefined
                    ? {
                        fontSize:
                          node.branchStyleOverrides.fontSize *
                          effectiveVisualScale,
                      }
                    : {}),
                  ...(node.branchStyleOverrides.strokeWidth !== undefined
                    ? {
                        strokeWidth:
                          node.branchStyleOverrides.strokeWidth *
                          effectiveVisualScale,
                      }
                    : {}),
                },
              }
            : {}),
          ...(node.imageWidth !== undefined
            ? { imageWidth: node.imageWidth * effectiveVisualScale }
            : {}),
          ...(node.imageHeight !== undefined
            ? { imageHeight: node.imageHeight * effectiveVisualScale }
            : {}),
        },
      ];
    })
  );
  return {
    ...object,
    ...geometry,
    x: resolvedTransformPosition(
      object.x,
      geometry.x,
      requestedScaleX,
      effectiveScaleX
    ),
    y: resolvedTransformPosition(
      object.y,
      geometry.y,
      requestedScaleY,
      effectiveScaleY
    ),
    width: object.width * effectiveScaleX,
    height: object.height * effectiveScaleY,
    layoutScale: nextLayoutScale,
    nodes,
  };
}

/**
 * Returns the rendered SVG/Konva path for a mind-map branch style.
 *
 * Geometry calculation deliberately stays style agnostic so layout previews,
 * hit testing and export all share the same node coordinates.  Consumers
 * must use this adapter when painting a branch; otherwise a rounded/right
 * angle selection would silently fall back to the default polyline.
 */
export function mindmapBranchPathData(
  branch: MindmapBranchPathDescriptor,
  style: MindmapBranchStyle = "curve",
  layoutScale = 1
) {
  if (
    style === "curve" &&
    branch.kind === "curve" &&
    branch.points.length === 4
  ) {
    return branch.path;
  }
  if (style === "round-angle") {
    return roundedPolylinePathData(
      branch.points.flatMap((point) => [point.x, point.y]),
      8 * resolveMindmapLayoutScale(layoutScale)
    );
  }
  return branch.points.length
    ? `M ${formatNumber(branch.points[0].x)} ${formatNumber(
        branch.points[0].y
      )}${branch.points
        .slice(1)
        .map((point) => ` L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
        .join("")}`
    : "";
}

export interface MindmapGeometryResult {
  rootId: string;
  rootPosition: MindmapPoint;
  visibleIds: string[];
  nodes: Record<string, MindmapNodeGeometry>;
  bounds: MindmapBounds;
  branches: MindmapBranchPathDescriptor[];
  summaries?: import("./professional").MindmapProfessionalPath[];
  boundaries?: import("./professional").MindmapProfessionalPath[];
  relations?: import("./professional").MindmapProfessionalPath[];
}

export interface MindmapGeometryOptions {
  rootPosition?: MindmapPoint;
  padding?: number;
}

export type MindmapNavigationKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown";

const DEFAULT_NODE_WIDTH = 144;
const DEFAULT_NODE_HEIGHT = 44;
const MINDMAP_LEVEL_GAP = 64;
const MINDMAP_CROSS_GAP = 24;
const TREE_LEVEL_GAP = 72;
const TREE_ROOT_GAP = 48;
const TREE_CROSS_GAP = 22;
const TIMELINE_MAIN_GAP = 72;
const TIMELINE_BRANCH_GAP = 56;
const TIMELINE_CROSS_GAP = 28;

export const MIN_MINDMAP_LAYOUT_SCALE = 0.01;
export const MAX_MINDMAP_LAYOUT_SCALE = 100;

/** Keeps imported and collaboratively edited scale values finite and usable. */
export function resolveMindmapLayoutScale(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(
        MIN_MINDMAP_LAYOUT_SCALE,
        Math.min(MAX_MINDMAP_LAYOUT_SCALE, value)
      )
    : 1;
}

const MINDMAP_TOOLBAR_VALUE_PRECISION = 100;

/**
 * Converts a persisted, canvas-scaled visual value back to the logical value
 * presented by the node toolbar. The small rounding step removes transform
 * noise such as 14.040007028 / 1.002857645 while preserving useful decimals.
 */
export function resolveMindmapToolbarLogicalValue(
  value: unknown,
  layoutScale: unknown,
  fallback: number
) {
  const resolvedScale = resolveMindmapLayoutScale(layoutScale);
  const scaledValue =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback * resolvedScale;
  return (
    Math.round(
      (scaledValue / resolvedScale) * MINDMAP_TOOLBAR_VALUE_PRECISION
    ) / MINDMAP_TOOLBAR_VALUE_PRECISION
  );
}

/** Converts a toolbar preset into the scaled value persisted on the node. */
export function scaleMindmapToolbarValue(
  logicalValue: number,
  layoutScale: unknown
) {
  return logicalValue * resolveMindmapLayoutScale(layoutScale);
}

/** Formats toolbar values without floating-point tails or trailing zeroes. */
export function formatMindmapToolbarValue(value: number) {
  return String(
    Math.round(value * MINDMAP_TOOLBAR_VALUE_PRECISION) /
      MINDMAP_TOOLBAR_VALUE_PRECISION
  );
}

/** Normalizes direct font-size input to the range supported by mind-map nodes. */
export function parseMindmapToolbarFontSizeInput(
  value: string,
  fallback: number
) {
  const trimmed = value.trim();
  const parsed = trimmed ? Number(trimmed) : Number.NaN;
  const fallbackValue = Number.isFinite(fallback) ? fallback : 14;
  const candidate = Number.isFinite(parsed) ? parsed : fallbackValue;
  return Math.max(8, Math.min(256, Math.round(candidate)));
}

/** Keeps explicit font sizes proportional across whole-map transforms. */
export function resolveMindmapFontSize(value: number, layoutScale = 1) {
  const resolvedScale = resolveMindmapLayoutScale(layoutScale);
  return Math.max(
    8 * Math.min(1, resolvedScale),
    Math.min(256 * Math.max(1, resolvedScale), value)
  );
}

/** Shared secondary type scale for the external node description. */
export function resolveMindmapSummaryFontSize(value: unknown, layoutScale = 1) {
  const resolvedScale = resolveMindmapLayoutScale(layoutScale);
  const nodeFontSize =
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : 14 * resolvedScale;
  return Math.max(
    11 * resolvedScale,
    resolveMindmapFontSize(nodeFontSize, resolvedScale) - 2 * resolvedScale
  );
}

export const MINDMAP_NODE_IMAGE_DEFAULT_SIZE = { width: 48, height: 28 };
export const MINDMAP_NODE_IMAGE_MIN_SIZE = { width: 24, height: 16 };
export const MINDMAP_NODE_IMAGE_MAX_SIZE = { width: 240, height: 180 };
export const MINDMAP_NODE_IMAGE_INITIAL_MAX_DIMENSION = 96;

export function isMindmapNodeImagePlacement(
  value: unknown
): value is MindmapNodeImagePlacement {
  return (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  );
}

export function resolveMindmapNodeImagePlacement(
  value: unknown
): MindmapNodeImagePlacement {
  return isMindmapNodeImagePlacement(value) ? value : "right";
}

/** Keeps embedded node images proportional while applying the shared limits. */
export function resolveMindmapNodeImageSize(
  width: unknown,
  height: unknown,
  layoutScale = 1
) {
  const scale = resolveMindmapLayoutScale(layoutScale);
  const fallbackWidth = MINDMAP_NODE_IMAGE_DEFAULT_SIZE.width * scale;
  const fallbackHeight = MINDMAP_NODE_IMAGE_DEFAULT_SIZE.height * scale;
  const sourceWidth =
    typeof width === "number" && Number.isFinite(width) && width > 0
      ? width
      : fallbackWidth;
  const sourceHeight =
    typeof height === "number" && Number.isFinite(height) && height > 0
      ? height
      : fallbackHeight;
  const minimumScale = Math.max(
    (MINDMAP_NODE_IMAGE_MIN_SIZE.width * scale) / sourceWidth,
    (MINDMAP_NODE_IMAGE_MIN_SIZE.height * scale) / sourceHeight
  );
  const maximumScale = Math.min(
    (MINDMAP_NODE_IMAGE_MAX_SIZE.width * scale) / sourceWidth,
    (MINDMAP_NODE_IMAGE_MAX_SIZE.height * scale) / sourceHeight
  );
  const fallbackMinimumScale = Math.min(
    (MINDMAP_NODE_IMAGE_MIN_SIZE.width * scale) / sourceWidth,
    (MINDMAP_NODE_IMAGE_MIN_SIZE.height * scale) / sourceHeight
  );
  const resolvedSizeScale =
    minimumScale <= maximumScale
      ? Math.max(minimumScale, Math.min(maximumScale, 1))
      : Math.max(fallbackMinimumScale, Math.min(maximumScale, 1));
  return {
    width: sourceWidth * resolvedSizeScale,
    height: sourceHeight * resolvedSizeScale,
  };
}

/** Fits a newly uploaded image to the node while preserving its source ratio. */
export function resolveMindmapNodeInitialImageSize(
  width: unknown,
  height: unknown,
  layoutScale = 1
) {
  const scale = resolveMindmapLayoutScale(layoutScale);
  const fallback = {
    width: MINDMAP_NODE_IMAGE_DEFAULT_SIZE.width * scale,
    height: MINDMAP_NODE_IMAGE_DEFAULT_SIZE.height * scale,
  };
  const sourceWidth =
    typeof width === "number" && Number.isFinite(width) && width > 0
      ? width
      : fallback.width;
  const sourceHeight =
    typeof height === "number" && Number.isFinite(height) && height > 0
      ? height
      : fallback.height;
  const fitScale = Math.min(
    1,
    (MINDMAP_NODE_IMAGE_INITIAL_MAX_DIMENSION * scale) /
      Math.max(sourceWidth, sourceHeight)
  );
  return resolveMindmapNodeImageSize(
    sourceWidth * fitScale,
    sourceHeight * fitScale,
    scale
  );
}

function estimatedMindmapContentTextWidth(
  text: string,
  fontSize: number,
  options: { bold?: boolean; italic?: boolean } = {}
) {
  return measureMindmapText(
    text,
    fontSize,
    Boolean(options.bold),
    Boolean(options.italic)
  );
}

export const MINDMAP_SUMMARY_GAP = 8;
export const MINDMAP_SUMMARY_QUOTE_WIDTH = 2;
export const MINDMAP_SUMMARY_TEXT_INSET = 10;
export const MINDMAP_SUMMARY_MAX_LINES = 3;
export const MINDMAP_SUMMARY_MAX_WIDTH = 200;
export const MINDMAP_ROOT_SUMMARY_MAX_WIDTH = 240;

function wrapMindmapSummaryLines(
  text: string,
  maxWidth: number,
  fontSize: number
) {
  const wrapped: string[] = [];
  text.split(/\r?\n/).forEach((sourceLine) => {
    const characters = Array.from(sourceLine);
    if (!characters.length) {
      wrapped.push("");
      return;
    }
    let line = "";
    characters.forEach((character) => {
      const candidate = `${line}${character}`;
      if (
        line &&
        estimatedMindmapContentTextWidth(candidate, fontSize) > maxWidth
      ) {
        wrapped.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    });
    wrapped.push(line.trimEnd());
  });
  const truncated = wrapped.length > MINDMAP_SUMMARY_MAX_LINES;
  const lines = wrapped.slice(0, MINDMAP_SUMMARY_MAX_LINES);
  if (truncated && lines.length) {
    let finalLine = lines[lines.length - 1].trimEnd();
    while (
      finalLine &&
      estimatedMindmapContentTextWidth(`${finalLine}…`, fontSize) > maxWidth
    ) {
      finalLine = Array.from(finalLine).slice(0, -1).join("").trimEnd();
    }
    lines[lines.length - 1] = `${finalLine}…`;
  }
  return { lines, truncated };
}

function centeredOffset(available: number, content: number) {
  return Math.max(0, (available - content) / 2);
}

/**
 * Resolves the complete node-internal layout used by canvas, auto-size and SVG.
 * Explicit dimensions may enlarge a node, but never clip its intrinsic content.
 */
export function resolveMindmapNodeContentGeometry(
  node: Pick<
    WhiteboardMindmapNode,
    | "label"
    | "summary"
    | "fontSize"
    | "fontWeight"
    | "fontStyle"
    | "shape"
    | "icon"
    | "sticker"
    | "imageAssetId"
    | "imageWidth"
    | "imageHeight"
    | "imagePlacement"
    | "widthMode"
    | "textMaxWidth"
    | "labelStyleRanges"
    | "textDecoration"
    | "color"
    | "align"
  >,
  options: MindmapNodeContentGeometryOptions = {}
): MindmapNodeContentGeometry {
  const layoutScale = resolveMindmapLayoutScale(options.layoutScale);
  const isRoot = Boolean(options.isRoot);
  const fontSize = resolveMindmapFontSize(
    node.fontSize ||
      (isRoot
        ? 18
        : options.depth === 2
        ? 13
        : (options.depth || 0) >= 3
        ? 12
        : 14) * layoutScale,
    layoutScale
  );
  const summaryFontSize = resolveMindmapSummaryFontSize(fontSize, layoutScale);
  const decorationWidth =
    node.icon || node.sticker ? fontSize + 10 * layoutScale : 0;
  const effectivePlacement = resolveMindmapNodeImagePlacement(
    node.imagePlacement
  );
  const horizontalPlacement =
    effectivePlacement === "left" || effectivePlacement === "right";
  const imageColumn =
    node.imageAssetId && horizontalPlacement
      ? resolveMindmapNodeImageSize(
          node.imageWidth,
          node.imageHeight,
          layoutScale
        ).width +
        8 * layoutScale
      : 0;
  const configuredMaxWidth =
    Number.isFinite(node.textMaxWidth) && node.textMaxWidth! > 0
      ? node.textMaxWidth!
      : 320 * layoutScale;
  const textLayout = resolveMindmapTextLayout(node, fontSize, {
    metrics: options.metrics,
    maxWidth: node.widthMode
      ? Math.max(fontSize, configuredMaxWidth - decorationWidth - imageColumn)
      : undefined,
  });
  const labelLines = textLayout.lines;
  const summaryText = node.summary ? String(node.summary).trim() : "";
  const labelTextWidth = labelLines.some((line) => line.length > 0)
    ? Math.ceil(textLayout.width + Math.max(2 * layoutScale, fontSize * 0.08))
    : 0;
  const labelHeight = textLayout.height;
  const textIntrinsicWidth =
    node.widthMode === "fixed"
      ? Math.max(fontSize, configuredMaxWidth - imageColumn)
      : labelTextWidth + decorationWidth;
  const textIntrinsicHeight = labelHeight;
  const paddingX = (isRoot ? 20 : 12) * layoutScale;
  const paddingY = (isRoot ? 10 : 6) * layoutScale;
  const gap = 8 * layoutScale;
  const placement = resolveMindmapNodeImagePlacement(node.imagePlacement);
  const imageSize = node.imageAssetId
    ? resolveMindmapNodeImageSize(
        node.imageWidth,
        node.imageHeight,
        layoutScale
      )
    : undefined;
  const horizontalImage = placement === "left" || placement === "right";
  const contentWidth = imageSize
    ? horizontalImage
      ? imageSize.width + gap + textIntrinsicWidth
      : Math.max(imageSize.width, textIntrinsicWidth)
    : textIntrinsicWidth;
  const contentHeight = imageSize
    ? horizontalImage
      ? Math.max(imageSize.height, textIntrinsicHeight)
      : imageSize.height + gap + textIntrinsicHeight
    : textIntrinsicHeight;
  const intrinsicWidth = Math.max(
    (isRoot ? 104 : 72) * layoutScale,
    Math.ceil(contentWidth + paddingX * 2)
  );
  const intrinsicHeight = Math.max(
    (isRoot ? 48 : 32) * layoutScale,
    Math.ceil(contentHeight + paddingY * 2)
  );
  const explicitWidth =
    typeof options.width === "number" &&
    Number.isFinite(options.width) &&
    options.width > 0
      ? options.width
      : 0;
  const explicitHeight =
    typeof options.height === "number" &&
    Number.isFinite(options.height) &&
    options.height > 0
      ? options.height
      : 0;
  const width =
    options.preserveSize && explicitWidth
      ? explicitWidth
      : Math.max(intrinsicWidth, explicitWidth);
  const height =
    options.preserveSize && explicitHeight
      ? explicitHeight
      : Math.max(intrinsicHeight, explicitHeight);
  const innerWidth = Math.max(layoutScale, width - paddingX * 2);
  const innerHeight = Math.max(layoutScale, height - paddingY * 2);
  const contentX = paddingX + centeredOffset(innerWidth, contentWidth);
  const contentY = paddingY + centeredOffset(innerHeight, contentHeight);
  let text: MindmapContentRect = {
    x: contentX,
    y: contentY,
    width: textIntrinsicWidth,
    height: textIntrinsicHeight,
  };
  let image: MindmapContentRect | undefined;
  if (imageSize) {
    if (placement === "left") {
      image = {
        x: contentX,
        y: contentY + centeredOffset(contentHeight, imageSize.height),
        ...imageSize,
      };
      text = {
        ...text,
        x: contentX + imageSize.width + gap,
        y: contentY + centeredOffset(contentHeight, textIntrinsicHeight),
      };
    } else if (placement === "right") {
      text = {
        ...text,
        y: contentY + centeredOffset(contentHeight, textIntrinsicHeight),
      };
      image = {
        x: contentX + textIntrinsicWidth + gap,
        y: contentY + centeredOffset(contentHeight, imageSize.height),
        ...imageSize,
      };
    } else if (placement === "top") {
      image = {
        x: contentX + centeredOffset(contentWidth, imageSize.width),
        y: contentY,
        ...imageSize,
      };
      text = {
        ...text,
        x: contentX + centeredOffset(contentWidth, textIntrinsicWidth),
        y: contentY + imageSize.height + gap,
      };
    } else {
      text = {
        ...text,
        x: contentX + centeredOffset(contentWidth, textIntrinsicWidth),
      };
      image = {
        x: contentX + centeredOffset(contentWidth, imageSize.width),
        y: contentY + textIntrinsicHeight + gap,
        ...imageSize,
      };
    }
  }
  const decoration = decorationWidth
    ? {
        x: text.x,
        y: text.y,
        width: decorationWidth,
        height: labelHeight,
      }
    : undefined;
  const label = {
    x: text.x + decorationWidth,
    y: text.y,
    width: Math.max(layoutScale, text.width - decorationWidth),
    height: text.height,
  };
  const body = { x: 0, y: 0, width, height };
  const summaryLineHeight = summaryFontSize * 1.5;
  const summaryMaxWidth =
    (isRoot ? MINDMAP_ROOT_SUMMARY_MAX_WIDTH : MINDMAP_SUMMARY_MAX_WIDTH) *
    layoutScale;
  const summaryTextInset = MINDMAP_SUMMARY_TEXT_INSET * layoutScale;
  const summaryNaturalWidth = summaryText
    ? Math.max(
        layoutScale,
        ...summaryText
          .split(/\r?\n/)
          .map((line) =>
            estimatedMindmapContentTextWidth(line, summaryFontSize)
          )
      )
    : 0;
  const summaryBlockWidth = summaryText
    ? Math.min(summaryMaxWidth, summaryNaturalWidth + summaryTextInset)
    : 0;
  const wrappedSummary = summaryText
    ? wrapMindmapSummaryLines(
        summaryText,
        Math.max(layoutScale, summaryBlockWidth - summaryTextInset),
        summaryFontSize
      )
    : { lines: [] as string[], truncated: false };
  const summaryHeight = wrappedSummary.lines.length * summaryLineHeight;
  // Text-only child nodes have a transparent persisted body that is taller
  // and wider than what users actually see. Anchor their description to the
  // visible text/image group so short descriptions do not drift inward and
  // the vertical gap matches the root node's visible 8px separation.
  const textOnlyNode = !isRoot && (!node.shape || node.shape === "text");
  const summaryBlockX = textOnlyNode
    ? contentX
    : (width - summaryBlockWidth) / 2;
  const summaryBlockY =
    (textOnlyNode ? contentY + contentHeight : height) +
    MINDMAP_SUMMARY_GAP * layoutScale;
  const summary = summaryText
    ? {
        x: summaryBlockX + summaryTextInset,
        y: summaryBlockY,
        width: Math.max(layoutScale, summaryBlockWidth - summaryTextInset),
        height: summaryHeight,
      }
    : undefined;
  const summaryQuoteLine = summaryText
    ? {
        x: summaryBlockX,
        y: summaryBlockY,
        width: MINDMAP_SUMMARY_QUOTE_WIDTH * layoutScale,
        height: summaryHeight,
      }
    : undefined;
  const footprintLeft = Math.min(0, summaryBlockX);
  const footprintRight = Math.max(width, summaryBlockX + summaryBlockWidth);
  const footprint = summaryText
    ? {
        x: footprintLeft,
        y: 0,
        width: footprintRight - footprintLeft,
        height: summaryBlockY + summaryHeight,
      }
    : body;
  return {
    labelLines,
    labelLineHeight: textLayout.lineHeight,
    textRuns: textLayout.runs.map((run) => {
      const lineWidth = textLayout.runs
        .filter((item) => item.line === run.line)
        .reduce((sum, item) => sum + item.width, 0);
      const remaining = Math.max(0, label.width - lineWidth);
      const align = node.align || (isRoot ? "center" : "left");
      return {
        ...run,
        x:
          run.x +
          (align === "center"
            ? remaining / 2
            : align === "right"
            ? remaining
            : 0),
      };
    }),
    width,
    height,
    body,
    footprint,
    placement,
    text,
    label,
    summary,
    summaryQuoteLine,
    summaryLines: summaryText ? wrappedSummary.lines : undefined,
    summaryLineCount: wrappedSummary.lines.length,
    summaryTruncated: wrappedSummary.truncated,
    summaryFontSize,
    summaryLineHeight,
    decoration,
    image,
  };
}

export function resolveMindmapNodeImageDropPlacement(
  point: MindmapPoint,
  bounds: Pick<MindmapBounds, "width" | "height">,
  current: MindmapNodeImagePlacement = "right",
  neutralRatio = 0.12
): MindmapNodeImagePlacement {
  const halfWidth = Math.max(1, bounds.width / 2);
  const halfHeight = Math.max(1, bounds.height / 2);
  const horizontal = (point.x - halfWidth) / halfWidth;
  const vertical = (point.y - halfHeight) / halfHeight;
  if (Math.max(Math.abs(horizontal), Math.abs(vertical)) < neutralRatio)
    return current;
  if (Math.abs(horizontal) >= Math.abs(vertical))
    return horizontal < 0 ? "left" : "right";
  return vertical < 0 ? "top" : "bottom";
}

function positiveSize(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function pointValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function orderedNodeIds(input: MindmapGeometryInput) {
  const seen = new Set<string>();
  const result: string[] = [];
  input.order.forEach((id) => {
    if (!seen.has(id) && input.nodes[id]) {
      seen.add(id);
      result.push(id);
    }
  });
  Object.keys(input.nodes)
    .sort()
    .forEach((id) => {
      if (!seen.has(id)) result.push(id);
    });
  return result;
}

interface VisibleTree {
  visibleIds: string[];
  children: Map<string, string[]>;
  depth: Map<string, number>;
}

function visibleTree(input: MindmapGeometryInput): VisibleTree {
  const ordered = orderedNodeIds(input);
  const rawChildren = new Map<string, string[]>();
  ordered.forEach((id) => {
    const parentId = input.nodes[id]?.parentId;
    if (!parentId || id === input.rootId) return;
    const siblings = rawChildren.get(parentId) || [];
    siblings.push(id);
    rawChildren.set(parentId, siblings);
  });
  const visibleIds: string[] = [];
  const children = new Map<string, string[]>();
  const depth = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (id: string, level: number) => {
    if (visited.has(id) || !input.nodes[id]) return;
    visited.add(id);
    visibleIds.push(id);
    depth.set(id, level);
    if (input.nodes[id].collapsed) {
      children.set(id, []);
      return;
    }
    const next = (rawChildren.get(id) || []).filter(
      (childId) => childId !== id && !visited.has(childId)
    );
    children.set(id, next);
    next.forEach((childId) => visit(childId, level + 1));
    children.set(
      id,
      next.filter((childId) => visited.has(childId))
    );
  };
  visit(input.rootId, 0);
  return { visibleIds, children, depth };
}

function sumExtents(extents: number[], gap: number) {
  return (
    extents.reduce((sum, extent) => sum + extent, 0) +
    Math.max(0, extents.length - 1) * gap
  );
}

function sideForRootChild(
  input: MindmapGeometryInput,
  node: MindmapGeometryNodeInput,
  index: number
): MindmapBranchSide {
  if (input.family === "timeline") {
    return timelineSide(input.direction, node.branchSide, index);
  }
  if (input.family === "tree" && input.direction === "both") {
    // Persisted branchSide is authoritative after an explicit drag or a
    // quick-create from the left/right anchor. Legacy nodes without a side
    // retain Feishu's alternating fallback so old documents remain stable.
    if (node.branchSide === "left" || node.branchSide === "right") {
      return node.branchSide;
    }
    return index % 2 === 0 ? "right" : "left";
  }
  if (input.direction === "top-down") return "bottom";
  if (input.direction === "left") return "left";
  if (input.direction === "both") {
    if (node.branchSide === "left" || node.branchSide === "right") {
      return node.branchSide;
    }
    return index % 2 === 0 ? "right" : "left";
  }
  return "right";
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function pathFromPoints(
  kind: MindmapBranchPathDescriptor["kind"],
  points: MindmapPoint[]
) {
  if (!points.length) return "";
  const start = `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`;
  if (kind === "curve" && points.length === 4) {
    return `${start} C ${formatNumber(points[1].x)} ${formatNumber(
      points[1].y
    )} ${formatNumber(points[2].x)} ${formatNumber(points[2].y)} ${formatNumber(
      points[3].x
    )} ${formatNumber(points[3].y)}`;
  }
  return `${start}${points
    .slice(1)
    .map((point) => ` L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join("")}`;
}

function horizontalCurve(
  parent: MindmapNodeGeometry,
  child: MindmapNodeGeometry,
  side: "left" | "right"
) {
  const start = {
    x: side === "right" ? parent.x + parent.width : parent.x,
    y: parent.y + parent.height / 2,
  };
  const end = {
    x: side === "right" ? child.x : child.x + child.width,
    y: child.y + child.height / 2,
  };
  const middleX = (start.x + end.x) / 2;
  return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
}

function verticalCurve(
  parent: MindmapNodeGeometry,
  child: MindmapNodeGeometry,
  side: "top" | "bottom"
) {
  const start = {
    x: parent.x + parent.width / 2,
    y: side === "bottom" ? parent.y + parent.height : parent.y,
  };
  const end = {
    x: child.x + child.width / 2,
    y: side === "bottom" ? child.y : child.y + child.height,
  };
  const middleY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}

function bottomRouteAroundDescription(
  parent: MindmapNodeGeometry,
  end: MindmapPoint,
  layoutScale: number
): MindmapPoint[] | null {
  const bodyBottom = parent.y + parent.height;
  const footprintBottom = parent.footprint.y + parent.footprint.height;
  if (footprintBottom <= bodyBottom + Number.EPSILON) return null;
  const clearance = 8 * resolveMindmapLayoutScale(layoutScale);
  const routeRight = end.x >= parent.x + parent.width / 2;
  const start = {
    x: routeRight ? parent.x + parent.width : parent.x,
    y: parent.y + parent.height / 2,
  };
  const outsideX = routeRight
    ? parent.footprint.x + parent.footprint.width + clearance
    : parent.footprint.x - clearance;
  const belowDescriptionY = footprintBottom + clearance;
  return [
    start,
    { x: outsideX, y: start.y },
    { x: outsideX, y: belowDescriptionY },
    { x: end.x, y: belowDescriptionY },
    end,
  ];
}

function bottomEntryRouteAroundDescription(
  child: MindmapNodeGeometry,
  start: MindmapPoint,
  end: MindmapPoint,
  layoutScale: number
): MindmapPoint[] | null {
  const bodyBottom = child.y + child.height;
  const footprintBottom = child.footprint.y + child.footprint.height;
  if (footprintBottom <= bodyBottom + Number.EPSILON) return null;
  const clearance = 8 * resolveMindmapLayoutScale(layoutScale);
  const routeRight = start.x >= child.x + child.width / 2;
  const outsideX = routeRight
    ? child.footprint.x + child.footprint.width + clearance
    : child.footprint.x - clearance;
  return [start, { x: outsideX, y: start.y }, { x: outsideX, y: end.y }, end];
}

function elbowPoints(
  parent: MindmapNodeGeometry,
  child: MindmapNodeGeometry,
  side: MindmapBranchSide
) {
  if (side === "left" || side === "right") {
    const start = {
      x: side === "right" ? parent.x + parent.width : parent.x,
      y: parent.y + parent.height / 2,
    };
    const end = {
      x: side === "right" ? child.x : child.x + child.width,
      y: child.y + child.height / 2,
    };
    const middleX = (start.x + end.x) / 2;
    return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
  }
  const start = {
    x: parent.x + parent.width / 2,
    y: side === "bottom" ? parent.y + parent.height : parent.y,
  };
  const end = {
    x: child.x + child.width / 2,
    y: side === "bottom" ? child.y : child.y + child.height,
  };
  const middleY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}

function branchDescriptor(
  input: MindmapGeometryInput,
  root: MindmapNodeGeometry,
  parent: MindmapNodeGeometry,
  child: MindmapNodeGeometry,
  side: MindmapBranchSide
): MindmapBranchPathDescriptor {
  let kind: MindmapBranchPathDescriptor["kind"] = "curve";
  let points: MindmapPoint[];
  if (input.family === "tree" && parent.id === root.id) {
    kind = "elbow";
    const end = {
      x: side === "left" ? child.x + child.width : child.x,
      y: child.y + child.height / 2,
    };
    const avoidingDescription = bottomRouteAroundDescription(
      root,
      end,
      input.layoutScale ?? 1
    );
    if (avoidingDescription) {
      points = avoidingDescription;
    } else {
      const start = { x: root.x + root.width / 2, y: root.y + root.height };
      points = [start, { x: start.x, y: end.y }, end];
    }
  } else if (input.family === "timeline" && parent.id === root.id) {
    kind = "timeline";
    if (input.direction === "vertical") {
      const end = {
        x: side === "left" ? child.x + child.width : child.x,
        y: child.y + child.height / 2,
      };
      const avoidingDescription = bottomRouteAroundDescription(
        root,
        end,
        input.layoutScale ?? 1
      );
      if (avoidingDescription) {
        kind = "elbow";
        points = avoidingDescription;
      } else {
        const start = { x: root.x + root.width / 2, y: root.y + root.height };
        points = [start, { x: start.x, y: end.y }, end];
      }
    } else {
      const start = { x: root.x + root.width, y: root.y + root.height / 2 };
      const end = {
        x: child.x + child.width / 2,
        y: side === "top" ? child.y + child.height : child.y,
      };
      const avoidingDescription =
        side === "top"
          ? bottomEntryRouteAroundDescription(
              child,
              start,
              end,
              input.layoutScale ?? 1
            )
          : null;
      if (avoidingDescription) {
        kind = "elbow";
        points = avoidingDescription;
      } else {
        points = [start, { x: end.x, y: start.y }, end];
      }
    }
  } else if (input.family === "tree" || input.family === "timeline") {
    kind = "elbow";
    const end = {
      x:
        side === "left"
          ? child.x + child.width
          : side === "right"
          ? child.x
          : child.x + child.width / 2,
      y:
        side === "bottom"
          ? child.y
          : side === "top"
          ? child.y + child.height
          : child.y + child.height / 2,
    };
    const defaults = elbowPoints(parent, child, side);
    points =
      side === "bottom"
        ? bottomRouteAroundDescription(parent, end, input.layoutScale ?? 1) ||
          defaults
        : side === "top"
        ? bottomEntryRouteAroundDescription(
            child,
            defaults[0],
            end,
            input.layoutScale ?? 1
          ) || defaults
        : defaults;
  } else if (side === "left" || side === "right") {
    points = horizontalCurve(parent, child, side);
  } else {
    const end = {
      x: child.x + child.width / 2,
      y: side === "bottom" ? child.y : child.y + child.height,
    };
    const defaultPoints = verticalCurve(parent, child, side);
    const avoidingDescription =
      side === "bottom"
        ? bottomRouteAroundDescription(parent, end, input.layoutScale ?? 1)
        : bottomEntryRouteAroundDescription(
            child,
            defaultPoints[0],
            end,
            input.layoutScale ?? 1
          );
    if (avoidingDescription) {
      kind = "elbow";
      points = avoidingDescription;
    } else {
      points = defaultPoints;
    }
  }
  return {
    id: `${parent.id}->${child.id}`,
    parentId: parent.id,
    childId: child.id,
    side,
    kind,
    points,
    path: pathFromPoints(kind, points),
  };
}

/**
 * Computes all visible node coordinates and branch paths from one immutable
 * tree snapshot. Coordinates are absolute in the caller's coordinate space;
 * the root node's top-left point is never changed.
 */
export function resolveMindmapGeometry(
  input: MindmapGeometryInput
): MindmapGeometryResult {
  const layoutScale = resolveMindmapLayoutScale(input.layoutScale);
  const mindmapLevelGap = (input.levelGap ?? MINDMAP_LEVEL_GAP) * layoutScale;
  const mindmapCrossGap = (input.crossGap ?? MINDMAP_CROSS_GAP) * layoutScale;
  const treeLevelGap = TREE_LEVEL_GAP * layoutScale;
  const treeRootGap = TREE_ROOT_GAP * layoutScale;
  const treeCrossGap = TREE_CROSS_GAP * layoutScale;
  const timelineMainGap = TIMELINE_MAIN_GAP * layoutScale;
  const timelineBranchGap = TIMELINE_BRANCH_GAP * layoutScale;
  const timelineCrossGap = TIMELINE_CROSS_GAP * layoutScale;
  const tree = visibleTree(input);
  const rootInput = input.nodes[input.rootId];
  const rootPosition = input.rootPosition || {
    x: pointValue(rootInput?.x),
    y: pointValue(rootInput?.y),
  };
  if (!rootInput || !tree.visibleIds.length) {
    return {
      rootId: input.rootId,
      rootPosition,
      visibleIds: [],
      nodes: {},
      bounds: { x: rootPosition.x, y: rootPosition.y, width: 0, height: 0 },
      branches: [],
    };
  }

  const sizes = new Map<string, { width: number; height: number }>();
  const localFootprints = new Map<string, MindmapContentRect>();
  tree.visibleIds.forEach((id) => {
    const node = input.nodes[id];
    const persistedSize = {
      width: positiveSize(node.width, DEFAULT_NODE_WIDTH * layoutScale),
      height: positiveSize(node.height, DEFAULT_NODE_HEIGHT * layoutScale),
    };
    const content = resolveMindmapNodeContentGeometry(
      {
        label: node.label || "",
        summary: node.summary,
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        fontStyle: node.fontStyle,
        widthMode: node.widthMode,
        textMaxWidth: node.textMaxWidth,
        labelStyleRanges: node.labelStyleRanges,
        textDecoration: node.textDecoration,
        color: node.color,
        shape: node.shape,
        icon: node.icon,
        sticker: node.sticker,
        imageAssetId: node.imageAssetId,
        imageWidth: node.imageWidth,
        imageHeight: node.imageHeight,
        imagePlacement: node.imagePlacement,
      },
      {
        isRoot: id === input.rootId,
        depth: tree.depth.get(id),
        preserveSize: Boolean(input.preserveSize) || !node.widthMode,
        layoutScale,
        ...persistedSize,
      }
    );
    const size = { width: content.width, height: content.height };
    sizes.set(id, size);
    localFootprints.set(id, content.footprint);
  });
  const absoluteFootprint = (id: string, x: number, y: number) => {
    const footprint = localFootprints.get(id) as MindmapContentRect;
    return {
      x: x + footprint.x,
      y: y + footprint.y,
      width: footprint.width,
      height: footprint.height,
    };
  };
  const geometry = new Map<string, MindmapNodeGeometry>();
  const sideById = new Map<string, MindmapBranchSide>();
  const rootChildren = tree.children.get(input.rootId) || [];
  rootChildren.forEach((id, index) => {
    const side = sideForRootChild(input, input.nodes[id], index);
    const mark = (nodeId: string) => {
      sideById.set(nodeId, side);
      (tree.children.get(nodeId) || []).forEach(mark);
    };
    mark(id);
  });

  const rootSize = sizes.get(input.rootId) as { width: number; height: number };
  geometry.set(input.rootId, {
    id: input.rootId,
    parentId: null,
    ...rootPosition,
    ...rootSize,
    footprint: absoluteFootprint(input.rootId, rootPosition.x, rootPosition.y),
    depth: 0,
  });

  const horizontalExtent = new Map<string, number>();
  const measureHorizontal = (id: string): number => {
    const cached = horizontalExtent.get(id);
    if (cached !== undefined) return cached;
    const footprint = localFootprints.get(id) as MindmapContentRect;
    const children = tree.children.get(id) || [];
    const childrenHeight = sumExtents(
      children.map(measureHorizontal),
      input.family === "tree" ? treeCrossGap : mindmapCrossGap
    );
    const extent = Math.max(footprint.height, childrenHeight);
    horizontalExtent.set(id, extent);
    return extent;
  };
  const verticalExtent = new Map<string, number>();
  const measureVertical = (id: string): number => {
    const cached = verticalExtent.get(id);
    if (cached !== undefined) return cached;
    const footprint = localFootprints.get(id) as MindmapContentRect;
    const children = tree.children.get(id) || [];
    const childrenWidth = sumExtents(
      children.map(measureVertical),
      input.family === "timeline" ? timelineCrossGap : mindmapCrossGap
    );
    const extent = Math.max(footprint.width, childrenWidth);
    verticalExtent.set(id, extent);
    return extent;
  };

  const placeHorizontal = (
    id: string,
    side: "left" | "right",
    x: number,
    top: number,
    family: "mindmap" | "tree" | "timeline"
  ) => {
    const inputNode = input.nodes[id];
    const size = sizes.get(id) as { width: number; height: number };
    const footprint = localFootprints.get(id) as MindmapContentRect;
    const extent = measureHorizontal(id);
    const computedY = top + (extent - footprint.height) / 2 - footprint.y;
    const resolvedX = inputNode.positionLocked ? pointValue(inputNode.x) : x;
    const resolvedY = inputNode.positionLocked
      ? pointValue(inputNode.y)
      : computedY;
    geometry.set(id, {
      id,
      parentId: input.nodes[id].parentId,
      x: resolvedX,
      y: resolvedY,
      ...size,
      footprint: absoluteFootprint(id, resolvedX, resolvedY),
      depth: tree.depth.get(id) || 0,
      side,
    });
    const children = tree.children.get(id) || [];
    const gap = family === "tree" ? treeCrossGap : mindmapCrossGap;
    const total = sumExtents(children.map(measureHorizontal), gap);
    let cursor = top + (extent - total) / 2;
    children.forEach((childId) => {
      const childFootprint = localFootprints.get(childId) as MindmapContentRect;
      const childX =
        side === "right"
          ? resolvedX +
            footprint.x +
            footprint.width +
            (family === "mindmap" ? mindmapLevelGap : treeLevelGap) -
            childFootprint.x
          : resolvedX +
            footprint.x -
            (family === "mindmap" ? mindmapLevelGap : treeLevelGap) -
            childFootprint.x -
            childFootprint.width;
      placeHorizontal(childId, side, childX, cursor, family);
      cursor += measureHorizontal(childId) + gap;
    });
  };

  const placeVertical = (
    id: string,
    side: "top" | "bottom",
    y: number,
    left: number,
    family: "mindmap" | "timeline"
  ) => {
    const inputNode = input.nodes[id];
    const size = sizes.get(id) as { width: number; height: number };
    const footprint = localFootprints.get(id) as MindmapContentRect;
    const extent = measureVertical(id);
    const computedX = left + (extent - footprint.width) / 2 - footprint.x;
    const resolvedX = inputNode.positionLocked
      ? pointValue(inputNode.x)
      : computedX;
    const resolvedY = inputNode.positionLocked ? pointValue(inputNode.y) : y;
    geometry.set(id, {
      id,
      parentId: input.nodes[id].parentId,
      x: resolvedX,
      y: resolvedY,
      ...size,
      footprint: absoluteFootprint(id, resolvedX, resolvedY),
      depth: tree.depth.get(id) || 0,
      side,
    });
    const children = tree.children.get(id) || [];
    const gap = family === "timeline" ? timelineCrossGap : mindmapCrossGap;
    const total = sumExtents(children.map(measureVertical), gap);
    let cursor = left + (extent - total) / 2;
    children.forEach((childId) => {
      const childFootprint = localFootprints.get(childId) as MindmapContentRect;
      const childY =
        side === "bottom"
          ? resolvedY +
            footprint.y +
            footprint.height +
            (family === "timeline" ? timelineBranchGap : mindmapLevelGap) -
            childFootprint.y
          : resolvedY +
            footprint.y -
            (family === "timeline" ? timelineBranchGap : mindmapLevelGap) -
            childFootprint.y -
            childFootprint.height;
      placeVertical(childId, side, childY, cursor, family);
      cursor += measureVertical(childId) + gap;
    });
  };

  const root = geometry.get(input.rootId) as MindmapNodeGeometry;
  if (input.family === "timeline" && input.direction === "vertical") {
    let cursor = root.footprint.y + root.footprint.height + timelineMainGap;
    rootChildren.forEach((id) => {
      const side = sideById.get(id) === "right" ? "right" : "left";
      const extent = measureHorizontal(id);
      const childFootprint = localFootprints.get(id) as MindmapContentRect;
      const x =
        side === "right"
          ? root.x + root.width / 2 + timelineBranchGap - childFootprint.x
          : root.x +
            root.width / 2 -
            timelineBranchGap -
            childFootprint.x -
            childFootprint.width;
      placeHorizontal(id, side, x, cursor, "timeline");
      cursor += extent + timelineMainGap;
    });
  } else if (input.family === "timeline") {
    let cursor = root.footprint.x + root.footprint.width + timelineMainGap;
    rootChildren.forEach((id) => {
      const side = sideById.get(id) === "bottom" ? "bottom" : "top";
      const extent = measureVertical(id);
      const childFootprint = localFootprints.get(id) as MindmapContentRect;
      const y =
        side === "bottom"
          ? root.y + root.height / 2 + timelineBranchGap - childFootprint.y
          : root.y +
            root.height / 2 -
            timelineBranchGap -
            childFootprint.y -
            childFootprint.height;
      placeVertical(id, side, y, cursor, "timeline");
      cursor += extent + timelineMainGap;
    });
  } else if (input.family === "tree") {
    let cursor = root.footprint.y + root.footprint.height + treeRootGap;
    rootChildren.forEach((id) => {
      const side = sideById.get(id) === "left" ? "left" : "right";
      const childFootprint = localFootprints.get(id) as MindmapContentRect;
      const x =
        side === "right"
          ? root.x + root.width / 2 + treeLevelGap - childFootprint.x
          : root.x +
            root.width / 2 -
            treeLevelGap -
            childFootprint.x -
            childFootprint.width;
      placeHorizontal(id, side, x, cursor, "tree");
      cursor += measureHorizontal(id) + treeCrossGap;
    });
  } else if (input.direction === "top-down") {
    const extents = rootChildren.map(measureVertical);
    const total = sumExtents(extents, mindmapCrossGap);
    let cursor = root.x + root.width / 2 - total / 2;
    rootChildren.forEach((id) => {
      const size = sizes.get(id) as { width: number; height: number };
      placeVertical(
        id,
        "bottom",
        root.footprint.y + root.footprint.height + mindmapLevelGap,
        cursor,
        "mindmap"
      );
      cursor += measureVertical(id) + mindmapCrossGap;
      void size;
    });
  } else {
    (["left", "right"] as const).forEach((side) => {
      const children = rootChildren.filter((id) => sideById.get(id) === side);
      const total = sumExtents(
        children.map(measureHorizontal),
        mindmapCrossGap
      );
      let cursor = root.y + root.height / 2 - total / 2;
      children.forEach((id) => {
        const childFootprint = localFootprints.get(id) as MindmapContentRect;
        const x =
          side === "right"
            ? root.footprint.x +
              root.footprint.width +
              mindmapLevelGap -
              childFootprint.x
            : root.footprint.x -
              mindmapLevelGap -
              childFootprint.x -
              childFootprint.width;
        placeHorizontal(id, side, x, cursor, "mindmap");
        cursor += measureHorizontal(id) + mindmapCrossGap;
      });
    });
  }

  const nodes = Object.fromEntries(
    tree.visibleIds
      .map((id) => [id, geometry.get(id)] as const)
      .filter((entry): entry is readonly [string, MindmapNodeGeometry] =>
        Boolean(entry[1])
      )
  );
  const branches = tree.visibleIds
    .filter((id) => id !== input.rootId)
    .map((id) => {
      const child = nodes[id];
      const parentId = child?.parentId;
      const parent = parentId ? nodes[parentId] : undefined;
      if (!child || !parent) return null;
      const side = child.side || "right";
      return branchDescriptor(input, root, parent, child, side);
    })
    .filter((branch): branch is MindmapBranchPathDescriptor => branch !== null);
  const visibleNodes = Object.values(nodes);
  const padding = Math.max(0, pointValue(input.padding ?? 24 * layoutScale));
  // Include branch control points in the content bounds.  Curved branches are
  // contained by their cubic control polygon, while elbow/timeline branches
  // use the same points directly.  This keeps SVG export and canvas framing
  // from clipping a connector when a manually positioned node sits outside
  // the automatically measured subtree.
  const contentPoints = [
    ...visibleNodes.flatMap((node) => [
      { x: node.footprint.x, y: node.footprint.y },
      {
        x: node.footprint.x + node.footprint.width,
        y: node.footprint.y + node.footprint.height,
      },
    ]),
    ...branches.flatMap((branch) => branch.points),
  ];
  const minX = Math.min(...contentPoints.map((point) => point.x));
  const minY = Math.min(...contentPoints.map((point) => point.y));
  const maxX = Math.max(...contentPoints.map((point) => point.x));
  const maxY = Math.max(...contentPoints.map((point) => point.y));
  return {
    rootId: input.rootId,
    rootPosition: { ...rootPosition },
    visibleIds: [...tree.visibleIds],
    nodes,
    bounds: {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    },
    branches,
  };
}

function resolveObjectLayout(
  object: Pick<
    WhiteboardMindmapObject,
    "layout" | "layoutFamily" | "layoutDirection"
  >
): MindmapLayoutSpec {
  if (object.layoutFamily === "timeline") {
    return {
      family: "timeline",
      direction:
        object.layoutDirection === "vertical" ? "vertical" : "horizontal",
    };
  }
  if (object.layoutFamily === "tree") {
    return {
      family: "tree",
      direction:
        object.layoutDirection === "left" || object.layoutDirection === "both"
          ? object.layoutDirection
          : "right",
    };
  }
  return {
    family: "mindmap",
    direction:
      object.layoutDirection === "right" ||
      object.layoutDirection === "left" ||
      object.layoutDirection === "both" ||
      object.layoutDirection === "top-down"
        ? object.layoutDirection
        : object.layout,
  };
}

/** Convenience adapter for the persisted whiteboard mind map model. */
const objectLayoutCache = new WeakMap<
  string[],
  Map<string, { signature: string; geometry: MindmapGeometryResult }>
>();
export function resolveMindmapObjectGeometry(
  object: Pick<
    WhiteboardMindmapObject,
    | "rootId"
    | "nodes"
    | "order"
    | "layout"
    | "layoutFamily"
    | "layoutDirection"
    | "layoutScale"
  > &
    Partial<
      Pick<
        WhiteboardMindmapObject,
        | "color"
        | "fill"
        | "connector"
        | "theme"
        | "summaries"
        | "boundaries"
        | "relations"
      >
    >,
  options: MindmapGeometryOptions = {}
): MindmapGeometryResult {
  const layout = resolveObjectLayout(object);
  const optionsKey = JSON.stringify([
    options.rootPosition || null,
    options.padding ?? 0,
  ]);
  const signature = JSON.stringify([
    getMindmapTextMetricsRevision(),
    object.rootId,
    layout,
    object.layoutScale,
    optionsKey,
    object.theme?.levelGap,
    object.theme?.crossGap,
    object.theme?.root.fontSize,
    object.theme?.root.fontWeight,
    object.theme?.branch.fontSize,
    object.theme?.branch.fontWeight,
    object.theme?.leaf.fontSize,
    object.theme?.leaf.fontWeight,
    object.theme?.root.fontStyle,
    object.theme?.branch.fontStyle,
    object.theme?.leaf.fontStyle,
    object.theme?.root.shape,
    object.theme?.branch.shape,
    object.theme?.leaf.shape,
    object.order.map((id) => {
      const n = object.nodes[id];
      return n
        ? [
            n.id,
            n.parentId,
            n.label,
            n.summary,
            n.collapsed,
            n.positionLocked,
            n.x,
            n.y,
            n.width,
            n.height,
            n.branchSide,
            n.fontSize,
            n.fontWeight,
            n.fontStyle,
            n.shape,
            n.widthMode,
            n.textMaxWidth,
            n.icon,
            n.sticker,
            n.imageAssetId,
            n.imageWidth,
            n.imageHeight,
            n.imagePlacement,
            n.labelStyleRanges?.map((r) => [r.start, r.end, r.bold, r.italic]),
            n.branchStyleOverrides?.fontSize,
            n.branchStyleOverrides?.fontWeight,
            n.branchStyleOverrides?.fontStyle,
            n.branchStyleOverrides?.shape,
          ]
        : null;
    }),
  ]);
  const cached = objectLayoutCache.get(object.order)?.get(optionsKey);
  const styledObject = {
    ...object,
    color: object.color || "#172033",
    fill: object.fill || "#dbeafe",
    connector: object.connector || "#60a5fa",
  };
  let geometry = cached?.geometry;
  if (!geometry || cached?.signature !== signature) {
    const index = buildMindmapTreeIndex(object);
    const nodes = Object.fromEntries(
      Object.entries(object.nodes).map(([id, node]) => {
        const style = resolveMindmapNodeVisualStyle(
          node,
          index.depth.get(id) || 0,
          styledObject
        );
        return [
          id,
          {
            ...node,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            shape: style.shape,
            ...(!options.rootPosition &&
            Number.isFinite(node.x) &&
            Number.isFinite(node.y)
              ? { positionLocked: true }
              : {}),
          },
        ];
      })
    );
    geometry = resolveMindmapGeometry({
      ...layout,
      preserveSize: !options.rootPosition,
      levelGap: object.theme?.levelGap,
      crossGap: object.theme?.crossGap,
      rootId: object.rootId,
      nodes,
      order: object.order,
      layoutScale: object.layoutScale,
      rootPosition: options.rootPosition,
      padding: options.padding,
    });
    const variants = objectLayoutCache.get(object.order) || new Map();
    // Bound transient preview origins while retaining each regular caller's options.
    if (variants.size >= 4 && !variants.has(optionsKey))
      variants.delete(variants.keys().next().value!);
    variants.set(optionsKey, { signature, geometry });
    objectLayoutCache.set(object.order, variants);
  }
  if (
    !(
      object.summaries?.length ||
      object.boundaries?.length ||
      object.relations?.length
    )
  )
    return geometry;
  const professional = resolveMindmapProfessionalGeometry(
    styledObject as WhiteboardMindmapObject,
    geometry
  );
  const extra = [
    ...professional.summaries,
    ...professional.boundaries,
    ...professional.relations,
  ].flatMap((item) => [
    item.bounds,
    ...(item.labelBounds ? [item.labelBounds] : []),
  ]);
  const all = [geometry.bounds, ...extra];
  const x = Math.min(...all.map((b) => b.x)),
    y = Math.min(...all.map((b) => b.y));
  return {
    ...geometry,
    ...professional,
    bounds: {
      x,
      y,
      width: Math.max(...all.map((b) => b.x + b.width)) - x,
      height: Math.max(...all.map((b) => b.y + b.height)) - y,
    },
  };
}

function nodeCenter(node: MindmapNodeGeometry): MindmapPoint {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

/**
 * Selects the nearest visible node in a keyboard direction. The primary-axis
 * distance is weighted before cross-axis drift, which follows the visual
 * branch before jumping to a remote row. Stable visible order breaks ties.
 */
export function resolveMindmapNavigationTargetFromGeometry(
  geometry: MindmapGeometryResult,
  currentNodeId: string,
  key: MindmapNavigationKey
): string | null {
  const current = geometry.nodes[currentNodeId];
  if (!current) return null;
  const currentCenter = nodeCenter(current);
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  let best:
    | {
        id: string;
        primary: number;
        cross: number;
        distance: number;
        order: number;
      }
    | undefined;
  geometry.visibleIds.forEach((id, order) => {
    if (id === currentNodeId) return;
    const candidate = geometry.nodes[id];
    if (!candidate) return;
    const center = nodeCenter(candidate);
    const primary =
      key === "ArrowLeft"
        ? current.x - (candidate.x + candidate.width)
        : key === "ArrowRight"
        ? candidate.x - (current.x + current.width)
        : key === "ArrowUp"
        ? current.y - (candidate.y + candidate.height)
        : candidate.y - (current.y + current.height);
    // Center drift caused by different node sizes must not turn a same-column
    // sibling into a left/right candidate (or a same-row sibling into up/down).
    if (primary < -0.001) return;
    const cross = Math.abs(
      horizontal ? center.y - currentCenter.y : center.x - currentCenter.x
    );
    const centerPrimary = Math.abs(
      horizontal ? center.x - currentCenter.x : center.y - currentCenter.y
    );
    const distance = Math.hypot(centerPrimary, cross);
    const next = { id, primary, cross, distance, order };
    if (
      !best ||
      next.primary + next.cross * 1.6 < best.primary + best.cross * 1.6 ||
      (next.primary + next.cross * 1.6 === best.primary + best.cross * 1.6 &&
        (next.distance < best.distance ||
          (next.distance === best.distance && next.order < best.order)))
    ) {
      best = next;
    }
  });
  return best?.id || null;
}

/** Convenience object adapter used by UI keyboard handlers. */
export function resolveMindmapNavigationTarget(
  object: Pick<
    WhiteboardMindmapObject,
    | "rootId"
    | "nodes"
    | "order"
    | "layout"
    | "layoutFamily"
    | "layoutDirection"
    | "layoutScale"
  >,
  currentNodeId: string,
  key: MindmapNavigationKey,
  options: MindmapGeometryOptions = {}
): string | null {
  return resolveMindmapNavigationTargetFromGeometry(
    resolveMindmapObjectGeometry(object, options),
    currentNodeId,
    key
  );
}
