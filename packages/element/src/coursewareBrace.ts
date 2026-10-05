import { isLineElement, isTextElement } from "./typeChecks";

import type { ExcalidrawElement, ExcalidrawRectangleElement } from "./types";

export const isCoursewareBraceElement = (
  element: ExcalidrawElement,
): element is ExcalidrawRectangleElement =>
  element.type === "rectangle" &&
  element.customData?.coursewareObjectType === "brace";

export const getCoursewareBraceSelection = <T extends ExcalidrawElement>(
  elements: readonly T[],
) => {
  if (elements.length < 2 || elements.length > 3) {
    return null;
  }
  const container = elements.find(isCoursewareBraceElement);
  const curve = elements.find(
    (element) => isLineElement(element) &&
      element.customData?.coursewareObjectType === "brace-curve",
  );
  if (!container || !isCoursewareBraceElement(container) || !curve || !isLineElement(curve) ||
    elements.some((element) => element.isDeleted || element.locked) ||
    !container.groupIds.some((groupId) => curve.groupIds.includes(groupId)) ||
    !elements.every((element) => element === container || element === curve ||
      (isTextElement(element) && element.containerId === container.id))) {
    return null;
  }
  return { container, curve };
};

/** The curve and its text area share one native rectangle's bounds. */
export const getCoursewareBraceTextRect = (element: ExcalidrawElement) => {
  const width = Math.max(1, element.width);
  const height = Math.max(1, element.height);
  const storedRatio = element.customData?.coursewareBraceWidthRatio;
  const braceWidth =
    typeof storedRatio === "number" && Number.isFinite(storedRatio)
      ? width * Math.max(0, Math.min(1, storedRatio))
      : Math.min(18, width * 0.3);
  const outerPadding = Math.min(8, width * 0.08);
  const inset = braceWidth + outerPadding;
  const verticalPadding = Math.min(12, height * 0.16);
  return {
    x: element.customData?.coursewareBraceSide === "left" ? inset : outerPadding,
    y: verticalPadding,
    width: Math.max(1, width - outerPadding - inset),
    height: Math.max(1, height - verticalPadding * 2),
  };
};
