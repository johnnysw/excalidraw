import {
  DEFAULT_TRANSFORM_HANDLE_SPACING,
  type EditorInterface,
} from "@excalidraw/common";

import { pointFrom, pointRotateRads } from "@excalidraw/math";

import type { Radians } from "@excalidraw/math";

import type {
  InteractiveCanvasAppState,
  Zoom,
} from "@excalidraw/excalidraw/types";

import { getElementAbsoluteCoords } from "./bounds";
import { getCoursewareBraceSelection } from "./coursewareBrace";
import { isCoursewareMindmapElement } from "./coursewareMindmapType";
import {
  isElbowArrow,
  isFrameLikeElement,
  isImageElement,
  isLinearElement,
  isLineElement,
} from "./typeChecks";

import type { Bounds } from "./bounds";
import type {
  ElementsMap,
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  PointerType,
} from "./types";

export type TransformHandleDirection =
  | "n"
  | "s"
  | "w"
  | "e"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export type TransformHandleType = TransformHandleDirection | "rotation";
export type RotationHandlePosition = "bottom" | "bottom-left";

export type TransformHandle = Bounds;
export type TransformHandles = Partial<{
  [T in TransformHandleType]: TransformHandle;
}>;
export type MaybeTransformHandleType = TransformHandleType | false;

const transformHandleSizes: { [k in PointerType]: number } = {
  mouse: 8,
  pen: 16,
  touch: 28,
};

const ROTATION_RESIZE_HANDLE_GAP = 16;

export const COURSEWARE_ROTATION_HANDLE_ICON_SIZE = 16;
export const COURSEWARE_ROTATION_HANDLE_COLOR = "#7b9af8";

/** The missing upper-right quadrant leaves the lower-left resize handle reachable. */
export const isPointInRotationHandle = (
  handle: TransformHandle,
  x: number,
  y: number,
  angle: Radians,
  position: RotationHandlePosition,
) => {
  if (position === "bottom") {
    return (
      x >= handle[0] &&
      x <= handle[0] + handle[2] &&
      y >= handle[1] &&
      y <= handle[1] + handle[3]
    );
  }
  const center = pointFrom(
    handle[0] + handle[2] / 2,
    handle[1] + handle[3] / 2,
  );
  const [localX, localY] = pointRotateRads(
    pointFrom(x, y),
    center,
    -angle as Radians,
  );
  const dx = localX - center[0];
  const dy = localY - center[1];
  return Math.hypot(dx, dy) <= handle[2] / 2 && !(dx > 0 && dy < 0);
};

export const DEFAULT_OMIT_SIDES = {
  e: true,
  s: true,
  n: true,
  w: true,
};

export const OMIT_SIDES_FOR_MULTIPLE_ELEMENTS = {
  e: true,
  s: true,
  n: true,
  w: true,
};

export const OMIT_SIDES_FOR_FRAME = {
  e: true,
  s: true,
  n: true,
  w: true,
  rotation: true,
};

const OMIT_SIDES_FOR_LINE_SLASH = {
  e: true,
  s: true,
  n: true,
  w: true,
  nw: true,
  se: true,
};

const OMIT_SIDES_FOR_LINE_BACKSLASH = {
  e: true,
  s: true,
  n: true,
  w: true,
};

const generateTransformHandle = (
  x: number,
  y: number,
  width: number,
  height: number,
  cx: number,
  cy: number,
  angle: Radians,
): TransformHandle => {
  const [xx, yy] = pointRotateRads(
    pointFrom(x + width / 2, y + height / 2),
    pointFrom(cx, cy),
    angle,
  );
  return [xx - width / 2, yy - height / 2, width, height];
};

export const canResizeFromSides = (editorInterface: EditorInterface) => {
  if (
    editorInterface.formFactor === "phone" &&
    editorInterface.userAgent.isMobileDevice
  ) {
    return false;
  }

  return true;
};

export const getOmitSidesForEditorInterface = (
  editorInterface: EditorInterface,
) => {
  if (canResizeFromSides(editorInterface)) {
    return DEFAULT_OMIT_SIDES;
  }

  return {};
};

export const getTransformHandlesFromCoords = (
  [x1, y1, x2, y2, cx, cy]: [number, number, number, number, number, number],
  angle: Radians,
  zoom: Zoom,
  pointerType: PointerType,
  omitSides: { [T in TransformHandleType]?: boolean } = {},
  margin = 4,
  spacing = DEFAULT_TRANSFORM_HANDLE_SPACING,
  rotationHandlePosition: RotationHandlePosition = "bottom",
): TransformHandles => {
  const size = transformHandleSizes[pointerType];
  const handleWidth = size / zoom.value;
  const handleHeight = size / zoom.value;

  const handleMarginX = size / zoom.value;
  const handleMarginY = size / zoom.value;

  const width = x2 - x1;
  const height = y2 - y1;
  const dashedLineMargin = margin / zoom.value;
  const centeringOffset = (size - spacing * 2) / (2 * zoom.value);
  const rotationSize = (pointerType === "mouse" ? 24 : 44) / zoom.value;
  const rotationOffset = (pointerType === "mouse" ? 12 : 16) / zoom.value;

  const transformHandles: TransformHandles = {
    nw: omitSides.nw
      ? undefined
      : generateTransformHandle(
          x1 - dashedLineMargin - handleMarginX + centeringOffset,
          y1 - dashedLineMargin - handleMarginY + centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    ne: omitSides.ne
      ? undefined
      : generateTransformHandle(
          x2 + dashedLineMargin - centeringOffset,
          y1 - dashedLineMargin - handleMarginY + centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    sw: omitSides.sw
      ? undefined
      : generateTransformHandle(
          x1 - dashedLineMargin - handleMarginX + centeringOffset,
          y2 + dashedLineMargin - centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    se: omitSides.se
      ? undefined
      : generateTransformHandle(
          x2 + dashedLineMargin - centeringOffset,
          y2 + dashedLineMargin - centeringOffset,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
    rotation: omitSides.rotation
      ? undefined
      : rotationHandlePosition === "bottom-left"
      ? generateTransformHandle(
          x1 - dashedLineMargin - rotationOffset - rotationSize / 2,
          y2 + dashedLineMargin + rotationOffset - rotationSize / 2,
          rotationSize,
          rotationSize,
          cx,
          cy,
          angle,
        )
      : generateTransformHandle(
          x1 + width / 2 - handleWidth / 2,
          y2 +
            dashedLineMargin +
            handleMarginY -
            centeringOffset +
            ROTATION_RESIZE_HANDLE_GAP / zoom.value,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
  };

  // We only want to show height handles (all cardinal directions)  above a certain size
  // Note: we render using "mouse" size so we should also use "mouse" size for this check
  const minimumSizeForEightHandles =
    (5 * transformHandleSizes.mouse) / zoom.value;
  if (Math.abs(width) > minimumSizeForEightHandles) {
    if (!omitSides.n) {
      transformHandles.n = generateTransformHandle(
        x1 + width / 2 - handleWidth / 2,
        y1 - dashedLineMargin - handleMarginY + centeringOffset,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
    if (!omitSides.s) {
      transformHandles.s = generateTransformHandle(
        x1 + width / 2 - handleWidth / 2,
        y2 + dashedLineMargin - centeringOffset,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
  }
  if (Math.abs(height) > minimumSizeForEightHandles) {
    if (!omitSides.w) {
      transformHandles.w = generateTransformHandle(
        x1 - dashedLineMargin - handleMarginX + centeringOffset,
        y1 + height / 2 - handleHeight / 2,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
    if (!omitSides.e) {
      transformHandles.e = generateTransformHandle(
        x2 + dashedLineMargin - centeringOffset,
        y1 + height / 2 - handleHeight / 2,
        handleWidth,
        handleHeight,
        cx,
        cy,
        angle,
      );
    }
  }

  return transformHandles;
};

export const getTransformHandles = (
  element: ExcalidrawElement,
  zoom: Zoom,
  elementsMap: ElementsMap,
  pointerType: PointerType = "mouse",
  omitSides: { [T in TransformHandleType]?: boolean } = DEFAULT_OMIT_SIDES,
  rotationHandlePosition: RotationHandlePosition = "bottom",
): TransformHandles => {
  // so that when locked element is selected (especially when you toggle lock
  // via keyboard) the locked element is visually distinct, indicating
  // you can't move/resize
  if (
    element.locked ||
    // Elbow arrows cannot be rotated
    isElbowArrow(element)
  ) {
    return {};
  }

  if (isCoursewareMindmapElement(element)) {
    omitSides = { ...omitSides, n: true, s: true, e: true, w: true };
  } else if (element.type === "freedraw" || isLinearElement(element)) {
    if (element.points.length === 2) {
      // only check the last point because starting point is always (0,0)
      const [, p1] = element.points;
      if (p1[0] === 0 || p1[1] === 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      } else if (p1[0] > 0 && p1[1] < 0) {
        omitSides = OMIT_SIDES_FOR_LINE_SLASH;
      } else if (p1[0] > 0 && p1[1] > 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      } else if (p1[0] < 0 && p1[1] > 0) {
        omitSides = OMIT_SIDES_FOR_LINE_SLASH;
      } else if (p1[0] < 0 && p1[1] < 0) {
        omitSides = OMIT_SIDES_FOR_LINE_BACKSLASH;
      }
    }
  } else if (isFrameLikeElement(element)) {
    omitSides = {
      ...omitSides,
      rotation: true,
    };
  }
  const margin = isLinearElement(element)
    ? DEFAULT_TRANSFORM_HANDLE_SPACING + 8
    : isImageElement(element)
    ? 0
    : DEFAULT_TRANSFORM_HANDLE_SPACING;
  return getTransformHandlesFromCoords(
    getElementAbsoluteCoords(element, elementsMap, true),
    element.angle,
    zoom,
    pointerType,
    omitSides,
    margin,
    isImageElement(element) ? 0 : undefined,
    rotationHandlePosition,
  );
};

export const getCoursewareBraceWidthHandles = (
  elements: readonly NonDeletedExcalidrawElement[],
  zoom: Zoom,
  elementsMap: ElementsMap,
  pointerType: PointerType = "mouse",
): TransformHandles => {
  const brace = getCoursewareBraceSelection(elements);
  if (!brace) {
    return {};
  }
  const { e, w } = getTransformHandles(brace.container, zoom, elementsMap, pointerType, {
    n: true,
    s: true,
    nw: true,
    ne: true,
    sw: true,
    se: true,
    rotation: true,
  });
  return { e, w };
};

export const hasBoundingBox = (
  elements: readonly NonDeletedExcalidrawElement[],
  appState: InteractiveCanvasAppState,
  editorInterface: EditorInterface,
) => {
  if (
    appState.selectedLinearElement?.isEditing ||
    appState.selectedLinearElement?.isDragging
  ) {
    return false;
  }
  if (elements.length > 1) {
    return true;
  }
  const element = elements[0];
  if (isElbowArrow(element)) {
    // Elbow arrows cannot be resized as single selected elements
    return false;
  }
  if (
    !isLinearElement(element) ||
    (isLineElement(element) && element.polygon)
  ) {
    return true;
  }

  // on mobile/tablet we currently don't show bbox because of resize issues
  // (also prob best for simplicity's sake)
  return element.points.length > 2 && !editorInterface.userAgent.isMobileDevice;
};
