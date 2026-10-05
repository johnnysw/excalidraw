import {
  resolveMindmapObjectGeometry,
  scaleMindmapForTransform,
  transformRectanglePoint,
} from "@excalidraw/mindmap";
import { getCoursewareMindmapGeometry } from "./coursewareMindmapGeometry";
import { getCoursewareMindmap } from "./coursewareMindmapType";
import { coursewareMindmapLocalToScene } from "./coursewareMindmapTransform";
import type { WhiteboardMindmapObject } from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "./types";

const rotateOffset = (x: number, y: number, angle: number) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});

/** Exchanges the rendered native transform without modifying the editing model. */
export const getCoursewareMindmapForExchange = (
  element: ExcalidrawRectangleElement,
): WhiteboardMindmapObject | null => {
  const model = getCoursewareMindmap(element);
  const geometry = getCoursewareMindmapGeometry(element);
  if (!model || !geometry) return null;
  const root = geometry.nodes[geometry.rootId];
  if (!root) return null;
  const anchor = coursewareMindmapLocalToScene(element, {
    x: root.x + root.width / 2,
    y: root.y + root.height / 2,
  });
  const scaleX = element.width / Math.max(1, geometry.bounds.width);
  const scaleY = element.height / Math.max(1, geometry.bounds.height);
  const rotation = (element.angle * 180) / Math.PI;
  const scaled =
    Math.abs(scaleX - 1) < 1e-9 && Math.abs(scaleY - 1) < 1e-9
      ? model
      : scaleMindmapForTransform(model, {
          x: model.x,
          y: model.y,
          width: model.width * scaleX,
          height: model.height * scaleY,
          rotation,
        });
  const projected = {
    ...scaled,
    id: element.id,
    x: 0,
    y: 0,
    rotation,
    opacity: element.opacity / 100,
    locked: element.locked,
  };
  const nextRoot = resolveMindmapObjectGeometry(projected, { padding: 0 })
    .nodes[projected.rootId];
  const offset = transformRectanglePoint(projected, {
    x: nextRoot.x + nextRoot.width / 2,
    y: nextRoot.y + nextRoot.height / 2,
  });
  return { ...projected, x: anchor.x - offset.x, y: anchor.y - offset.y };
};

/** Konva rotates at the object origin; native rectangles rotate at their centre. */
export const resolveCoursewareMindmapExchangeOrigin = (
  model: WhiteboardMindmapObject,
) => {
  const geometry = resolveMindmapObjectGeometry(model, { padding: 0 });
  const root = geometry.nodes[geometry.rootId];
  const center = { x: root.x + root.width / 2, y: root.y + root.height / 2 };
  const anchor = transformRectanglePoint(model, {
    x: model.x + center.x,
    y: model.y + center.y,
  });
  const offset = rotateOffset(
    (center.x - geometry.bounds.x - geometry.bounds.width / 2) *
      (model.flipX ? -1 : 1),
    (center.y - geometry.bounds.y - geometry.bounds.height / 2) *
      (model.flipY ? -1 : 1),
    (model.rotation * Math.PI) / 180,
  );
  return {
    x: anchor.x - offset.x - geometry.bounds.width / 2,
    y: anchor.y - offset.y - geometry.bounds.height / 2,
  };
};
