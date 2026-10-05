import React, { useState, useLayoutEffect, useEffect, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Icon } from "@iconify/react";
import {
  resolveMindmapNodeVisualStyle,
  resolveMindmapToolbarLogicalValue,
  formatMindmapToolbarValue,
  parseMindmapToolbarFontSizeInput,
  scaleMindmapToolbarValue,
} from "@excalidraw/mindmap";
import { getCoursewareMindmapGeometry } from "@excalidraw/element/coursewareMindmap";
import { Tooltip, hideTooltip } from "../Tooltip";
import { useExcalidrawContainer } from "../App";
import { MindmapLayoutPicker } from "./MindmapLayoutPicker";
import { MindmapStylePanel } from "./MindmapStylePanel";
import { getMindmapPreference } from "../../coursewareMindmap/operations";
import { MindmapOperationsMenu } from "./MindmapOperationsMenu";
import {
  MINDMAP_TOOLBAR_ICONS,
  mindmapLayoutToolbarIcon,
} from "./toolbarIcons";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

const FONT_SIZES = [12, 14, 18, 24, 36, 48, 72, 96];

const FontSizeInput = ({
  value,
  commit,
  beforeBlur,
}: {
  value: number;
  beforeBlur: (event: PointerEvent) => void;
  commit: (value: number) => void;
}) => {
  const [draft, setDraft] = useState(formatMindmapToolbarValue(value));
  const skipBlur = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const blurBeforeSelection = (event: PointerEvent) => {
      const input = inputRef.current;
      if (input && document.activeElement === input && event.target !== input) {
        beforeBlur(event);
        input.blur();
      }
    };
    document.addEventListener("pointerdown", blurBeforeSelection, true);
    return () =>
      document.removeEventListener("pointerdown", blurBeforeSelection, true);
  }, []);
  const save = () => {
    const next = parseMindmapToolbarFontSizeInput(draft, value);
    setDraft(formatMindmapToolbarValue(next));
    if (next !== value) commit(next);
  };
  return (
    <input
      ref={inputRef}
      aria-label="节点字号"
      inputMode="numeric"
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (!skipBlur.current) save();
        skipBlur.current = false;
      }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          skipBlur.current = true;
          if (event.key === "Enter") save();
          else setDraft(formatMindmapToolbarValue(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
};

export const MindmapNodeToolbar = ({
  controller,
  anchor,
}: {
  controller: CoursewareMindmapController;
  anchor: React.CSSProperties;
}) => {
  const { container } = useExcalidrawContainer();
  const toolbar = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    style: React.CSSProperties;
    side: "top" | "bottom";
  }>({
    style: { left: 12, top: 12 },
    side: "top",
  });
  const [menu, setMenu] = useState<string | null>(null);
  const menuRef = useRef(menu);
  const setOpenMenu = (key: string | null) => {
    hideTooltip({ immediate: true });
    controller.commitPreviewPatch();
    menuRef.current = key;
    setMenu(key);
  };
  useLayoutEffect(() => {
    const update = () => {
      const rect = toolbar.current?.getBoundingClientRect();
      if (!rect) return;
      const { width, height } = controller.app.state;
      const x = Number(anchor.left) || 0;
      const y = Number(anchor.top) || 0;
      const nodeWidth = Number(anchor.width) || 0;
      const nodeHeight = Number(anchor.height) || 0;
      const above = y >= rect.height + 24;
      setPosition({
        side: above ? "top" : "bottom",
        style: {
          left: Math.max(
            12,
            Math.min(
              width - rect.width - 12,
              x + nodeWidth / 2 - rect.width / 2,
            ),
          ),
          top: Math.max(
            12,
            Math.min(
              height - rect.height - 12,
              above ? y - rect.height - 12 : y + nodeHeight + 12,
            ),
          ),
        },
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (toolbar.current) observer.observe(toolbar.current);
    return () => observer.disconnect();
  }, [
    anchor.left,
    anchor.top,
    anchor.width,
    anchor.height,
    controller.app.state.width,
    controller.app.state.height,
    controller,
  ]);
  const { node, model, element } = controller;
  if (!node || !model || !element || !controller.editable) return null;
  const style = resolveMindmapNodeVisualStyle(
    node,
    getCoursewareMindmapGeometry(element)?.nodes[node.id]?.depth ?? 0,
    model,
  );
  const preference = getMindmapPreference(model);
  const fontSize = resolveMindmapToolbarLogicalValue(
    style.fontSize,
    model.layoutScale,
    14,
  );
  const popover = (
    key: string,
    label: string,
    icon: React.ReactNode,
    content: React.ReactNode,
    options: { chevron?: boolean; active?: boolean; className?: string } = {},
  ) => (
    <Popover.Root
      key={key}
      open={menu === key}
      onOpenChange={(open) => {
        if (open) setOpenMenu(key);
        else if (menuRef.current === key) setOpenMenu(null);
      }}
    >
      <Tooltip label={label} position="top" suppress={menu === key}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className={`${options.className ?? ""} ${
              options.active ? "is-active" : ""
            }`}
          >
            {icon}
            {options.chevron !== false && (
              <Icon
                icon="lucide:chevron-down"
                className="Courseware-mindmap-chevron"
              />
            )}
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          className={`tool-popover-content Courseware-mindmap-popover is-${key}`}
          side={position.side}
          sideOffset={8}
          collisionBoundary={container ?? undefined}
          collisionPadding={12}
          data-tooltip-obstacle
          aria-label={label}
          onEscapeKeyDown={() => controller.previewPatch(null)}
          onCloseAutoFocus={(event) => {
            if (
              menuRef.current ||
              controller.getSnapshot().editing ||
              !controller.getSnapshot().selection
            )
              event.preventDefault();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
  return (
    <div
      ref={toolbar}
      className="Courseware-mindmap-toolbar"
      style={position.style}
      role="toolbar"
      aria-label="脑图节点工具"
      aria-orientation="horizontal"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {node.id === model.rootId &&
        popover(
          "layout",
          "脑图布局",
          <Icon
            icon={mindmapLayoutToolbarIcon(preference)}
            style={
              preference.family === "mindmap" && preference.direction === "left"
                ? { transform: "scaleX(-1)" }
                : undefined
            }
          />,
          <MindmapLayoutPicker
            value={preference}
            onChange={(value) => controller.setLayout(value)}
            onPreview={(value) =>
              value
                ? controller.setLayout(value, true)
                : controller.notify({ preview: null })
            }
          />,
        )}
      {popover(
        "shape",
        "节点形状",
        <Icon icon={MINDMAP_TOOLBAR_ICONS.shape} />,
        <MindmapStylePanel controller={controller} section="shape" />,
      )}
      {node.id === model.rootId &&
        popover(
          "fill",
          "节点填充颜色",
          <span
            className="Courseware-mindmap-color-dot"
            style={{ background: style.fill }}
          />,
          <MindmapStylePanel controller={controller} section="fill" />,
        )}
      {popover(
        "stroke",
        "节点描边",
        <span
          className="Courseware-mindmap-color-ring"
          style={{ borderColor: style.stroke }}
        />,
        <MindmapStylePanel controller={controller} section="stroke" />,
      )}
      {popover(
        "color",
        "节点文字颜色",
        <span className="Courseware-mindmap-text-color-icon">
          <Icon icon="lucide:baseline" />
          <span style={{ background: style.color }} />
        </span>,
        <MindmapStylePanel controller={controller} section="color" />,
        { className: "Courseware-mindmap-text-color-trigger" },
      )}
      <span className="Courseware-mindmap-font-size">
        <FontSizeInput
          key={`${node.id}:${fontSize}`}
          value={fontSize}
          beforeBlur={(event) => controller.rememberPointerNode(event)}
          commit={(value) =>
            controller.patch({
              fontSize: scaleMindmapToolbarValue(value, model.layoutScale),
            })
          }
        />
        {popover(
          "font-size",
          "选择节点字号",
          <Icon
            icon="lucide:chevron-down"
            className="Courseware-mindmap-chevron"
          />,
          <div
            className="Courseware-mindmap-font-presets"
            role="listbox"
            aria-label="节点字号"
          >
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="option"
                aria-label={`字号 ${size}`}
                aria-selected={fontSize === size}
                onClick={() => {
                  controller.patch({
                    fontSize: scaleMindmapToolbarValue(size, model.layoutScale),
                  });
                  setOpenMenu(null);
                }}
              >
                {size}
              </button>
            ))}
          </div>,
          { chevron: false, className: "Courseware-mindmap-font-trigger" },
        )}
      </span>
      {popover(
        "format",
        "文字格式",
        <Icon icon={MINDMAP_TOOLBAR_ICONS.textFormat} />,
        <MindmapStylePanel controller={controller} section="format" />,
      )}
      {popover(
        "content",
        "添加内容",
        <Icon icon={MINDMAP_TOOLBAR_ICONS.mindmapAddContent} />,
        <MindmapStylePanel
          controller={controller}
          section="content"
          onClose={() => setOpenMenu(null)}
        />,
        {
          active: !!(
            node.summary ||
            node.icon ||
            node.sticker ||
            node.imageAssetId
          ),
        },
      )}
      <span className="Courseware-mindmap-divider" />
      {popover(
        "actions",
        "更多对象操作",
        <Icon icon={MINDMAP_TOOLBAR_ICONS.connectorMore} />,
        <MindmapOperationsMenu
          controller={controller}
          close={() => setOpenMenu(null)}
        />,
        { chevron: false, className: "Courseware-mindmap-more-trigger" },
      )}
    </div>
  );
};
