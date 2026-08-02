import React, { useEffect, useRef } from "react";

import { isShallowEqual } from "@excalidraw/common";

import { isRenderThrottlingEnabled } from "../../reactUtils";
import { renderStaticScene } from "../../renderer/staticScene";

import type { StaticCanvasRenderConfig } from "../../scene/types";
import type { AppState, StaticCanvasAppState } from "../../types";
import type { ReadCanvasRenderData } from "./renderData";
import type { RoughCanvas } from "roughjs/bin/canvas";

type StaticCanvasProps = {
  canvas: HTMLCanvasElement;
  rc: RoughCanvas;
  readRenderData: ReadCanvasRenderData;
  sceneNonce: number | undefined;
  selectionNonce: number | undefined;
  scale: number;
  appState: StaticCanvasAppState;
  renderConfig: StaticCanvasRenderConfig;
  shouldReconcileFreedrawOverlay?: () => boolean;
  onFreedrawOverlayReconciled?: () => void;
};

const StaticCanvas = (props: StaticCanvasProps) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isComponentMounted = useRef(false);

  useEffect(() => {
    props.canvas.style.width = `${props.appState.width}px`;
    props.canvas.style.height = `${props.appState.height}px`;
    props.canvas.width = props.appState.width * props.scale;
    props.canvas.height = props.appState.height * props.scale;
  }, [props.appState.height, props.appState.width, props.canvas, props.scale]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const canvas = props.canvas;

    if (!isComponentMounted.current) {
      isComponentMounted.current = true;

      wrapper.replaceChildren(canvas);
      canvas.classList.add("excalidraw__canvas", "static");
    }

    const { elementsMap, allElementsMap, visibleElements } =
      props.readRenderData();

    const shouldReconcileFreedrawOverlay =
      props.shouldReconcileFreedrawOverlay?.() ?? false;

    renderStaticScene(
      {
        canvas,
        rc: props.rc,
        scale: props.scale,
        elementsMap,
        allElementsMap,
        visibleElements,
        appState: props.appState,
        renderConfig: props.renderConfig,
      },
      shouldReconcileFreedrawOverlay
        ? false
        : isRenderThrottlingEnabled(),
    );

    if (shouldReconcileFreedrawOverlay) {
      props.onFreedrawOverlayReconciled?.();
    }
  });

  return <div className="excalidraw__canvas-wrapper" ref={wrapperRef} />;
};

const getRelevantAppStateProps = (
  appState: AppState,
): StaticCanvasAppState &
  Pick<AppState, "editingTextElement" | "newElement"> => {
  const relevantAppStateProps = {
    zoom: appState.zoom,
    scrollX: appState.scrollX,
    scrollY: appState.scrollY,
    width: appState.width,
    height: appState.height,
    viewModeEnabled: appState.viewModeEnabled,
    openDialog: appState.openDialog,
    hoveredElementIds: appState.hoveredElementIds,
    offsetLeft: appState.offsetLeft,
    offsetTop: appState.offsetTop,
    theme: appState.theme,
    shouldCacheIgnoreZoom: appState.shouldCacheIgnoreZoom,
    viewBackgroundColor: appState.viewBackgroundColor,
    exportScale: appState.exportScale,
    selectedElementsAreBeingDragged: appState.selectedElementsAreBeingDragged,
    gridSize: appState.gridSize,
    gridStep: appState.gridStep,
    frameRendering: appState.frameRendering,
    selectedElementIds: appState.selectedElementIds,
    frameToHighlight: appState.frameToHighlight,
    editingGroupId: appState.editingGroupId,
    currentHoveredFontFamily: appState.currentHoveredFontFamily,
    editingTextElement: appState.editingTextElement,
    newElement: appState.newElement,
    croppingElementId: appState.croppingElementId,
    suggestedBinding: appState.suggestedBinding,
    presentationMode: appState.presentationMode,
    presentationStep: appState.presentationStep,
    animationProgress: appState.animationProgress,
    openSidebarTab: appState.openSidebar?.tab,
  };

  return relevantAppStateProps;
};

const areEqual = (
  prevProps: StaticCanvasProps,
  nextProps: StaticCanvasProps,
) => {
  if (
    prevProps.sceneNonce !== nextProps.sceneNonce ||
    prevProps.scale !== nextProps.scale ||
    prevProps.readRenderData !== nextProps.readRenderData ||
    prevProps.shouldReconcileFreedrawOverlay !==
      nextProps.shouldReconcileFreedrawOverlay ||
    prevProps.onFreedrawOverlayReconciled !==
      nextProps.onFreedrawOverlayReconciled
  ) {
    return false;
  }

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the StaticCanvas-relevant props
      getRelevantAppStateProps(prevProps.appState as AppState),
      getRelevantAppStateProps(nextProps.appState as AppState),
      {
        newElement: (prevElement, nextElement) =>
          prevElement === nextElement ||
          (prevProps.sceneNonce === nextProps.sceneNonce &&
            ((prevElement?.type === "freedraw" && nextElement === null) ||
              (prevElement === null && nextElement?.type === "freedraw"))),
      },
    ) && isShallowEqual(prevProps.renderConfig, nextProps.renderConfig)
  );
};

export default React.memo(StaticCanvas, areEqual);
