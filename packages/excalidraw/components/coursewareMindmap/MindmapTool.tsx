import React, { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { COURSEWARE_MINDMAP_TOOL } from "../../coursewareMindmap/config";
import { useExcalidrawContainer } from "../App";
import { Tooltip, hideTooltip } from "../Tooltip";
import { MindmapIcon, MindmapLayoutPicker } from "./MindmapLayoutPicker";
import type { AppClassProperties } from "../../types";
import "./mindmap.scss";

export const MindmapTool = ({
  app,
  onOpen,
}: {
  app: AppClassProperties;
  onOpen?: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const active = app.state.activeTool.customType === COURSEWARE_MINDMAP_TOOL;
  useEffect(() => app.onPointerDownEmitter.on(() => setOpen(false)), [app]);
  useEffect(() => {
    if (!active) {
      setOpen(false);
    }
  }, [active]);
  if (
    app.props.UIOptions.toolbarLayout !== "left" ||
    app.props.role === "member" ||
    app.props.UIOptions.tools?.rectangle === false
  ) {
    return null;
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          hideTooltip({ immediate: true });
          onOpen?.();
          app.setActiveTool({
            type: "custom",
            customType: COURSEWARE_MINDMAP_TOOL,
          });
        }
        setOpen(next);
      }}
    >
      <Tooltip label="思维导图" position="right">
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`ToolIcon Courseware-toolbar__group-trigger ${
              active ? "active" : ""
            }`}
            aria-label="思维导图"
            aria-pressed={active}
            data-testid="toolbar-mindmap"
          >
            <span className="ToolIcon__icon">
              <MindmapIcon />
            </span>
            <svg
              className="Courseware-toolbar__group-chevron"
              viewBox="0 0 8 8"
            >
              <path d="m3 2 2 2-2 2" fill="none" stroke="currentColor" />
            </svg>
          </button>
        </Popover.Trigger>
      </Tooltip>
      <MindmapToolContent app={app} onChoose={() => setOpen(false)} />
    </Popover.Root>
  );
};

/** Shared picker; the mobile menu anchors it outside its dismissing dropdown. */
export const MindmapToolContent = ({
  app,
  mobile = false,
  onChoose,
}: {
  app: AppClassProperties;
  mobile?: boolean;
  onChoose: () => void;
}) => {
  const { container } = useExcalidrawContainer();
  return (
    <Popover.Portal container={container ?? undefined}>
      <Popover.Content
        className="tool-popover-content Courseware-mindmap-popover"
        side={mobile ? "top" : "right"}
        sideOffset={10}
        collisionPadding={12}
        collisionBoundary={container ?? undefined}
        data-tooltip-obstacle
        aria-label="新建思维导图"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <MindmapLayoutPicker
          value={app.state.coursewareMindmap}
          onChange={(value) => {
            app.mindmap.setPreference(value);
            onChoose();
            app.setActiveTool({
              type: "custom",
              customType: COURSEWARE_MINDMAP_TOOL,
            });
          }}
        />
      </Popover.Content>
    </Popover.Portal>
  );
};
