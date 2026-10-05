import React, { useEffect, useRef } from "react";
import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import { coursewareMindmapSceneToLocal } from "@excalidraw/element/coursewareMindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { Tooltip } from "../Tooltip";

/** Width gestures are drafts; cancelling never reaches autosave or document history. */
export const MindmapWidthControls = ({
  controller,
  style,
}: {
  controller: CoursewareMindmapController;
  style: React.CSSProperties;
}) => {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  if (!controller.editable || controller.getSnapshot().editing) return null;
  const start = (event: React.PointerEvent, side: -1 | 1) => {
    const { node, model, element } = controller;
    if (!node || !model || !element) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const selection = controller.getSnapshot().selection;
    const origin = coursewareMindmapSceneToLocal(
      element,
      viewportCoordsToSceneCoords(event, controller.app.state),
    );
    const width =
      node.textMaxWidth ??
      Math.max(
        24 * (model.layoutScale ?? 1),
        (node.width ?? 120) - 32 * (model.layoutScale ?? 1),
      );
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      if (
        selection !== controller.getSnapshot().selection ||
        !controller.editable
      ) {
        finish(false);
        return;
      }
      const point = coursewareMindmapSceneToLocal(
        element,
        viewportCoordsToSceneCoords(ev, controller.app.state),
      );
      moved =
        moved ||
        Math.abs(ev.clientX - event.clientX) +
          Math.abs(ev.clientY - event.clientY) >
          3;
      if (moved)
        controller.previewPatch({
          widthMode: "fixed",
          textMaxWidth: Math.max(
            24 * (model.layoutScale ?? 1),
            width + (point.x - origin.x) * side,
          ),
        });
    };
    const finish = (save: boolean) => {
      cleanup.current?.();
      if (
        save &&
        moved &&
        selection === controller.getSnapshot().selection &&
        controller.editable
      )
        controller.commitPreviewPatch();
      else controller.previewPatch(null);
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
    const blur = () => finish(false);
    cleanup.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
      cleanup.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
  };
  return (
    <div className="Courseware-mindmap-width-controls" style={style}>
      {([-1, 1] as const).map((side) => (
        <Tooltip key={side} label="调整文字宽度" position="top">
          <button
            type="button"
            className={side === -1 ? "is-left" : "is-right"}
            aria-label={side === -1 ? "调整文字左侧宽度" : "调整文字右侧宽度"}
            onPointerDown={(event) => start(event, side)}
          />
        </Tooltip>
      ))}
    </div>
  );
};
