import type {
  MindmapBranchStyle,
  MindmapLayoutDirection,
  MindmapLayoutFamily,
} from "@excalidraw/mindmap";

export const COURSEWARE_MINDMAP_TOOL = "courseware-mindmap";
export interface MindmapToolPreference {
  family: MindmapLayoutFamily;
  direction: MindmapLayoutDirection;
  branchStyle: MindmapBranchStyle;
}
export const DEFAULT_MINDMAP_PREFERENCE: MindmapToolPreference = {
  family: "mindmap",
  direction: "right",
  branchStyle: "curve",
};
export const MINDMAP_LAYOUT_OPTIONS = [
  {
    family: "mindmap",
    direction: "right",
    label: "思维导图·右",
    asset: "mindmap-layout-right",
  },
  {
    family: "mindmap",
    direction: "left",
    label: "思维导图·左",
    asset: "mindmap-layout-left",
  },
  {
    family: "mindmap",
    direction: "top-down",
    label: "思维导图·下",
    asset: "mindmap-layout-top-down",
  },
  {
    family: "mindmap",
    direction: "both",
    label: "思维导图·左右",
    asset: "mindmap-layout-both",
  },
  {
    family: "tree",
    direction: "right",
    label: "树状图·右",
    asset: "tree-layout-right",
  },
  {
    family: "tree",
    direction: "left",
    label: "树状图·左",
    asset: "tree-layout-left",
  },
  {
    family: "tree",
    direction: "both",
    label: "树状图·左右",
    asset: "tree-layout-both",
  },
  {
    family: "timeline",
    direction: "horizontal",
    label: "时间线·横向",
    asset: "timeline-layout-horizontal",
  },
  {
    family: "timeline",
    direction: "vertical",
    label: "时间线·纵向",
    asset: "timeline-layout-vertical",
  },
] as const;
export const MINDMAP_BRANCH_OPTIONS = [
  {
    value: "curve",
    label: "曲线",
    path: "M1 9h.88c4.226 0 8.332-1.407 11.67-4l.175-.136A18.38 18.38 0 0 1 25 1M1 9h.88c4.226 0 8.332 1.407 11.67 4l.175.136A18.38 18.38 0 0 0 25 17",
  },
  {
    value: "round-angle",
    label: "圆角折线",
    path: "M1 9h12M25 1h-8a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h8",
  },
  { value: "right-angle", label: "直角折线", path: "M1 9h12M25 1H13v16h12" },
] as const;
export type MindmapSelection = { elementId: string; nodeId: string };
