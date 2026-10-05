import { getTargetElements } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppClassProperties, AppState } from "./types";

export type CoursewareBrushMode = "pen" | "highlighter";

export interface CoursewareBrushSettings {
  color: string;
  strokeWidth: number;
  opacity: number;
}

export interface CoursewareBrushState {
  mode: CoursewareBrushMode;
  pen: CoursewareBrushSettings;
  highlighter: CoursewareBrushSettings;
}

export const COURSEWARE_BRUSH_COLORS = [
  "#2B2F36",
  "#646A73",
  "#BBBFC4",
  "#9F6FF1",
  "#5083FB",
  "#32A645",
  "#FFE928",
  "#ED6D0C",
  "#F54A45",
] as const;
export const COURSEWARE_BRUSH_SIZE_FACTOR = 4.25;
export const COURSEWARE_BRUSH_MIN_WIDTH = 0.1;
export const COURSEWARE_BRUSH_MAX_WIDTH = 6;

export const createDefaultCoursewareBrush = (): CoursewareBrushState => ({
  mode: "pen",
  pen: {
    color: "#2B2F36",
    strokeWidth: 4 / COURSEWARE_BRUSH_SIZE_FACTOR,
    opacity: 100,
  },
  highlighter: {
    color: "#FFE928",
    strokeWidth: 24 / COURSEWARE_BRUSH_SIZE_FACTOR,
    opacity: 35,
  },
});

export const clampCoursewareBrushStrokeWidth = (strokeWidth: number) =>
  Math.min(
    COURSEWARE_BRUSH_MAX_WIDTH,
    Math.max(COURSEWARE_BRUSH_MIN_WIDTH, strokeWidth),
  );

/** Both properties panels edit the active brush without changing shape defaults. */
export const updateCoursewareBrush = (
  brush: CoursewareBrushState,
  patch: Partial<CoursewareBrushSettings>,
  mode: CoursewareBrushMode = brush.mode,
): CoursewareBrushState => ({
  ...brush,
  [mode]: {
    ...brush[mode],
    ...patch,
    ...(patch.strokeWidth !== undefined
      ? {
          strokeWidth: Number.isFinite(patch.strokeWidth)
            ? clampCoursewareBrushStrokeWidth(patch.strokeWidth)
            : brush[mode].strokeWidth,
        }
      : {}),
  },
});

type BrushContextState = Pick<
  AppState,
  | "activeTool"
  | "presentationMode"
  | "viewModeEnabled"
  | "editingTextElement"
  | "newElement"
  | "selectedElementIds"
>;

const isCoursewareBrushEditor = (
  appState: BrushContextState,
  app: Pick<AppClassProperties, "props" | "editorInterface">,
) =>
  app.props.UIOptions.toolbarLayout === "left" &&
  app.editorInterface.formFactor !== "phone" &&
  !appState.presentationMode &&
  !appState.viewModeEnabled;

/** Existing elements always keep the standard element-property action path. */
export const isCoursewareBrushSettingsContext = (
  elements: readonly ExcalidrawElement[],
  appState: BrushContextState,
  app: Pick<AppClassProperties, "props" | "editorInterface">,
) =>
  isCoursewareBrushEditor(appState, app) &&
  appState.activeTool.type === "freedraw" &&
  getTargetElements(elements, appState).length === 0;

/** Limit explicit edits of courseware strokes; never rewrite stored elements. */
export const isCoursewareBrushWidthLimitedContext = (
  elements: readonly ExcalidrawElement[],
  appState: BrushContextState,
  app: Pick<AppClassProperties, "props" | "editorInterface">,
) => {
  if (!isCoursewareBrushEditor(appState, app)) {
    return false;
  }
  const targets = getTargetElements(elements, appState);
  return targets.length > 0
    ? targets.every((element) => element.type === "freedraw")
    : appState.activeTool.type === "freedraw";
};

/** Keep brush settings separate from shape/text defaults. */
export const getCoursewareBrushStyle = (brush: CoursewareBrushState) => ({
  strokeColor: brush[brush.mode].color,
  strokeWidth: brush[brush.mode].strokeWidth,
  opacity: brush[brush.mode].opacity,
  customData: { coursewareBrushMode: brush.mode },
});
