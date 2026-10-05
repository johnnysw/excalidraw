import React, { useLayoutEffect, useRef } from "react";
import { resizeMindmapNodeImage } from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import {
  MindmapMenuItem,
  MindmapMenuList,
  MindmapMenuSeparator,
} from "./MindmapMenuItems";

const MindmapImageWidthInput = ({
  controller,
  nodeId,
  width,
}: {
  controller: CoursewareMindmapController;
  nodeId: string;
  width: number;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => {
      const { node, model } = controller;
      if (cancelled.current || !node || !model || node.id !== nodeId) return;
      const value = Number(input.value);
      if (!input.value.trim() || !Number.isFinite(value)) {
        input.value = String(node.imageWidth ?? width);
        return;
      }
      const nextWidth = Math.min(960, Math.max(24, value));
      input.value = String(nextWidth);
      const currentWidth = node.imageWidth ?? width;
      if (nextWidth !== currentWidth) {
        controller.commit(
          resizeMindmapNodeImage(
            model,
            node.id,
            nextWidth,
            (nextWidth * (node.imageHeight ?? 56)) / currentWidth,
          ),
        );
      }
    };
    const blurBeforeDismiss = (event: PointerEvent) => {
      if (document.activeElement === input && event.target !== input) {
        input.blur();
      }
    };
    const finishBeforeDismiss = (event: KeyboardEvent) => {
      if (
        event.target !== input ||
        (event.key !== "Enter" && event.key !== "Escape")
      ) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      if (event.key === "Escape") {
        cancelled.current = true;
        input.value = String(controller.node?.imageWidth ?? width);
      }
      input.blur();
    };
    // Commit before the canvas clears selection or an outside click unmounts us.
    document.addEventListener("pointerdown", blurBeforeDismiss, true);
    document.addEventListener("keydown", finishBeforeDismiss, true);
    input.addEventListener("blur", commit);
    return () => {
      document.removeEventListener("pointerdown", blurBeforeDismiss, true);
      document.removeEventListener("keydown", finishBeforeDismiss, true);
      input.removeEventListener("blur", commit);
      if (document.activeElement === input) commit();
    };
  }, [controller, nodeId, width]);
  return (
    <input
      ref={inputRef}
      type="number"
      aria-label="节点图片宽度"
      min={24}
      max={960}
      step="any"
      defaultValue={width}
      onFocus={() => {
        cancelled.current = false;
      }}
    />
  );
};

export const MindmapNodeSettings = ({
  controller,
  close,
}: {
  controller: CoursewareMindmapController;
  close: () => void;
}) => {
  const { node, model } = controller;
  if (!node || !model) return null;
  const patch = (value: Parameters<typeof controller.patch>[0]) => {
    close();
    controller.patch(value);
  };
  return (
    <MindmapMenuList label="节点设置">
      <MindmapMenuItem
        label="透明填充"
        icon="lucide:paint-bucket"
        run={() => patch({ fill: "transparent" })}
      />
      <MindmapMenuItem
        label="透明描边"
        icon="lucide:square-dashed"
        run={() => patch({ stroke: "transparent" })}
      />
      <MindmapMenuItem
        label="透明文字"
        icon="lucide:baseline"
        run={() => patch({ color: "transparent" })}
      />
      {node.summary && (
        <>
          <MindmapMenuSeparator />
          <MindmapMenuItem
            label="删除描述"
            icon="lucide:text-quote"
            run={() => patch({ summary: undefined })}
          />
        </>
      )}
      {node.imageAssetId && (
        <>
          <MindmapMenuSeparator />
          {(["top", "right", "bottom", "left"] as const).map(
            (placement, index) => (
              <MindmapMenuItem
                key={placement}
                label={`图片置于${["上方", "右侧", "下方", "左侧"][index]}`}
                icon={`lucide:arrow-${["up", "right", "down", "left"][index]}`}
                run={() => patch({ imagePlacement: placement })}
              />
            ),
          )}
          <label className="Courseware-mindmap-menu-field">
            图片宽度
            <MindmapImageWidthInput
              key={`${node.id}:${node.imageWidth}`}
              controller={controller}
              nodeId={node.id}
              width={node.imageWidth ?? 96}
            />
          </label>
          <MindmapMenuItem
            label="删除图片"
            icon="lucide:image-off"
            run={() => {
              patch({
                imageAssetId: undefined,
                imageWidth: undefined,
                imageHeight: undefined,
                imagePlacement: undefined,
              });
              controller.notify({ selectedImage: false });
            }}
          />
        </>
      )}
    </MindmapMenuList>
  );
};
