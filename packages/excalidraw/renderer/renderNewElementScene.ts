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

import { markExcalidrawPerf, measureExcalidrawPerf } from "../reactUtils";

import {
  getActiveFreedrawBounds,
  getActiveFreedrawStroke,
  type ActiveFreedrawStroke,
} from "../freedrawPerf";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import { frameClip } from "./staticScene";

import type { NewElementSceneRenderConfig } from "../scene/types";

let hasWarnedActiveFreedrawPreviewFailure = false;
let hasWarnedNewElementRenderFailure = false;
const activeFreedrawIncrementalPreviewFailures =
  new WeakSet<ExcalidrawFreeDrawElement>();

type ActiveFreedrawPreviewCanvasState = {
  signature: string;
  renderedPointCount: number;
  lastPressure: number;
  lastRadius: number;
};

const activeFreedrawPreviewCanvasStates = new WeakMap<
  HTMLCanvasElement,
  ActiveFreedrawPreviewCanvasState
>();

const getActiveFreedrawPreviewPressure = (
  stroke: ActiveFreedrawStroke,
  previewPointIndex: number,
  previousPressure: number,
  strokeSize: number,
) => {
  const rawPointIndex = stroke.previewPointIndices[previewPointIndex] ?? 0;

  if (!stroke.simulatePressure) {
    return Math.max(
      0.01,
      Math.min(1, stroke.pressures[rawPointIndex] ?? previousPressure),
    );
  }

  const point = stroke.previewPoints[previewPointIndex];
  const previousPoint = stroke.previewPoints[previewPointIndex - 1];
  if (!point || !previousPoint) {
    return previousPressure;
  }

  const distance = Math.hypot(
    point[0] - previousPoint[0],
    point[1] - previousPoint[1],
  );
  const rate = Math.min(1, distance / strokeSize);
  return Math.min(
    1,
    previousPressure +
      (Math.min(1, 1 - rate) - previousPressure) * (rate * 0.275),
  );
};

const getActiveFreedrawPreviewRadius = (
  strokeSize: number,
  pressure: number,
) => {
  const thinning = 0.6;
  const pressureFactor = Math.max(
    0.01,
    Math.min(1, 0.5 - thinning * (0.5 - pressure)),
  );
  return Math.max(0.01, strokeSize * Math.sin((pressureFactor * Math.PI) / 2));
};

const prepareActiveFreedrawPreviewCanvas = (
  canvas: HTMLCanvasElement,
  scale: number,
  normalizedWidth: number,
  normalizedHeight: number,
  element: ExcalidrawFreeDrawElement,
  stroke: ActiveFreedrawStroke,
  appState: NewElementSceneRenderConfig["appState"],
  opacity: number,
  frameSignature: string,
) => {
  const context = canvas.getContext("2d")!;
  const signature = [
    element.id,
    canvas.width,
    canvas.height,
    scale,
    appState.zoom.value,
    appState.scrollX,
    appState.scrollY,
    element.x,
    element.y,
    element.strokeWidth,
    element.strokeColor,
    opacity,
    frameSignature,
  ].join(":");
  let state = activeFreedrawPreviewCanvasStates.get(canvas);

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.filter = "none";
  context.scale(scale, scale);

  if (
    !state ||
    state.signature !== signature ||
    state.renderedPointCount > stroke.previewPoints.length
  ) {
    context.clearRect(0, 0, normalizedWidth, normalizedHeight);
    state = {
      signature,
      renderedPointCount: 0,
      lastPressure: 0.25,
      lastRadius: 0,
    };
    activeFreedrawPreviewCanvasStates.set(canvas, state);
  }

  return { context, state };
};

const renderActiveFreedrawIncrementalPreview = (
  element: NonDeleted<ExcalidrawFreeDrawElement>,
  stroke: ActiveFreedrawStroke,
  context: CanvasRenderingContext2D,
  state: ActiveFreedrawPreviewCanvasState,
  appState: NewElementSceneRenderConfig["appState"],
  opacity: number,
) => {
  const points = stroke.previewPoints;
  if (!points.length || state.renderedPointCount >= points.length) {
    return;
  }

  markExcalidrawPerf("freedraw:active-preview-start", {
    rawPoints: stroke.points.length,
    previewPoints: points.length,
    newPreviewPoints: points.length - state.renderedPointCount,
  });

  const strokeSize = element.strokeWidth * 4.25;
  let startIndex = state.renderedPointCount;
  let previousPressure = state.lastPressure;
  let previousRadius = state.lastRadius;

  context.save();
  try {
    context.globalAlpha = opacity;
    context.fillStyle = element.strokeColor;
    context.strokeStyle = element.strokeColor;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.translate(
      element.x + appState.scrollX,
      element.y + appState.scrollY,
    );

    if (startIndex === 0) {
      previousPressure = getActiveFreedrawPreviewPressure(
        stroke,
        0,
        previousPressure,
        strokeSize,
      );
      previousRadius = getActiveFreedrawPreviewRadius(
        strokeSize,
        previousPressure,
      );
      const firstPoint = points[0];
      context.beginPath();
      context.arc(firstPoint[0], firstPoint[1], previousRadius, 0, Math.PI * 2);
      context.fill();
      startIndex = 1;
    }

    for (let index = startIndex; index < points.length; index++) {
      const previousPoint = points[index - 1];
      const point = points[index];
      const pressure = getActiveFreedrawPreviewPressure(
        stroke,
        index,
        previousPressure,
        strokeSize,
      );
      const radius = getActiveFreedrawPreviewRadius(strokeSize, pressure);

      context.lineWidth = Math.max(0.01, previousRadius + radius);
      context.beginPath();
      context.moveTo(previousPoint[0], previousPoint[1]);
      context.lineTo(point[0], point[1]);
      context.stroke();

      context.beginPath();
      context.arc(point[0], point[1], radius, 0, Math.PI * 2);
      context.fill();

      previousPressure = pressure;
      previousRadius = radius;
    }
  } finally {
    context.restore();
  }
  state.renderedPointCount = points.length;
  state.lastPressure = previousPressure;
  state.lastRadius = previousRadius;

  markExcalidrawPerf("freedraw:active-preview-end", {
    rawPoints: stroke.points.length,
    previewPoints: points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-preview",
    "freedraw:active-preview-start",
    "freedraw:active-preview-end",
  );
};

const renderActiveFreedrawFullPreview = (
  element: NonDeleted<ExcalidrawFreeDrawElement>,
  stroke: ActiveFreedrawStroke | undefined,
  context: CanvasRenderingContext2D,
  appState: NewElementSceneRenderConfig["appState"],
  renderConfig: NewElementSceneRenderConfig["renderConfig"],
  elementsMap: NewElementSceneRenderConfig["elementsMap"],
) => {
  const activeBounds = getActiveFreedrawBounds(element);
  const renderElement = stroke
    ? ({
        ...element,
        points: stroke.points,
        pressures: element.simulatePressure ? [] : stroke.pressures,
        width: activeBounds?.width ?? element.width,
        height: activeBounds?.height ?? element.height,
      } as NonDeleted<ExcalidrawFreeDrawElement>)
    : element;

  markExcalidrawPerf("freedraw:active-render-start", {
    points: renderElement.points.length,
  });

  const [x1, y1, x2, y2] = activeBounds
    ? [
        activeBounds.minX + renderElement.x,
        activeBounds.minY + renderElement.y,
        activeBounds.maxX + renderElement.x,
        activeBounds.maxY + renderElement.y,
      ]
    : getElementAbsoluteCoords(renderElement, elementsMap);
  const cx = (x1 + x2) / 2 + appState.scrollX;
  const cy = (y1 + y2) / 2 + appState.scrollY;
  const shiftX = (x2 - x1) / 2 - (renderElement.x - x1);
  const shiftY = (y2 - y1) / 2 - (renderElement.y - y1);

  markExcalidrawPerf("freedraw:active-svg-start", {
    points: renderElement.points.length,
  });
  const svgPath = getFreeDrawSvgPath(renderElement);
  markExcalidrawPerf("freedraw:active-svg-end", {
    points: renderElement.points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-svg",
    "freedraw:active-svg-start",
    "freedraw:active-svg-end",
  );

  markExcalidrawPerf("freedraw:active-path2d-start", {
    points: renderElement.points.length,
  });
  const path = new Path2D(svgPath);
  markExcalidrawPerf("freedraw:active-path2d-end", {
    points: renderElement.points.length,
  });
  measureExcalidrawPerf(
    "freedraw:active-path2d",
    "freedraw:active-path2d-start",
    "freedraw:active-path2d-end",
  );

  context.save();
  context.globalAlpha = getRenderOpacity(
    renderElement,
    getContainingFrame(renderElement, elementsMap),
    renderConfig.elementsPendingErasure,
    renderConfig.pendingFlowchartNodes,
  );
  context.fillStyle = renderElement.strokeColor;
  try {
    context.translate(cx, cy);
    context.rotate(renderElement.angle);
    context.translate(-shiftX, -shiftY);
    context.fill(path);
  } finally {
    context.restore();
  }

  markExcalidrawPerf("freedraw:active-render-end", {
    points: renderElement.points.length,
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
  if (!canvas) {
    return;
  }

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );
  const activeStroke =
    newElement?.type === "freedraw"
      ? getActiveFreedrawStroke(newElement)
      : undefined;
  const hasActiveFreedrawStroke = Boolean(
    newElement?.type === "freedraw" &&
      activeStroke &&
      !renderConfig.isExporting,
  );
  const shouldUseIncrementalPreview = Boolean(
    hasActiveFreedrawStroke &&
      newElement?.type === "freedraw" &&
      newElement.angle === 0 &&
      !activeFreedrawIncrementalPreviewFailures.has(newElement),
  );
  const frameId =
    newElement && newElement.type !== "selection"
      ? newElement.frameId || appState.frameToHighlight?.id
      : null;
  const frame =
    frameId && newElement && newElement.type !== "selection"
      ? getTargetFrame(newElement, elementsMap, appState)
      : null;
  const shouldClip = Boolean(
    newElement &&
      newElement.type !== "selection" &&
      frame &&
      frameId &&
      appState.frameRendering.enabled &&
      appState.frameRendering.clip &&
      shouldApplyFrameClip(newElement, frame, appState, elementsMap),
  );
  const opacity =
    newElement?.type === "freedraw"
      ? getRenderOpacity(
          newElement,
          getContainingFrame(newElement, elementsMap),
          renderConfig.elementsPendingErasure,
          renderConfig.pendingFlowchartNodes,
        )
      : 1;

  const renderWithSceneTransform = (
    context: CanvasRenderingContext2D,
    render: (context: CanvasRenderingContext2D) => void,
  ) => {
    context.save();
    try {
      context.scale(appState.zoom.value, appState.zoom.value);
      if (shouldClip && frame) {
        frameClip(frame, context, renderConfig, appState);
      }
      render(context);
    } finally {
      context.restore();
    }
  };

  const createClearedContext = () =>
    bootstrapCanvas({
      canvas,
      scale,
      normalizedWidth,
      normalizedHeight,
    });

  const warnAboutActiveFreedrawPreviewFailure = (error: unknown) => {
    if (isDevEnv() && !hasWarnedActiveFreedrawPreviewFailure) {
      hasWarnedActiveFreedrawPreviewFailure = true;
      console.warn(
        "Excalidraw: active freedraw preview failed; using full active preview for this stroke.",
        error,
      );
    }
  };

  const warnAboutNewElementRenderFailure = (error: unknown) => {
    if (isDevEnv() && !hasWarnedNewElementRenderFailure) {
      hasWarnedNewElementRenderFailure = true;
      console.warn(
        "Excalidraw: new element rendering failed; drawing data was preserved.",
        error,
      );
    }
  };

  markExcalidrawPerf("new-element-canvas:render-start", {
    type: newElement?.type,
    isExporting: renderConfig.isExporting,
    freedrawIncrementalPreview: shouldUseIncrementalPreview,
  });

  try {
    if (!newElement || newElement.type === "selection") {
      createClearedContext();
      return;
    }

    if (isInvisiblySmallElement(newElement) && !hasActiveFreedrawStroke) {
      createClearedContext();
      return;
    }

    if (
      shouldUseIncrementalPreview &&
      newElement.type === "freedraw" &&
      activeStroke
    ) {
      try {
        const { context, state } = prepareActiveFreedrawPreviewCanvas(
          canvas,
          scale,
          normalizedWidth,
          normalizedHeight,
          newElement,
          activeStroke,
          appState,
          opacity,
          shouldClip && frame ? `${frame.id}:${frame.version}` : "none",
        );
        renderWithSceneTransform(context, (transformedContext) => {
          renderActiveFreedrawIncrementalPreview(
            newElement,
            activeStroke,
            transformedContext,
            state,
            appState,
            opacity,
          );
        });
        return;
      } catch (error) {
        activeFreedrawIncrementalPreviewFailures.add(newElement);
        warnAboutActiveFreedrawPreviewFailure(error);
      }
    }

    const context = createClearedContext();
    renderWithSceneTransform(context, (transformedContext) => {
      if (
        newElement.type === "freedraw" &&
        activeStroke &&
        !renderConfig.isExporting
      ) {
        try {
          renderActiveFreedrawFullPreview(
            newElement,
            activeStroke,
            transformedContext,
            appState,
            renderConfig,
            elementsMap,
          );
          return;
        } catch (error) {
          warnAboutActiveFreedrawPreviewFailure(error);
        }
      }

      renderElement(
        newElement,
        elementsMap,
        allElementsMap,
        rc,
        transformedContext,
        renderConfig,
        appState,
      );
    });
  } catch (error) {
    warnAboutNewElementRenderFailure(error);
  } finally {
    markExcalidrawPerf("new-element-canvas:render-end", {
      type: newElement?.type,
      isExporting: renderConfig.isExporting,
      freedrawIncrementalPreview: shouldUseIncrementalPreview,
    });
    measureExcalidrawPerf(
      "new-element-canvas:render",
      "new-element-canvas:render-start",
      "new-element-canvas:render-end",
    );
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
