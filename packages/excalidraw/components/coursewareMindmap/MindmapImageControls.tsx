import React, { useEffect, useRef } from "react";
import {
  resolveMindmapNodeContentGeometry,
  resolveMindmapNodeImageDropPlacement,
  resizeMindmapNodeImage,
} from "@excalidraw/mindmap";
import {
  coursewareMindmapSceneToLocal,
  getCoursewareMindmapGeometry,
  updateCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { patchMindmapNode } from "../../coursewareMindmap/operations";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

/** Node-local image manipulation; only pointerup commits to the scene/history. */
export const MindmapImageControls = ({
  controller,
  style,
}: {
  controller: CoursewareMindmapController;
  style: React.CSSProperties;
}) => {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  const { node, model, element } = controller;
  if (!node?.imageAssetId || !model || !element || !controller.editable)
    return null;
  const geometry = getCoursewareMindmapGeometry(element)!;
  const box = geometry.nodes[node.id];
  const content = resolveMindmapNodeContentGeometry(node, {
    isRoot: node.id === model.rootId,
    layoutScale: model.layoutScale,
    width: box.width,
    height: box.height,
  });
  if (!content.image) return null;
  const rect = content.image;
  const scaleX =
    (element.width / Math.max(1, geometry.bounds.width)) *
    controller.app.state.zoom.value;
  const scaleY =
    (element.height / Math.max(1, geometry.bounds.height)) *
    controller.app.state.zoom.value;
  const selected = controller.getSnapshot().selectedImage;
  const start = (event: React.PointerEvent, corner?: string) => {
    event.stopPropagation();
    event.preventDefault();
    controller.notify({ selectedImage: true });
    cleanup.current?.();
    const origin = coursewareMindmapSceneToLocal(
      element,
      viewportCoordsToSceneCoords(event, controller.app.state),
    );
    let next = model;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      if (
        !controller.getSnapshot().selection ||
        controller.element?.id !== element.id
      ) {
        finish(false);
        return;
      }
      if (
        !moved &&
        Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) < 3
      )
        return;
      moved = true;
      const point = coursewareMindmapSceneToLocal(
        element,
        viewportCoordsToSceneCoords(ev, controller.app.state),
      );
      if (corner) {
        const signX = corner.includes("w") ? -1 : 1;
        const signY = corner.includes("n") ? -1 : 1;
        const width = node.imageWidth ?? rect.width;
        const height = node.imageHeight ?? rect.height;
        const ratio = Math.max(
          0.1,
          Math.min(
            8,
            1 +
              (((point.x - origin.x) * signX) / width +
                ((point.y - origin.y) * signY) / height) /
                2,
          ),
        );
        next = resizeMindmapNodeImage(
          model,
          node.id,
          width * ratio,
          height * ratio,
        );
      } else {
        const placement = resolveMindmapNodeImageDropPlacement(
          { x: point.x - box.x, y: point.y - box.y },
          box,
          node.imagePlacement ?? "right",
        );
        next = patchMindmapNode(model, node.id, { imagePlacement: placement });
      }
      controller.notify({
        preview: updateCoursewareMindmapElement(element, next),
      });
    };
    const finish = (save: boolean) => {
      cleanup.current?.();
      if (
        save &&
        moved &&
        controller.element?.id === element.id &&
        controller.editable
      )
        controller.commit(next);
      controller.notify({ preview: null });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId === event.pointerId) finish(ev.type === "pointerup");
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        finish(false);
      }
    };
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", key, true);
      cleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", key, true);
  };
  return (
    <div className="Courseware-mindmap-image-plane" style={style}>
      <div
        className={`Courseware-mindmap-image ${selected ? "is-selected" : ""}`}
        style={{
          left: rect.x * scaleX,
          top: rect.y * scaleY,
          width: rect.width * scaleX,
          height: rect.height * scaleY,
        }}
      >
        <button
          type="button"
          className="Courseware-mindmap-image-target"
          aria-label="移动节点图片"
          onPointerDown={(event) => start(event)}
          onClick={() => controller.notify({ selectedImage: true })}
        />
        {selected &&
          ["nw", "ne", "sw", "se"].map((corner) => (
            <button
              key={corner}
              type="button"
              className={`Courseware-mindmap-image-handle ${corner}`}
              aria-label={`缩放节点图片 ${corner}`}
              onPointerDown={(event) => start(event, corner)}
            />
          ))}
      </div>
    </div>
  );
};
