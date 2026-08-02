import { getElementBounds, isElementInViewport } from "@excalidraw/element";

import {
  isDevEnv,
  memoize,
  toBrandedType,
  viewportCoordsToSceneCoords,
} from "@excalidraw/common";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { Scene } from "@excalidraw/element";

import { renderStaticSceneThrottled } from "../renderer/staticScene";
import { markExcalidrawPerf } from "../reactUtils";

import type { RenderableElementsMap } from "./types";

import type { AppState } from "../types";

const SPATIAL_GRID_CELL_SIZE = 1000;
const SPATIAL_GRID_MAX_CELL_VISITS = 20000;
const SPATIAL_GRID_MAX_ELEMENT_CELLS = 4000;

export type SpatialIndexCache = {
  key: string;
  grid: Map<string, NonDeletedExcalidrawElement[]>;
  overflow: NonDeletedExcalidrawElement[];
  order: Map<ExcalidrawElement["id"], number>;
};

const getCellKey = (cellX: number, cellY: number) => `${cellX}:${cellY}`;

const getCellRange = (min: number, max: number) =>
  [
    Math.floor(min / SPATIAL_GRID_CELL_SIZE),
    Math.floor(max / SPATIAL_GRID_CELL_SIZE),
  ] as const;

const getSpatialIndexCacheKey = (
  sceneNonce: ReturnType<InstanceType<typeof Scene>["getSceneNonce"]>,
  elementCount: number,
) => `${sceneNonce ?? "no-scene-nonce"}:${elementCount}`;

const addElementToSpatialIndex = (
  spatialIndex: SpatialIndexCache,
  element: NonDeletedExcalidrawElement,
  elementsMap: RenderableElementsMap,
  orderIndex: number,
) => {
  spatialIndex.order.set(element.id, orderIndex);

  const [x1, y1, x2, y2] = getElementBounds(element, elementsMap);
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    spatialIndex.overflow.push(element);
    return;
  }

  const [minCellX, maxCellX] = getCellRange(
    Math.min(x1, x2),
    Math.max(x1, x2),
  );
  const [minCellY, maxCellY] = getCellRange(
    Math.min(y1, y2),
    Math.max(y1, y2),
  );
  const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1);

  if (cellCount > SPATIAL_GRID_MAX_ELEMENT_CELLS) {
    spatialIndex.overflow.push(element);
    return;
  }

  for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
      const cellKey = getCellKey(cellX, cellY);
      const bucket = spatialIndex.grid.get(cellKey);
      if (bucket) {
        bucket.push(element);
      } else {
        spatialIndex.grid.set(cellKey, [element]);
      }
    }
  }
};

export const buildRenderableSpatialIndex = (
  key: string,
  elementsMap: RenderableElementsMap,
): SpatialIndexCache => {
  const grid = new Map<string, NonDeletedExcalidrawElement[]>();
  const overflow: NonDeletedExcalidrawElement[] = [];
  const order = new Map<ExcalidrawElement["id"], number>();
  const spatialIndex = { key, grid, overflow, order };

  let orderIndex = 0;
  for (const element of elementsMap.values()) {
    addElementToSpatialIndex(
      spatialIndex,
      element,
      elementsMap,
      orderIndex++,
    );
  }

  return spatialIndex;
};

type ViewportCullConfig = {
  elementsMap: RenderableElementsMap;
  zoom: AppState["zoom"];
  offsetLeft: AppState["offsetLeft"];
  offsetTop: AppState["offsetTop"];
  scrollX: AppState["scrollX"];
  scrollY: AppState["scrollY"];
  height: AppState["height"];
  width: AppState["width"];
};

export const getVisibleCanvasElementsByFullScan = ({
  elementsMap,
  zoom,
  offsetLeft,
  offsetTop,
  scrollX,
  scrollY,
  height,
  width,
}: ViewportCullConfig): readonly NonDeletedExcalidrawElement[] => {
  const visibleElements: NonDeletedExcalidrawElement[] = [];
  for (const element of elementsMap.values()) {
    if (
      isElementInViewport(
        element,
        width,
        height,
        {
          zoom,
          offsetLeft,
          offsetTop,
          scrollX,
          scrollY,
        },
        elementsMap,
      )
    ) {
      visibleElements.push(element);
    }
  }
  return visibleElements;
};

export const getVisibleCanvasElementsFromSpatialIndex = ({
  spatialIndex,
  elementsMap,
  zoom,
  offsetLeft,
  offsetTop,
  scrollX,
  scrollY,
  height,
  width,
}: ViewportCullConfig & {
  spatialIndex: SpatialIndexCache;
}): readonly NonDeletedExcalidrawElement[] => {
  const topLeft = viewportCoordsToSceneCoords(
    { clientX: offsetLeft, clientY: offsetTop },
    { zoom, offsetLeft, offsetTop, scrollX, scrollY },
  );
  const bottomRight = viewportCoordsToSceneCoords(
    { clientX: offsetLeft + width, clientY: offsetTop + height },
    { zoom, offsetLeft, offsetTop, scrollX, scrollY },
  );
  const [minCellX, maxCellX] = getCellRange(
    Math.min(topLeft.x, bottomRight.x),
    Math.max(topLeft.x, bottomRight.x),
  );
  const [minCellY, maxCellY] = getCellRange(
    Math.min(topLeft.y, bottomRight.y),
    Math.max(topLeft.y, bottomRight.y),
  );
  const cellVisits = (maxCellX - minCellX + 3) * (maxCellY - minCellY + 3);

  if (cellVisits > SPATIAL_GRID_MAX_CELL_VISITS) {
    throw new Error("viewport spans too many spatial cells");
  }

  const candidates = new Set<NonDeletedExcalidrawElement>();

  for (let cellX = minCellX - 1; cellX <= maxCellX + 1; cellX++) {
    for (let cellY = minCellY - 1; cellY <= maxCellY + 1; cellY++) {
      const bucket = spatialIndex.grid.get(getCellKey(cellX, cellY));
      if (bucket) {
        bucket.forEach((element) => candidates.add(element));
      }
    }
  }

  spatialIndex.overflow.forEach((element) => candidates.add(element));

  return [...candidates]
    .filter(
      (element) =>
        elementsMap.has(element.id) &&
        isElementInViewport(
          element,
          width,
          height,
          { zoom, offsetLeft, offsetTop, scrollX, scrollY },
          elementsMap,
        ),
    )
    .sort(
      (a, b) =>
        (spatialIndex.order.get(a.id) ?? 0) -
        (spatialIndex.order.get(b.id) ?? 0),
    );
};

export class Renderer {
  private scene: Scene;
  private spatialIndexCache: SpatialIndexCache | null = null;
  private hasWarnedSpatialIndexFallback = false;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  private buildSpatialIndex(
    key: string,
    elementsMap: RenderableElementsMap,
  ): SpatialIndexCache {
    return buildRenderableSpatialIndex(key, elementsMap);
  }

  private getSpatialIndex(
    key: string,
    elementsMap: RenderableElementsMap,
  ): SpatialIndexCache {
    if (this.spatialIndexCache?.key !== key) {
      markExcalidrawPerf("renderer:spatial-index-build-start", {
        elements: elementsMap.size,
      });
      this.spatialIndexCache = this.buildSpatialIndex(key, elementsMap);
      markExcalidrawPerf("renderer:spatial-index-build-end", {
        elements: elementsMap.size,
      });
    }
    return this.spatialIndexCache;
  }

  public onSceneElementAppended(
    element: NonDeletedExcalidrawElement,
    previousSceneNonce: ReturnType<
      InstanceType<typeof Scene>["getSceneNonce"]
    >,
    previousElementCount: number,
  ) {
    const spatialIndex = this.spatialIndexCache;
    const previousKey = getSpatialIndexCacheKey(
      previousSceneNonce,
      previousElementCount,
    );

    this.getRenderableElements.clear();

    if (!spatialIndex || spatialIndex.key !== previousKey) {
      this.spatialIndexCache = null;
      return;
    }

    try {
      const elementsMap = toBrandedType<RenderableElementsMap>(
        this.scene.getNonDeletedElementsMap(),
      );
      addElementToSpatialIndex(
        spatialIndex,
        element,
        elementsMap,
        previousElementCount,
      );
      spatialIndex.key = getSpatialIndexCacheKey(
        this.scene.getSceneNonce(),
        elementsMap.size,
      );
    } catch (error) {
      this.spatialIndexCache = null;
      this.warnSpatialIndexFallback(error);
    }
  }

  private warnSpatialIndexFallback(error: unknown) {
    if (isDevEnv() && !this.hasWarnedSpatialIndexFallback) {
      this.hasWarnedSpatialIndexFallback = true;
      console.warn(
        "Excalidraw: renderer spatial index failed; falling back to full viewport scan.",
        error,
      );
    }
  }

  private getVisibleCanvasElementsFromSpatialIndex({
    elementsMap,
    spatialElementsMap,
    cacheKey,
    zoom,
    offsetLeft,
    offsetTop,
    scrollX,
    scrollY,
    height,
    width,
  }: {
    elementsMap: RenderableElementsMap;
    spatialElementsMap: RenderableElementsMap;
    cacheKey: string;
    zoom: AppState["zoom"];
    offsetLeft: AppState["offsetLeft"];
    offsetTop: AppState["offsetTop"];
    scrollX: AppState["scrollX"];
    scrollY: AppState["scrollY"];
    height: AppState["height"];
    width: AppState["width"];
  }) {
    return getVisibleCanvasElementsFromSpatialIndex({
      spatialIndex: this.getSpatialIndex(cacheKey, spatialElementsMap),
      elementsMap,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
    });
  }

  public getRenderableElements = (() => {
    const getVisibleCanvasElements = ({
      elementsMap,
      spatialElementsMap,
      cacheKey,
      zoom,
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
      height,
      width,
    }: {
      elementsMap: RenderableElementsMap;
      spatialElementsMap: RenderableElementsMap;
      cacheKey: string;
      zoom: AppState["zoom"];
      offsetLeft: AppState["offsetLeft"];
      offsetTop: AppState["offsetTop"];
      scrollX: AppState["scrollX"];
      scrollY: AppState["scrollY"];
      height: AppState["height"];
      width: AppState["width"];
    }): readonly NonDeletedExcalidrawElement[] => {
      try {
        return this.getVisibleCanvasElementsFromSpatialIndex({
          elementsMap,
          spatialElementsMap,
          cacheKey,
          zoom,
          offsetLeft,
          offsetTop,
          scrollX,
          scrollY,
          height,
          width,
        });
      } catch (error) {
        this.warnSpatialIndexFallback(error);
      }

      return getVisibleCanvasElementsByFullScan({
        elementsMap,
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
      });
    };

    const getRenderableElementsMap = memoize(
      ({
        sceneNonce: _sceneNonce,
        editingTextElement,
        newElementId,
      }: {
        sceneNonce: ReturnType<InstanceType<typeof Scene>["getSceneNonce"]>;
        editingTextElement: AppState["editingTextElement"];
        newElementId: ExcalidrawElement["id"] | undefined;
      }) => {
        const sceneElementsMap = toBrandedType<RenderableElementsMap>(
          this.scene.getNonDeletedElementsMap(),
        );
        const editingTextElementId =
          editingTextElement?.type === "text"
            ? editingTextElement.id
            : undefined;
        const shouldFilter = Boolean(
          (newElementId && sceneElementsMap.has(newElementId)) ||
            (editingTextElementId &&
              sceneElementsMap.has(editingTextElementId)),
        );

        if (!shouldFilter) {
          return sceneElementsMap;
        }

        const elementsMap = toBrandedType<RenderableElementsMap>(new Map());
        for (const element of sceneElementsMap.values()) {
          if (
            element.id !== newElementId &&
            element.id !== editingTextElementId
          ) {
            elementsMap.set(element.id, element);
          }
        }
        return elementsMap;
      },
    );

    return memoize(
      ({
        zoom,
        offsetLeft,
        offsetTop,
        scrollX,
        scrollY,
        height,
        width,
        editingTextElement,
        newElementId,
        // cache-invalidation nonce
        sceneNonce,
      }: {
        zoom: AppState["zoom"];
        offsetLeft: AppState["offsetLeft"];
        offsetTop: AppState["offsetTop"];
        scrollX: AppState["scrollX"];
        scrollY: AppState["scrollY"];
        height: AppState["height"];
        width: AppState["width"];
        editingTextElement: AppState["editingTextElement"];
        /** note: first render of newElement will always bust the cache
         * (we'd have to prefilter elements outside of this function) */
        newElementId: ExcalidrawElement["id"] | undefined;
        sceneNonce: ReturnType<InstanceType<typeof Scene>["getSceneNonce"]>;
      }) => {
        const spatialElementsMap = toBrandedType<RenderableElementsMap>(
          this.scene.getNonDeletedElementsMap(),
        );
        const elementsMap = getRenderableElementsMap({
          sceneNonce,
          editingTextElement,
          newElementId,
        });

        const spatialIndexCacheKey = getSpatialIndexCacheKey(
          sceneNonce,
          spatialElementsMap.size,
        );

        const visibleElements = getVisibleCanvasElements({
          elementsMap,
          spatialElementsMap,
          cacheKey: spatialIndexCacheKey,
          zoom,
          offsetLeft,
          offsetTop,
          scrollX,
          scrollY,
          height,
          width,
        });

        return { elementsMap, visibleElements };
      },
    );
  })();

  // NOTE Doesn't destroy everything (scene, rc, etc.) because it may not be
  // safe to break TS contract here (for upstream cases)
  public destroy() {
    renderStaticSceneThrottled.cancel();
    this.getRenderableElements.clear();
    this.spatialIndexCache = null;
  }
}
