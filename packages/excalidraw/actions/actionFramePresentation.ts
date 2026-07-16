import {
  CaptureUpdateAction,
  getSelectedElements,
  isFrameElement,
  isFrameExcludedFromPresentation,
  newElementWith,
} from "@excalidraw/element";

import { register } from "./register";

export const actionSetFrameExcludedFromPresentation = register<boolean>({
  name: "setFrameExcludedFromPresentation",
  label: "不作为 PPT 幻灯片",
  trackEvent: false,
  perform: (elements, appState, excluded) => {
    const selectedElements = getSelectedElements(elements, appState);
    const frame = selectedElements[0];

    if (
      selectedElements.length !== 1 ||
      !frame ||
      !isFrameElement(frame) ||
      typeof excluded !== "boolean" ||
      isFrameExcludedFromPresentation(frame) === excluded
    ) {
      return {
        elements,
        appState,
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    const customData = { ...frame.customData };
    if (excluded) {
      customData.excludeFromPresentation = true;
    } else {
      delete customData.excludeFromPresentation;
    }

    return {
      elements: elements.map((element) =>
        element.id === frame.id
          ? newElementWith(frame, { customData })
          : element,
      ),
      appState,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
