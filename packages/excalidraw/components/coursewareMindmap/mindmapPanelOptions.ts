/** Kept in the same order as the whiteboard's node palettes. */
export const MINDMAP_FILL_COLORS = [
  "#ffffff",
  "#f2f3f5",
  "#d0d3d9",
  "#646a73",
  "#1f2329",
  "#fde2e2",
  "#fbbfbc",
  "#f76965",
  "#feecc8",
  "#f5b74e",
  "#fff7cc",
  "#f5d90a",
  "#d9f5d6",
  "#62d256",
  "#d9f3fd",
  "#4cb6f5",
  "#e1eaff",
  "#5b7cfa",
] as const;
export const MINDMAP_STROKE_COLORS = [
  "#ffffff",
  "#1f2329",
  "#646a73",
  "#8f959e",
  "#d0d3d9",
  "#f2f3f5",
  "#8b5cf6",
  "#5b7cfa",
  "#62d256",
  "#f5d90a",
  "#f5a044",
  "#f76965",
] as const;
export const MINDMAP_TEXT_COLORS = [
  "#1f2329",
  "#646a73",
  "#8f959e",
  "#5b7cfa",
  "#4cb6f5",
  "#62d256",
  "#f5d90a",
  "#f5a044",
  "#f76965",
] as const;
export const MINDMAP_NODE_ICONS = [
  { value: "lucide:flag", label: "旗帜" },
  { value: "lucide:star", label: "星标" },
  { value: "lucide:lightbulb", label: "灵感" },
  { value: "lucide:target", label: "目标" },
  { value: "lucide:pin", label: "标记" },
] as const;
export const MINDMAP_NODE_STICKERS = ["✨", "⭐", "💡", "🎯", "📌", "⚠️"];
export const MINDMAP_NODE_SHAPES = [
  ["text", "纯文本", "lucide:type"],
  ["ellipse", "椭圆", "lucide:circle"],
  ["rounded-rectangle", "圆角矩形", "lucide:square-round-corner"],
] as const;
export const MINDMAP_STROKE_WIDTHS = [1, 2, 4, 8] as const;
export const MINDMAP_LINE_STYLES = [
  { value: "solid", label: "实线" },
  { value: "dash", label: "虚线" },
  { value: "dot", label: "点状虚线" },
] as const;
