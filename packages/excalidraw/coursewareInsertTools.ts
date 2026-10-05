export const COURSEWARE_STICKY_COLORS = [
  "#fff7cc",
  "#feecc8",
  "#fde2e2",
  "#d9f5d6",
  "#d9f3fd",
  "#e1eaff",
  "#ece2fe",
  "#f5e0ff",
  "#f9ddec",
] as const;

export const COURSEWARE_EMOJI_CUSTOM_TYPE = "courseware-emoji";
export const COURSEWARE_DEFAULT_EMOJI = "😀";
export const COURSEWARE_STICKY_CUSTOM_TYPE = "courseware-sticky";

export type CoursewareInsertTool =
  | typeof COURSEWARE_EMOJI_CUSTOM_TYPE
  | typeof COURSEWARE_STICKY_CUSTOM_TYPE;

export const getCoursewareInsertTool = (activeTool: {
  type: string;
  customType?: string | null;
}): CoursewareInsertTool | undefined => {
  if (activeTool.type !== "custom") {
    return undefined;
  }
  return activeTool.customType === COURSEWARE_EMOJI_CUSTOM_TYPE ||
    activeTool.customType === COURSEWARE_STICKY_CUSTOM_TYPE
    ? activeTool.customType
    : undefined;
};

export const isCoursewareEmojiTool = (activeTool: {
  type: string;
  customType?: string | null;
}) => getCoursewareInsertTool(activeTool) === COURSEWARE_EMOJI_CUSTOM_TYPE;

export const isCoursewareStickyTool = (activeTool: {
  type: string;
  customType?: string | null;
}) => getCoursewareInsertTool(activeTool) === COURSEWARE_STICKY_CUSTOM_TYPE;
