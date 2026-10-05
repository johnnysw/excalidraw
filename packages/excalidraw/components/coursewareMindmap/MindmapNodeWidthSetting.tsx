import React, { useRef } from "react";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

export const MindmapNodeWidthSetting = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const focus = useRef<{
    mapId: string;
    nodeId: string;
    widthMode?: "auto" | "fixed";
    textMaxWidth?: number;
    value: number;
    dirty: boolean;
  } | null>(null);
  const { node, model } = controller;
  if (!node || !model) return null;
  const logicalWidth =
    (node.textMaxWidth ?? 320 * (model.layoutScale ?? 1)) /
    (model.layoutScale ?? 1);
  return (
    <label>
      文字宽度
      <input
        key={`${node.id}:${node.textMaxWidth}`}
        aria-label="节点文字宽度"
        type="number"
        min={24}
        step="any"
        defaultValue={logicalWidth}
        readOnly={!controller.editable}
        onFocus={() => {
          focus.current = {
            mapId: model.id,
            nodeId: node.id,
            widthMode: node.widthMode,
            textMaxWidth: node.textMaxWidth,
            value: logicalWidth,
            dirty: false,
          };
        }}
        onChange={() => {
          if (focus.current) focus.current.dirty = true;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (focus.current) {
              event.currentTarget.value = String(focus.current.value);
              focus.current.dirty = false;
            }
            event.currentTarget.blur();
          } else if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const previous = focus.current;
          focus.current = null;
          const width = Number(event.currentTarget.value);
          if (
            !previous?.dirty ||
            !Number.isFinite(width) ||
            width <= 0 ||
            Math.max(24, width) === previous.value
          )
            return;
          const latest = controller.host.readLatest()[previous.mapId];
          const target = latest?.nodes[previous.nodeId];
          if (
            !controller.editable ||
            latest?.locked ||
            !target ||
            controller.model?.id !== previous.mapId ||
            controller.node?.id !== previous.nodeId
          )
            return;
          if (
            target.widthMode !== previous.widthMode ||
            target.textMaxWidth !== previous.textMaxWidth
          ) {
            controller.app.setToast({
              message: "主题宽度已发生变化，本次调整已取消",
            });
            return;
          }
          controller.command({
            type: "patch",
            nodeIds: [previous.nodeId],
            patch: {
              widthMode: "fixed",
              textMaxWidth: Math.max(24, width) * (latest.layoutScale ?? 1),
            },
          });
        }}
      />
    </label>
  );
};
