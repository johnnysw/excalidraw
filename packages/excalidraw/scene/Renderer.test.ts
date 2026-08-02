import { toBrandedType } from "@excalidraw/common";
import { newElement } from "@excalidraw/element";

import type {
  ExcalidrawGenericElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import type { Mutable } from "@excalidraw/common/utility-types";

import {
  buildRenderableSpatialIndex,
  getVisibleCanvasElementsByFullScan,
  getVisibleCanvasElementsFromSpatialIndex,
} from "./Renderer";

import type { RenderableElementsMap } from "./types";

import type { Zoom } from "../types";

const zoom = { value: 1 } as Zoom;

const rectangle = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
) => {
  const element = newElement({
    type: "rectangle",
    x,
    y,
    width,
    height,
  });
  const mutableElement = element as Mutable<typeof element>;
  mutableElement.id = id;
  mutableElement.index = id as ExcalidrawGenericElement["index"];
  return element;
};

const toRenderableElementsMap = (
  elements: readonly NonDeletedExcalidrawElement[],
) => {
  const map = toBrandedType<RenderableElementsMap>(new Map());
  for (const element of elements) {
    map.set(element.id, element);
  }
  return map;
};

describe("renderer spatial index", () => {
  it("matches full viewport scan and preserves z-order", () => {
    const elements = [
      rectangle("a0", -4000, -4000),
      rectangle("a1", 20, 20),
      rectangle("a2", 3000, 3000),
      rectangle("a3", 140, 140),
      rectangle("a4", 900, 900, 220, 220),
      rectangle("a5", 10000, 10000),
    ];
    const elementsMap = toRenderableElementsMap(elements);
    const config = {
      elementsMap,
      zoom,
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 1000,
    };

    const fullScan = getVisibleCanvasElementsByFullScan(config);
    const spatialIndex = buildRenderableSpatialIndex("test", elementsMap);
    const indexed = getVisibleCanvasElementsFromSpatialIndex({
      ...config,
      spatialIndex,
    });

    expect(indexed.map((element) => element.id)).toEqual(
      fullScan.map((element) => element.id),
    );
    expect(indexed.map((element) => element.id)).toEqual(["a1", "a3", "a4"]);
  });

  it("keeps huge elements in overflow candidates", () => {
    const elements = [
      rectangle("a0", 20000, 20000),
      rectangle("a1", -2000, -2000, 100000, 100000),
      rectangle("a2", 20, 20),
    ];
    const elementsMap = toRenderableElementsMap(elements);
    const spatialIndex = buildRenderableSpatialIndex("test", elementsMap);

    expect(spatialIndex.overflow.map((element) => element.id)).toEqual(["a1"]);

    const indexed = getVisibleCanvasElementsFromSpatialIndex({
      spatialIndex,
      elementsMap,
      zoom,
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: 0,
      scrollY: 0,
      width: 1000,
      height: 1000,
    });

    expect(indexed.map((element) => element.id)).toEqual(["a1", "a2"]);
  });

  it.each([4000, 10000, 20000])(
    "matches full scan for %i elements across pan and zoom",
    (elementCount) => {
      const columns = 200;
      const elements = Array.from({ length: elementCount }, (_, index) =>
        rectangle(
          `element-${String(index).padStart(5, "0")}`,
          (index % columns) * 180 - 18000,
          Math.floor(index / columns) * 180 - 9000,
          120,
          120,
        ),
      );
      const elementsMap = toRenderableElementsMap(elements);
      const spatialIndex = buildRenderableSpatialIndex(
        `large-${elementCount}`,
        elementsMap,
      );
      const viewports = [
        { scrollX: 0, scrollY: 0, zoom },
        { scrollX: -4200, scrollY: -2300, zoom: { value: 0.5 } as Zoom },
        { scrollX: 3100, scrollY: 1700, zoom: { value: 2 } as Zoom },
      ];

      for (const viewport of viewports) {
        const config = {
          elementsMap,
          offsetLeft: 0,
          offsetTop: 0,
          width: 1440,
          height: 900,
          ...viewport,
        };
        const fullScan = getVisibleCanvasElementsByFullScan(config);
        const indexed = getVisibleCanvasElementsFromSpatialIndex({
          ...config,
          spatialIndex,
        });

        expect(indexed.map((element) => element.id)).toEqual(
          fullScan.map((element) => element.id),
        );
      }
    },
  );
});
