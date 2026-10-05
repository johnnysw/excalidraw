import { randomId } from "@excalidraw/common";
import { resolveMindmapObjectGeometry } from "@excalidraw/mindmap";

import { newElement } from "./newGenericElement";
import { newElementWith } from "./newElementWith";
import {
  getCoursewareMindmapGeometry,
  cacheCoursewareMindmapGeometry,
} from "./coursewareMindmapGeometry";
import { coursewareMindmapLocalToScene } from "./coursewareMindmapTransform";
import { resolveCoursewareMindmapExchangeOrigin } from "./coursewareMindmapExchange";

import type { WhiteboardMindmapObject } from "@excalidraw/mindmap";
import type { Radians } from "@excalidraw/math";
import type { ExcalidrawRectangleElement } from "./types";
import type { CoursewareMindmapElement } from "./coursewareMindmapType";

export * from "./coursewareMindmapType";
export * from "./fileReferences";
export * from "./coursewareMindmapGeometry";
export * from "./coursewareMindmapCanvas";
export * from "./coursewareMindmapSvg";
export * from "./coursewareMindmapTransform";
export * from "./coursewareMindmapExchange";

export const createCoursewareMindmapElement = ({
  mindmap,
  x = mindmap.x,
  y = mindmap.y,
  id = randomId(),
}: {
  mindmap: WhiteboardMindmapObject;
  x?: number;
  y?: number;
  id?: string;
}): CoursewareMindmapElement => {
  const bounds = resolveMindmapObjectGeometry(mindmap, { padding: 0 }).bounds;
  const element = newElement({
    type: "rectangle",
    x,
    y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    angle: ((mindmap.rotation * Math.PI) / 180) as Radians,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    strokeWidth: 0,
    roughness: 0,
    fillStyle: "solid",
    locked: mindmap.locked,
    opacity: (mindmap.opacity ?? 1) * 100,
    customData: {
      coursewareObjectType: "mindmap",
      mindmap: { ...mindmap, id },
    },
  });
  return { ...element, id } as CoursewareMindmapElement;
};

export const createCoursewareMindmapElementFromExchange = (
  input: Parameters<typeof createCoursewareMindmapElement>[0],
): CoursewareMindmapElement => createCoursewareMindmapElement({
  ...resolveCoursewareMindmapExchangeOrigin(input.mindmap),
  ...input,
});

const rotateMindmapOffset = (
  { x, y }: { x: number; y: number },
  angle: number,
) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});

/** Commit a whole-tree edit while keeping the root centre anchored in world space. */
export const updateCoursewareMindmapElement = (
  element: ExcalidrawRectangleElement,
  mindmap: WhiteboardMindmapObject,
): CoursewareMindmapElement => {
  const previous = getCoursewareMindmapGeometry(element);
  const root = previous?.nodes[previous.rootId];
  const anchor = root
    ? coursewareMindmapLocalToScene(element, {
        x: root.x + root.width / 2,
        y: root.y + root.height / 2,
      })
    : { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  const model = { ...mindmap, id: element.id };
  const next = resolveMindmapObjectGeometry(model, { padding: 0 });
  const scaleX =
    element.width / Math.max(1, previous?.bounds.width ?? element.width);
  const scaleY =
    element.height / Math.max(1, previous?.bounds.height ?? element.height);
  const width = Math.max(1, next.bounds.width * scaleX);
  const height = Math.max(1, next.bounds.height * scaleY);
  const nextRoot = next.nodes[next.rootId];
  const offset = rotateMindmapOffset(
    nextRoot
      ? {
          x:
            ((nextRoot.x + nextRoot.width / 2 - next.bounds.x) * scaleX -
              width / 2) *
            (model.flipX ? -1 : 1),
          y:
            ((nextRoot.y + nextRoot.height / 2 - next.bounds.y) * scaleY -
              height / 2) *
            (model.flipY ? -1 : 1),
        }
      : { x: 0, y: 0 },
    element.angle,
  );
  cacheCoursewareMindmapGeometry(model, next);
  return newElementWith(element, {
    x: anchor.x - offset.x - width / 2,
    y: anchor.y - offset.y - height / 2,
    width,
    height,
    customData: {
      ...element.customData,
      coursewareObjectType: "mindmap",
      mindmap: model,
    },
  }) as CoursewareMindmapElement;
};
