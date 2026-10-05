import React from "react";
import {
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
  coursewareMindmapLocalToScene,
  isCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import { getCoursewareMindmapRenderData } from "@excalidraw/element/coursewareMindmapRenderData";
import { MindmapNodeSelection } from "./MindmapNodeSelection";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapOtherSelections = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const state = controller.getSnapshot(),
    app = controller.app;
  return (
    <>
      {state.selections
        .filter((selected) => selected.elementId !== state.selection?.elementId)
        .map((selected) => {
          const element =
            state.previews.find((item) => item.id === selected.elementId) ??
            app.scene.getNonDeletedElementsMap().get(selected.elementId);
          if (!element || !isCoursewareMindmapElement(element)) return null;
          const data = getCoursewareMindmapRenderData(element),
            geometry = getCoursewareMindmapGeometry(element),
            model = getCoursewareMindmap(element);
          const node = data?.nodes.find(
            (item) => item.node.id === selected.nodeId,
          );
          if (!node || !geometry) return null;
          const point = coursewareMindmapLocalToScene(element, node.bounds);
          return (
            <MindmapNodeSelection
              key={`${element.id}:${selected.nodeId}`}
              node={node}
              layoutScale={data!.scale}
              style={{
                left: (point.x + app.state.scrollX) * app.state.zoom.value,
                top: (point.y + app.state.scrollY) * app.state.zoom.value,
                width:
                  ((node.bounds.width * element.width) /
                    geometry.bounds.width) *
                  app.state.zoom.value,
                height:
                  ((node.bounds.height * element.height) /
                    geometry.bounds.height) *
                  app.state.zoom.value,
                transform: `rotate(${element.angle}rad) scale(${model?.flipX ? -1 : 1},${model?.flipY ? -1 : 1})`,
                transformOrigin: "0 0",
              }}
            />
          );
        })}
    </>
  );
};
export const MindmapDropIndicator = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const { dropIntent } = controller.getSnapshot();
  if (!dropIntent) return null;
  const element = controller.app.scene
    .getNonDeletedElementsMap()
    .get(dropIntent.elementId);
  if (!element || !isCoursewareMindmapElement(element)) return null;
  const geometry = getCoursewareMindmapGeometry(element),
    model = getCoursewareMindmap(element),
    node = geometry?.nodes[dropIntent.nodeId];
  if (!node || !geometry) return null;
  const axis = node.side === "top" || node.side === "bottom" ? "x" : "y";
  const bounds =
    dropIntent.position === "inside"
      ? node
      : axis === "x"
        ? {
            x: dropIntent.position === "before" ? node.x : node.x + node.width,
            y: node.y,
            width: 0,
            height: node.height,
          }
        : {
            x: node.x,
            y: dropIntent.position === "before" ? node.y : node.y + node.height,
            width: node.width,
            height: 0,
          };
  const point = coursewareMindmapLocalToScene(element, bounds),
    app = controller.app;
  return (
    <div
      className={`Courseware-mindmap-drop-target ${dropIntent.position !== "inside" ? "is-insertion" : ""}`}
      style={{
        left: (point.x + app.state.scrollX) * app.state.zoom.value,
        top: (point.y + app.state.scrollY) * app.state.zoom.value,
        width: Math.max(
          2,
          ((bounds.width * element.width) / geometry.bounds.width) *
            app.state.zoom.value,
        ),
        height: Math.max(
          2,
          ((bounds.height * element.height) / geometry.bounds.height) *
            app.state.zoom.value,
        ),
        transform: `rotate(${element.angle}rad) scale(${model?.flipX ? -1 : 1},${model?.flipY ? -1 : 1})`,
        transformOrigin: "0 0",
      }}
    />
  );
};
