export type WhiteboardObjectType =
  | "shape"
  | "text"
  | "sticky"
  | "connector"
  | "table"
  | "stroke"
  | "mindmap"
  | "emoji"
  | "image"
  | "section"
  | "question";

export type ShapeKind =
  | "rectangle"
  | "circle"
  | "rounded-rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "document"
  | "cylinder"
  | "chevron"
  | "pentagon"
  | "parallelogram"
  | "trapezoid"
  | "speech-bubble"
  | "speech-bubble-square"
  | "right-triangle"
  | "star"
  | "hexagon"
  | "octagon"
  | "left-arrow"
  | "right-arrow"
  | "double-arrow"
  | "cloud"
  | "brace"
  | "brace-right"
  | "funnel"
  | "cross"
  | "cube";

export type WhiteboardLineStyle = "solid" | "dash" | "dot";

export interface WhiteboardTheme {
  background: string;
  surface: string;
  accentSurface: string;
  primary: string;
  text: string;
  mutedText: string;
  border: string;
  sticky: string;
  connector: string;
  grid: string;
}

export interface WhiteboardBaseObject {
  id: string;
  type: WhiteboardObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  locked: boolean;
  groupId?: string;
  opacity?: number;
  flipX?: boolean;
  flipY?: boolean;
  /** The section object that contains this object. Sections cannot be nested. */
  sectionId?: string;
}

export interface WhiteboardEndpoint {
  objectId?: string;
  /** Optional mindmap node anchor inside the referenced whiteboard object. */
  nodeId?: string;
  port?: "top" | "right" | "bottom" | "left";
  x: number;
  y: number;
}

export type WhiteboardConnectorPort = NonNullable<WhiteboardEndpoint["port"]>;

export type MindmapNodeImagePlacement = "top" | "right" | "bottom" | "left";

export interface WhiteboardMindmapNode {
  id: string;
  parentId: string | null;
  label: string;
  summary?: string;
  /** Absence preserves the saved width and explicit newlines of older nodes. */
  widthMode?: "auto" | "fixed";
  /** Canvas-scaled text column limit; divide by layoutScale for UI values. */
  textMaxWidth?: number;
  labelStyleRanges?: MindmapLabelStyleRange[];
  link?: string;
  tags?: string[];
  /** Style inherited by descendants; node-local fields take precedence. */
  branchStyleOverrides?: MindmapNodeStyle;
  collapsed?: boolean;
  x?: number;
  y?: number;
  /** Set after a user manually drags a node; auto-layout keeps this position. */
  positionLocked?: boolean;
  width?: number;
  height?: number;
  /** Stable outward side for bidirectional trees and alternating timelines. */
  branchSide?: "left" | "right" | "top" | "bottom";
  /** Visual node shape. Kept optional so legacy nodes remain valid. */
  shape?: MindmapNodeShape;
  fill?: string;
  color?: string;
  stroke?: string;
  strokeWidth?: number;
  /** Node outline pattern; legacy nodes default to a solid outline. */
  lineStyle?: MindmapLineStyle;
  opacity?: number;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  align?: "left" | "center" | "right";
  /** Iconify icon name or an emoji character. */
  icon?: string;
  /** Sticker identifier supplied by the client, never a data URI. */
  sticker?: string;
  /** Uploaded image asset reference; image bytes are kept out of Yjs. */
  imageAssetId?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Snapped position of the embedded image around the node text. */
  imagePlacement?: MindmapNodeImagePlacement;
}

export type MindmapLayoutFamily = "mindmap" | "tree" | "timeline";

/**
 * Direction values are intentionally broader than the legacy `layout` field.
 * `layout` remains the four-value field used by older whiteboard clients.
 */
export type MindmapLayoutDirection =
  | "right"
  | "left"
  | "both"
  | "top-down"
  | "horizontal"
  | "vertical";

export type MindmapBranchStyle = "curve" | "round-angle" | "right-angle";

export type MindmapLineStyle = WhiteboardLineStyle;

/** Legacy ShapeKind members are accepted on input and normalized on read. */
export type MindmapNodeShape = "text" | ShapeKind;

export interface WhiteboardMindmapObject extends WhiteboardBaseObject {
  type: "mindmap";
  rootId: string;
  nodes: Record<string, WhiteboardMindmapNode>;
  order: string[];
  /** Uniform content scale used by layout, rendering, export, and future edits. */
  layoutScale?: number;
  layout: "right" | "left" | "both" | "top-down";
  /** New Feishu-style layout family. Optional for backwards compatibility. */
  layoutFamily?: MindmapLayoutFamily;
  /** New layout direction, interpreted together with layoutFamily. */
  layoutDirection?: MindmapLayoutDirection;
  fill: string;
  color: string;
  connector: string;
  branchStyle?: MindmapBranchStyle;
  lineStyle?: MindmapLineStyle;
  summaries?: MindmapSummary[];
  boundaries?: MindmapBoundary[];
  relations?: MindmapRelation[];
  theme?: MindmapThemeSnapshot;
}

/** A rectangular canvas obstacle, without a host document or rendering dependency. */
export type MindmapObstacleObject =
  | WhiteboardMindmapObject
  | (WhiteboardBaseObject & { type: Exclude<WhiteboardObjectType, "mindmap"> });

export type MindmapObject = WhiteboardMindmapObject;
export type MindmapNode = WhiteboardMindmapNode;

export interface MindmapLabelStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}
export interface MindmapLabelStyleRange extends MindmapLabelStyle {
  /** UTF-16 offsets; all editing operations snap them to grapheme boundaries. */
  start: number;
  end: number;
}
export type MindmapNodeStyle = Partial<
  Pick<
    WhiteboardMindmapNode,
    | "shape"
    | "fill"
    | "color"
    | "stroke"
    | "strokeWidth"
    | "lineStyle"
    | "opacity"
    | "fontSize"
    | "fontWeight"
    | "fontStyle"
    | "textDecoration"
    | "align"
  >
>;
export interface MindmapSummary {
  id: string;
  nodeIds: string[];
  label: string;
  color?: string;
  lineStyle?: MindmapLineStyle;
  bracketStyle?: "square" | "curve";
}
export interface MindmapBoundary {
  id: string;
  nodeIds: string[];
  title?: string;
  shape?: "rectangle" | "rounded-rectangle";
  fill?: string;
  stroke?: string;
  lineStyle?: MindmapLineStyle;
}
export interface MindmapRelation {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  color?: string;
  style?: MindmapBranchStyle;
  lineStyle?: MindmapLineStyle;
  startArrow?: boolean;
  endArrow?: boolean;
}
export interface MindmapThemeSnapshot {
  id: "default" | "simple" | "colorful" | "dark" | string;
  name: string;
  root: MindmapNodeStyle;
  branch: MindmapNodeStyle;
  leaf: MindmapNodeStyle;
  connector: string;
  branchColors: string[];
  levelGap: number;
  crossGap: number;
}
