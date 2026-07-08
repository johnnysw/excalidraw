import { isDevEnv, throttleRAF } from "@excalidraw/common";

import {
  getContainingFrame,
  getElementAbsoluteCoords,
  getFreeDrawSvgPath,
  getTargetFrame,
  getRenderOpacity,
  isInvisiblySmallElement,
  renderElement,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import type {
  ExcalidrawFreeDrawElement,
  NonDeleted,
} from "@excalidraw/element/types";

import {
  isFreedrawPerfV2Enabled,
  markExcalidrawPerf,
  measureExcalidrawPerf,
} from "../reactUtils";

import { getActiveFreedrawBounds } from "../freedrawPerf";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import { frameClip } from "./staticScene";

import type { NewElementSceneRenderConfig } from "../scene/types";

let hasWarnedActiveFreedrawFallback = false;

const renderActiveFreedrawElement = (
  element: NonDeleted<ExcalidrawFreeDrawElement>,
  context: CanvasRenderingContext2D,
  appState: NewElementSceneRenderConfig["appState"],
  renderConfig: NewElementSceneRenderConfig["renderConfig"],
  elementsMap: NewElementSceneRenderConfig["elementsMap"],
) => {
  markExcalidrawPerf("freedraw:active-render-start", {
    points: element.points.length,
  });

  const activeBounds = getActiveFreedrawBounds(element);
  const [x1, y1, x2, y2] = activeBounds
    ? [
        activeBounds.minX + element.x,
        activeBounds.minY + element.y,
        activeBounds.maxX + element.x,
        activeBounds.maxY + element.y,
      ]
    : getElementAbsoluteCoords(element, elementsMap);
  const cx = (x1 + x2) / 2 + appState.scrollX;
  const cy = (y1 + y2) / 2 + appState.scrollY;
  const shiftX = (x2 - x1) / 2 - (element.x - x1);
  const shiftY = (y2 - y1) / 2 - (element.y - y1);

  markExcalidrawPerf("freedraw:active-svg-start", {
    points: element.points.length,
  });
  const svgPath = getFreeDrawSvgPath(element);
  markExcalidrawPerf("freedraw:active-svg-end", {
    points: element.points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-svg",
    "freedraw:active-svg-start",
    "freedraw:active-svg-end",
  );

  markExcalidrawPerf("freedraw:active-path2d-start", {
    points: element.points.length,
  });
  const path = new Path2D(svgPath);
  markExcalidrawPerf("freedraw:active-path2d-end", {
    points: element.points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-path2d",
    "freedraw:active-path2d-start",
    "freedraw:active-path2d-end",
  );

  context.save();
  context.globalAlpha = getRenderOpacity(
    element,
    getContainingFrame(element, elementsMap),
    renderConfig.elementsPendingErasure,
    renderConfig.pendingFlowchartNodes,
  );
  context.fillStyle = element.strokeColor;
  context.translate(cx, cy);
  context.rotate(element.angle);
  context.translate(-shiftX, -shiftY);
  context.fill(path);
  context.restore();

  markExcalidrawPerf("freedraw:active-render-end", {
    points: element.points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-render",
    "freedraw:active-render-start",
    "freedraw:active-render-end",
  );
};

const _renderNewElementScene = ({
  canvas,
  rc,
  newElement,
  elementsMap,
  allElementsMap,
  scale,
  appState,
  renderConfig,
}: NewElementSceneRenderConfig) => {
  if (canvas) {
    const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
      canvas,
      scale,
    );

    const context = bootstrapCanvas({
      canvas,
      scale,
      normalizedWidth,
      normalizedHeight,
    });

    markExcalidrawPerf("new-element-canvas:render-start", {
      type: newElement?.type,
      isExporting: renderConfig.isExporting,
    });
    context.save();

    try {
      // Apply zoom
      context.scale(appState.zoom.value, appState.zoom.value);

      if (newElement && newElement.type !== "selection") {
        // e.g. when creating arrows and we're still below the arrow drag distance
        // threshold
        // (for now we skip render only with elements while we're creating to be
        // safe)
        if (isInvisiblySmallElement(newElement)) {
          return;
        }

        const frameId = newElement.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          const frame = getTargetFrame(newElement, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(newElement, frame, appState, elementsMap)
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
        }

        if (
          isFreedrawPerfV2Enabled() &&
          newElement.type === "freedraw" &&
          !renderConfig.isExporting
        ) {
          try {
            renderActiveFreedrawElement(
              newElement,
              context,
              appState,
              renderConfig,
              elementsMap,
            );
          } catch (error) {
            if (isDevEnv() && !hasWarnedActiveFreedrawFallback) {
              hasWarnedActiveFreedrawFallback = true;
              console.warn(
                "Excalidraw: active freedraw renderer failed; falling back to default renderer.",
                error,
              );
            }
            renderElement(
              newElement,
              elementsMap,
              allElementsMap,
              rc,
              context,
              renderConfig,
              appState,
            );
          }
        } else {
          renderElement(
            newElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }
      } else {
        context.clearRect(0, 0, normalizedWidth, normalizedHeight);
      }
    } finally {
      context.restore();
      markExcalidrawPerf("new-element-canvas:render-end", {
        type: newElement?.type,
        isExporting: renderConfig.isExporting,
      });
      measureExcalidrawPerf(
        "new-element-canvas:render",
        "new-element-canvas:render-start",
        "new-element-canvas:render-end",
      );
    }
  }
};

export const renderNewElementSceneThrottled = throttleRAF(
  (config: NewElementSceneRenderConfig) => {
    _renderNewElementScene(config);
  },
);

export const renderNewElementScene = (
  renderConfig: NewElementSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderNewElementSceneThrottled(renderConfig);
    return;
  }

  _renderNewElementScene(renderConfig);
};
