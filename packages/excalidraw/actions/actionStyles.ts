import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TEXT_ALIGN,
  CODES,
  KEYS,
  getLineHeight,
} from "@excalidraw/common";

import React from "react";

import { newElementWith } from "@excalidraw/element";

import {
  hasBoundTextElement,
  canApplyRoundnessTypeToElement,
  getDefaultRoundnessTypeForElement,
  isFrameLikeElement,
  isArrowElement,
  isExcalidrawElement,
  isTextElement,
} from "@excalidraw/element";

import {
  getBoundTextElement,
  redrawTextBoundingBox,
  updateBoundElements,
} from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";

import { paintIcon } from "../components/icons";

import { t } from "../i18n";
import { getSelectedElements } from "../scene";

import { register } from "./register";
import type { AppClassProperties, AppState } from "../types";

// `copiedStyles` is exported only for tests.
export let copiedStyles: string = "{}";

type TextFormatBrushSnapshot = Pick<
  ExcalidrawTextElement,
  | "strokeColor"
  | "fontSize"
  | "fontFamily"
  | "fontWeight"
  | "textAlign"
  | "verticalAlign"
  | "lineHeight"
  | "textOutlineColor"
  | "textOutlineWidth"
  | "opacity"
>;

export let textFormatBrushSnapshot: TextFormatBrushSnapshot | null = null;
export let textFormatBrushSourceElementId: ExcalidrawElement["id"] | null =
  null;
export let textFormatBrushContinuousMode = false;

export const isTextFormatBrushActive = () => textFormatBrushSnapshot !== null;
export const isTextFormatBrushContinuousMode = () =>
  textFormatBrushContinuousMode;

const getTextElementFromSelection = (
  elements: readonly OrderedExcalidrawElement[],
  appState: Readonly<AppState>,
  app: AppClassProperties,
): ExcalidrawTextElement | null => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: true,
  });
  const textElement = selectedElements.find((element) =>
    isTextElement(element),
  );
  if (textElement && isTextElement(textElement)) {
    return textElement;
  }
  const boundTextElement = selectedElements
    .map((element) =>
      getBoundTextElement(element, app.scene.getNonDeletedElementsMap()),
    )
    .find((element) => element && isTextElement(element));
  return boundTextElement && isTextElement(boundTextElement)
    ? boundTextElement
    : null;
};

const createTextFormatBrushSnapshot = (
  element: ExcalidrawTextElement,
): TextFormatBrushSnapshot => ({
  strokeColor: element.strokeColor,
  fontSize: element.fontSize,
  fontFamily: element.fontFamily,
  fontWeight: element.fontWeight || "normal",
  textAlign: element.textAlign,
  verticalAlign: element.verticalAlign,
  lineHeight: element.lineHeight,
  textOutlineColor: element.textOutlineColor,
  textOutlineWidth: element.textOutlineWidth,
  opacity: element.opacity,
});

const applyTextFormatBrushSnapshot = (
  element: ExcalidrawTextElement,
  snapshot: TextFormatBrushSnapshot,
  app: AppClassProperties,
): ExcalidrawTextElement => {
  const nextElement = newElementWith(element, {
    strokeColor: snapshot.strokeColor,
    fontSize: snapshot.fontSize,
    fontFamily: snapshot.fontFamily,
    fontWeight: snapshot.fontWeight,
    textAlign: snapshot.textAlign,
    verticalAlign: snapshot.verticalAlign,
    lineHeight: snapshot.lineHeight,
    textOutlineColor: snapshot.textOutlineColor,
    textOutlineWidth: snapshot.textOutlineWidth,
    opacity: snapshot.opacity,
    textStyleRanges: undefined,
    richTextRanges: undefined,
  });
  redrawTextBoundingBox(
    nextElement,
    app.scene.getContainerElement(element),
    app.scene,
  );
  return nextElement;
};

const getSelectedTextTargetIds = (
  elements: readonly OrderedExcalidrawElement[],
  appState: Readonly<AppState>,
  app: AppClassProperties,
): Set<ExcalidrawElement["id"]> => {
  const selectedElements = getSelectedElements(elements, appState, {
    includeBoundTextElement: true,
  });
  const textTargetIds = new Set<ExcalidrawElement["id"]>();
  for (const element of selectedElements) {
    if (isTextElement(element)) {
      textTargetIds.add(element.id);
      continue;
    }
    const boundTextElement = getBoundTextElement(
      element,
      app.scene.getNonDeletedElementsMap(),
    );
    if (boundTextElement && isTextElement(boundTextElement)) {
      textTargetIds.add(boundTextElement.id);
    }
  }
  return textTargetIds;
};

export const actionTextFormatBrush = register<
  "sample" | "apply" | "cancel" | "setContinuousMode"
>({
  name: "textFormatBrush",
  label: "labels.textFormatBrush",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    if (formData === "setContinuousMode") {
      textFormatBrushContinuousMode = !textFormatBrushContinuousMode;
      if (!textFormatBrushContinuousMode) {
        textFormatBrushSnapshot = null;
        textFormatBrushSourceElementId = null;
      }
      return {
        appState: {
          ...appState,
          toast: {
            message: textFormatBrushContinuousMode
              ? "已开启连续格式刷"
              : "已关闭连续格式刷",
          },
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    if (formData === "cancel") {
      textFormatBrushSnapshot = null;
      textFormatBrushSourceElementId = null;
      return {
        appState: {
          ...appState,
          toast: { message: "已取消格式刷" },
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    if (formData === "apply") {
      if (!textFormatBrushSnapshot) {
        return { appState, captureUpdate: CaptureUpdateAction.EVENTUALLY };
      }
      const textTargetIds = getSelectedTextTargetIds(elements, appState, app);
      if (textTargetIds.size === 0) {
        return {
          appState: {
            ...appState,
            toast: { message: "请选择文本元素" },
          },
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
        };
      }

      if (
        textTargetIds.size === 1 &&
        textFormatBrushSourceElementId &&
        textTargetIds.has(textFormatBrushSourceElementId)
      ) {
        return {
          appState,
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
        };
      }

      if (textFormatBrushSourceElementId) {
        textTargetIds.delete(textFormatBrushSourceElementId);
      }

      if (textTargetIds.size === 0) {
        return {
          appState,
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
        };
      }

      let changed = false;
      const updatedElements = elements.map((element) => {
        if (!textTargetIds.has(element.id) || !isTextElement(element)) {
          return element;
        }
        changed = true;
        return applyTextFormatBrushSnapshot(
          element,
          textFormatBrushSnapshot!,
          app,
        );
      });

      if (changed) {
        updatedElements.forEach((element) => {
          if (isTextElement(element)) {
            updateBoundElements(element, app.scene);
          }
        });
      }

      if (!textFormatBrushContinuousMode) {
        textFormatBrushSnapshot = null;
        textFormatBrushSourceElementId = null;
      }
      return {
        elements: updatedElements,
        appState: {
          ...appState,
          toast: {
            message: textFormatBrushContinuousMode
              ? "已应用格式，可继续选择目标文本"
              : "已应用格式",
          },
        },
        captureUpdate: changed
          ? CaptureUpdateAction.IMMEDIATELY
          : CaptureUpdateAction.EVENTUALLY,
      };
    }

    const sourceTextElement = getTextElementFromSelection(
      elements,
      appState,
      app,
    );
    if (!sourceTextElement) {
      textFormatBrushSnapshot = null;
      return {
        appState: {
          ...appState,
          toast: { message: "请先选择一个文本元素" },
        },
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
      };
    }

    textFormatBrushSnapshot = createTextFormatBrushSnapshot(sourceTextElement);
    textFormatBrushSourceElementId = sourceTextElement.id;
    return {
      appState: {
        ...appState,
        toast: { message: "已取样，请选择目标文本" },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  PanelComponent: ({ updateData }) =>
    React.createElement(
      "div",
      { className: "PropertiesMenu__format-brush-row" },
      React.createElement(
        "label",
        { className: "PropertiesMenu__format-brush-continuous" },
        React.createElement("input", {
          type: "checkbox",
          checked: textFormatBrushContinuousMode,
          onChange: () => updateData("setContinuousMode"),
        }),
        React.createElement("span", null, "连续模式"),
      ),
      React.createElement(
        "button",
        {
          type: "button",
          className: `PropertiesMenu__format-brush-button${
            textFormatBrushSnapshot ? " is-active" : ""
          }`,
          title: textFormatBrushSnapshot ? "取消格式刷" : "格式刷",
          onClick: () =>
            updateData(textFormatBrushSnapshot ? "cancel" : "sample"),
        },
        paintIcon,
        React.createElement("span", null, "格式刷"),
      ),
    ),
});

export const actionCopyStyles = register({
  name: "copyStyles",
  label: "labels.copyStyles",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    const elementsCopied = [];
    const element = elements.find((el) => appState.selectedElementIds[el.id]);
    elementsCopied.push(element);
    if (element && hasBoundTextElement(element)) {
      const boundTextElement = getBoundTextElement(
        element,
        app.scene.getNonDeletedElementsMap(),
      );
      elementsCopied.push(boundTextElement);
    }
    if (element) {
      copiedStyles = JSON.stringify(elementsCopied);
    }
    return {
      appState: {
        ...appState,
        toast: { message: t("toast.copyStyles") },
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.C,
});

export const actionPasteStyles = register({
  name: "pasteStyles",
  label: "labels.pasteStyles",
  icon: paintIcon,
  trackEvent: { category: "element" },
  perform: (elements, appState, formData, app) => {
    const elementsCopied = JSON.parse(copiedStyles);
    const pastedElement = elementsCopied[0];
    const boundTextElement = elementsCopied[1];
    if (!isExcalidrawElement(pastedElement)) {
      return { elements, captureUpdate: CaptureUpdateAction.EVENTUALLY };
    }

    const selectedElements = getSelectedElements(elements, appState, {
      includeBoundTextElement: true,
    });
    const selectedElementIds = selectedElements.map((element) => element.id);
    return {
      elements: elements.map((element) => {
        if (selectedElementIds.includes(element.id)) {
          let elementStylesToCopyFrom = pastedElement;
          if (isTextElement(element) && element.containerId) {
            elementStylesToCopyFrom = boundTextElement;
          }
          if (!elementStylesToCopyFrom) {
            return element;
          }
          let newElement = newElementWith(element, {
            backgroundColor: elementStylesToCopyFrom?.backgroundColor,
            strokeWidth: elementStylesToCopyFrom?.strokeWidth,
            strokeColor: elementStylesToCopyFrom?.strokeColor,
            strokeStyle: elementStylesToCopyFrom?.strokeStyle,
            fillStyle: elementStylesToCopyFrom?.fillStyle,
            opacity: elementStylesToCopyFrom?.opacity,
            roughness: elementStylesToCopyFrom?.roughness,
            roundness: elementStylesToCopyFrom.roundness
              ? canApplyRoundnessTypeToElement(
                  elementStylesToCopyFrom.roundness.type,
                  element,
                )
                ? elementStylesToCopyFrom.roundness
                : getDefaultRoundnessTypeForElement(element)
              : null,
          });

          if (isTextElement(newElement)) {
            const fontSize =
              (elementStylesToCopyFrom as ExcalidrawTextElement).fontSize ||
              DEFAULT_FONT_SIZE;
            const fontFamily =
              (elementStylesToCopyFrom as ExcalidrawTextElement).fontFamily ||
              DEFAULT_FONT_FAMILY;
            const fontWeight =
              (elementStylesToCopyFrom as ExcalidrawTextElement).fontWeight ||
              "normal";
            newElement = newElementWith(newElement, {
              fontSize,
              fontFamily,
              fontWeight,
              textAlign:
                (elementStylesToCopyFrom as ExcalidrawTextElement).textAlign ||
                DEFAULT_TEXT_ALIGN,
              lineHeight:
                (elementStylesToCopyFrom as ExcalidrawTextElement).lineHeight ||
                getLineHeight(fontFamily),
              verticalAlign:
                (elementStylesToCopyFrom as ExcalidrawTextElement)
                  .verticalAlign || newElement.verticalAlign,
              textOutlineColor:
                (elementStylesToCopyFrom as ExcalidrawTextElement)
                  .textOutlineColor || newElement.textOutlineColor,
              textOutlineWidth:
                (elementStylesToCopyFrom as ExcalidrawTextElement)
                  .textOutlineWidth ?? newElement.textOutlineWidth,
              textStyleRanges: undefined,
              richTextRanges: undefined,
            });
            let container = null;
            if (newElement.containerId) {
              container =
                selectedElements.find(
                  (element) =>
                    isTextElement(newElement) &&
                    element.id === newElement.containerId,
                ) || null;
            }

            redrawTextBoundingBox(newElement, container, app.scene);
          }

          if (
            newElement.type === "arrow" &&
            isArrowElement(elementStylesToCopyFrom)
          ) {
            newElement = newElementWith(newElement, {
              startArrowhead: elementStylesToCopyFrom.startArrowhead,
              endArrowhead: elementStylesToCopyFrom.endArrowhead,
            });
          }

          if (isFrameLikeElement(element)) {
            newElement = newElementWith(newElement, {
              roundness: null,
              backgroundColor: "transparent",
            });
          }

          return newElement;
        }
        return element;
      }),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
  keyTest: (event) =>
    event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.V,
});
