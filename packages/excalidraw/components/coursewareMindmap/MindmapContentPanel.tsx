import React, { useState } from "react";
import { Icon } from "@iconify/react";
import { IMAGE_MIME_TYPES } from "@excalidraw/common";

import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

import { fileOpen } from "../../data/filesystem";
import { MindmapDecorationPicker } from "./MindmapDecorationPicker";

export const MindmapContentPanel = ({
  controller,
  onClose,
}: {
  controller: CoursewareMindmapController;
  onClose?: () => void;
}) => {
  const [decorationOpen, setDecorationOpen] = useState(false);
  const node = controller.node;
  if (!node) return null;
  const addImage = async () => {
    const selection = controller.getSnapshot().selection;
    onClose?.();
    try {
      // Keep the file input outside the popover's lifetime, including its fallback.
      const file = await fileOpen({
        description: "节点图片",
        extensions: Object.keys(
          IMAGE_MIME_TYPES,
        ) as (keyof typeof IMAGE_MIME_TYPES)[],
      });
      const current = controller.getSnapshot().selection;
      if (
        selection?.elementId === current?.elementId &&
        selection?.nodeId === current?.nodeId
      ) {
        await controller.clipboard.addImage(file);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      controller.app.setState({ errorMessage: "图片无法读取，请重试" });
    }
  };
  if (decorationOpen) {
    return (
      <MindmapDecorationPicker
        node={node}
        patch={(patch) => controller.patch(patch)}
        onBack={() => setDecorationOpen(false)}
      />
    );
  }
  return (
    <div
      className="Courseware-mindmap-content-menu"
      role="menu"
      aria-label="添加内容"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose?.();
          controller.startEditing("summary");
        }}
      >
        <Icon icon="lucide:list-plus" />
        <span>添加描述</span>
        <kbd>Shift + Enter</kbd>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => setDecorationOpen(true)}
      >
        <Icon icon="lucide:smile-plus" />
        <span>添加图标或贴纸</span>
      </button>
      <button type="button" role="menuitem" onClick={() => void addImage()}>
        <Icon icon="lucide:image-plus" />
        <span>添加图片</span>
      </button>
    </div>
  );
};
