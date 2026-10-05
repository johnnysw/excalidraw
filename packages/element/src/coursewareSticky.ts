import type { ExcalidrawElement } from "./types";

export const COURSEWARE_STICKY_STYLE = {
  width: 160,
  height: 160,
  padding: 12,
  cornerRadius: 4,
  fontSize: 16,
  fontFamily: "PingFang SC, Source Han Sans CN, sans-serif",
  lineHeight: 1.35,
  shadowColor: "#1f2329",
  shadowBlur: 16,
  shadowOffsetY: 8,
  shadowOpacity: 0.16,
} as const;

export const isCoursewareStickyElement = (element: ExcalidrawElement) =>
  element.type === "rectangle" &&
  element.customData?.coursewareObjectType === "sticky";

export const getCoursewareStickyPadding = (element: ExcalidrawElement) => {
  const padding = element.customData?.coursewareStickyPadding;
  return typeof padding === "number" && Number.isFinite(padding)
    ? Math.max(0, padding)
    : COURSEWARE_STICKY_STYLE.padding;
};
