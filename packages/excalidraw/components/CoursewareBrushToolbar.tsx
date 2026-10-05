import React, { useEffect, useRef, useState } from "react";

import {
  COURSEWARE_BRUSH_MAX_WIDTH,
  COURSEWARE_BRUSH_MIN_WIDTH,
  updateCoursewareBrush,
} from "../coursewareBrush";
import { t } from "../i18n";

import { useEditorInterface, useExcalidrawContainer } from "./App";
import { CoursewareBrushToolIcon } from "./CoursewareBrushToolIcon";
import { CoursewareBrushStyleMenu } from "./CoursewareBrushStyleMenu";
import { CoursewareBrushColorPicker } from "./CoursewareBrushColorPicker";
import { useCoursewareBrushPosition } from "./useCoursewareBrushPosition";
import { Tooltip } from "./Tooltip";
import { CloseIcon } from "./icons";

import "./CoursewareBrushToolbar.scss";

import type {
  CoursewareBrushMode,
  CoursewareBrushSettings,
} from "../coursewareBrush";
import type {
  AppClassProperties,
  AppProps,
  AppState,
  UIAppState,
} from "../types";

interface CoursewareBrushToolbarProps {
  app: AppClassProperties;
  appState: UIAppState;
  setAppState: React.Component<unknown, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
}

export const CoursewareBrushToolbar = ({
  app,
  appState,
  setAppState,
  UIOptions,
}: CoursewareBrushToolbarProps) => {
  const { container } = useExcalidrawContainer();
  const editorInterface = useEditorInterface();
  const [menu, setMenu] = useState<"width" | "color" | null>(null);
  const menuRef = useRef(menu);
  const lastMenuRef = useRef<"width" | "color" | null>(null);
  menuRef.current = menu;
  const { coursewareBrush: brush } = appState;
  const tool =
    appState.activeTool.type === "hand"
      ? appState.activeTool.lastActiveTool?.type
      : appState.activeTool.type;
  const erasing = tool === "eraser";
  const active = brush[brush.mode];
  const widthLabel = Number(active.strokeWidth.toFixed(3));
  const visible =
    UIOptions.toolbarLayout === "left" &&
    editorInterface.formFactor !== "phone" &&
    !appState.presentationMode &&
    !appState.viewModeEnabled &&
    (tool === "freedraw" || tool === "eraser");
  const { ref, bottom } = useCoursewareBrushPosition(
    container,
    visible,
    appState.zenModeEnabled
  );

  useEffect(() => {
    setMenu(null);
  }, [tool]);

  if (!visible) {
    return null;
  }

  const activateBrush = (mode: CoursewareBrushMode) => {
    setMenu(null);
    setAppState((state) => ({
      coursewareBrush: { ...state.coursewareBrush, mode },
    }));
    app.setActiveTool({ type: "freedraw" });
  };
  const updateBrush = (patch: Partial<CoursewareBrushSettings>) => {
    setAppState((state) => ({
      coursewareBrush: updateCoursewareBrush(state.coursewareBrush, patch),
    }));
  };
  const renderTool = (
    mode: CoursewareBrushMode | "eraser",
    label: string,
    shortcut?: string
  ) => {
    const selected =
      mode === "eraser" ? erasing : !erasing && brush.mode === mode;
    return (
      <Tooltip
        key={mode}
        label={shortcut ? `${label} — ${shortcut}` : label}
        position="top"
      >
        <button
          type="button"
          className="Courseware-brush-button Courseware-brush-mode"
          aria-label={label}
          aria-keyshortcuts={shortcut}
          aria-pressed={selected}
          data-testid={`courseware-brush-${mode}`}
          onClick={() => {
            if (mode === "eraser") {
              setMenu(null);
              setAppState({ preferredEraserMode: "path" });
              app.setActiveTool({ type: "eraser" });
            } else {
              activateBrush(mode);
            }
          }}
        >
          <span className="Courseware-brush-illustration">
            <CoursewareBrushToolIcon
              mode={mode}
              color={mode === "eraser" ? "#e9a29e" : brush[mode].color}
            />
          </span>
        </button>
      </Tooltip>
    );
  };
  const renderStyleMenu = (
    name: "width" | "color",
    label: string,
    icon: React.ReactNode,
    children: React.ReactNode
  ) => (
    <CoursewareBrushStyleMenu
      key={name}
      name={name}
      label={label}
      icon={icon}
      disabled={erasing}
      open={menu === name}
      onOpenChange={(open) => {
        if (open) {
          lastMenuRef.current = name;
        }
        menuRef.current = open ? name : null;
        setMenu(open ? name : null);
      }}
      shouldRestoreFocus={() => menuRef.current === null && lastMenuRef.current === name}
      container={container}
    >
      {children}
    </CoursewareBrushStyleMenu>
  );

  return (
    <div
      ref={ref}
      className="Courseware-brush-toolbar"
      style={{ bottom }}
      role="toolbar"
      aria-label="画笔工具"
      aria-orientation="horizontal"
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !menu) {
          event.stopPropagation();
          app.setActiveTool({ type: "selection" });
        }
      }}
    >
      {UIOptions.tools?.freedraw !== false && (
        <>
          {renderTool("pen", "普通画笔", "P")}
          {renderTool("highlighter", "荧光笔", "Shift+P")}
        </>
      )}
      {UIOptions.tools?.eraser !== false &&
        renderTool("eraser", "整笔橡皮擦", "E")}
      <span className="Courseware-brush-divider" aria-hidden="true" />
      {renderStyleMenu(
        "width",
        `画笔粗细 ${widthLabel}`,
        <svg
          className="Courseware-brush-width-icon"
          viewBox="0 0 19 18"
          aria-hidden="true"
        >
          <rect
            x="1.5"
            y="11.75"
            width="16"
            height="3.5"
            rx=".5"
            fill="currentColor"
          />
          <rect
            x="1.5"
            y="6.75"
            width="16"
            height="2.5"
            rx=".5"
            fill="currentColor"
          />
          <rect
            x="1.5"
            y="2.75"
            width="16"
            height="1.5"
            rx=".5"
            fill="currentColor"
          />
        </svg>,
        <>
          <div className="Courseware-brush-width-row">
            <span>{t("labels.strokeWidth")}</span>
            <output>{widthLabel}</output>
          </div>
          <input
            type="range"
            min={COURSEWARE_BRUSH_MIN_WIDTH}
            max={COURSEWARE_BRUSH_MAX_WIDTH}
            step="any"
            value={active.strokeWidth}
            aria-label="画笔粗细"
            onChange={(event) =>
              updateBrush({
                strokeWidth: Number(event.currentTarget.value),
              })
            }
          />
        </>
      )}
      {renderStyleMenu(
        "color",
        "画笔颜色",
        <span
          className="Courseware-brush-color-preview"
          style={{ backgroundColor: active.color }}
        />,
        <CoursewareBrushColorPicker
          color={active.color}
          onChange={(color, close) => {
            updateBrush({ color });
            if (close) {
              setMenu(null);
            }
          }}
        />
      )}
      <Tooltip label="关闭画笔 — Esc" position="top">
        <button
          type="button"
          className="Courseware-brush-button"
          aria-label="关闭画笔"
          aria-keyshortcuts="Escape"
          data-testid="courseware-brush-close"
          onClick={() => app.setActiveTool({ type: "selection" })}
        >
          {CloseIcon}
        </button>
      </Tooltip>
    </div>
  );
};
