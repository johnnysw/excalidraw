import clsx from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

import { capitalizeString, KEYS } from "@excalidraw/common";

import { trackEvent } from "../analytics";
import { t } from "../i18n";
import { useTunnels } from "../context/tunnels";
import {
  COURSEWARE_SHAPE_PRESETS,
  getCoursewareShapePreset,
} from "../coursewareShapes";
import { COURSEWARE_WHITEBOARD_SHAPE_KINDS } from "../coursewareShapePaths";
import {
  COURSEWARE_EMOJI_CUSTOM_TYPE,
  COURSEWARE_DEFAULT_EMOJI,
  COURSEWARE_STICKY_COLORS,
  COURSEWARE_STICKY_CUSTOM_TYPE,
  getCoursewareInsertTool,
} from "../coursewareInsertTools";

import { MindmapTool } from "./coursewareMindmap/MindmapTool";
import { useExcalidrawContainer } from "./App";
import { LockButton } from "./LockButton";
import { PenModeButton } from "./PenModeButton";
import { ToolButton } from "./ToolButton";
import { CoursewareShapeIcon } from "./CoursewareShapeIcon";
import { Tooltip, hideTooltip, showTooltip } from "./Tooltip";
import { getToolNumericKey, SHAPES } from "./shapes";
import {
  EraserIcon,
  frameToolIcon,
  laserPointerToolIcon,
  LassoIcon,
  RectangleIcon,
} from "./icons";

import type {
  AppClassProperties,
  AppProps,
  AppState,
  ToolType,
  UIAppState,
} from "../types";
import type { TranslationKeys } from "../i18n";

interface CoursewareToolbarProps {
  app: AppClassProperties;
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
  onLockToggle: () => void;
  onPenModeToggle: AppClassProperties["togglePenMode"];
  renderToolbarStart?: () => React.ReactNode;
  renderEmojiPicker?: AppProps["renderEmojiPicker"];
}

type GroupId = "selection" | "writing" | "eraser" | "text" | "shape" | "line";
type OpenGroup = GroupId | null;

type ToolbarOption = {
  id: string;
  tool: ToolType | "custom";
  customType?: string;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  keyBindingLabel?: string;
  fillable?: boolean;
};

const GROUP_TOOLS: Record<GroupId, readonly ToolType[]> = {
  selection: ["selection", "lasso"],
  writing: ["freedraw", "laser"],
  eraser: ["eraser"],
  text: ["text", "richText"],
  shape: ["rectangle", "diamond", "ellipse"],
  line: ["arrow", "line"],
};

const getToolOption = (tool: ToolType): ToolbarOption => {
  if (tool === "lasso") {
    const numericKey = getToolNumericKey(tool, "left");
    return {
      id: tool,
      tool,
      icon: LassoIcon,
      label: t("toolBar.lasso"),
      fillable: true,
      shortcut: numericKey ? `V ${t("helpDialog.or")} ${numericKey}` : "V",
      keyBindingLabel: numericKey || "V",
    };
  }
  const definition = SHAPES.find((shape) => shape.value === tool);
  const extra = {
    frame: { icon: frameToolIcon, key: KEYS.F, numericKey: null },
    laser: { icon: laserPointerToolIcon, key: KEYS.K, numericKey: null },
  }[tool as "frame" | "laser"];
  const letterKey = definition?.key ?? extra?.key;
  const numericKey = getToolNumericKey(tool, "left");
  const letter = letterKey
    ? capitalizeString(typeof letterKey === "string" ? letterKey : letterKey[0])
    : undefined;
  const shortcut =
    letter && numericKey
      ? `${letter} ${t("helpDialog.or")} ${numericKey}`
      : letter || numericKey || undefined;

  return {
    id: tool,
    tool,
    icon: definition?.icon ?? extra?.icon,
    label: capitalizeString(t(`toolBar.${tool}` as TranslationKeys)),
    shortcut,
    keyBindingLabel: numericKey || letter,
    fillable: definition?.fillable ?? tool === "selection",
  };
};

/** Shared courseware tools, with only their presentation grouped vertically. */
export const CoursewareToolbar = ({
  app,
  appState,
  setAppState,
  UIOptions,
  onLockToggle,
  onPenModeToggle,
  renderToolbarStart,
  renderEmojiPicker,
}: CoursewareToolbarProps) => {
  const { container } = useExcalidrawContainer();
  const { MainMenuTunnel } = useTunnels();
  const [openGroup, setOpenGroup] = useState<OpenGroup>(null);
  const [openInsertTool, setOpenInsertTool] = useState<
    "emoji" | "sticky" | null
  >(null);
  const openGroupRef = useRef(openGroup);
  const activatingOptionRef = useRef<string | null>(null);
  const [hasEmojiSelection, setHasEmojiSelection] = useState(
    appState.coursewareEmoji !== COURSEWARE_DEFAULT_EMOJI,
  );
  openGroupRef.current = openGroup;
  const triggersRef = useRef<Partial<Record<GroupId, HTMLButtonElement>>>({});
  const triggerCallbacksRef = useRef<Partial<Record<GroupId, (element: HTMLButtonElement | null) => void>>>({});
  const getTriggerRef = (group: GroupId) => triggerCallbacksRef.current[group] ??
    (triggerCallbacksRef.current[group] = (element) => {
      if (element) {
        triggersRef.current[group] = element;
      } else {
        const owner = triggersRef.current[group];
        if (owner) { hideTooltip({ immediate: true, owner }); }
        delete triggersRef.current[group];
      }
    });
  const toolsRef = useRef<HTMLDivElement>(null);
  const openedScrollTopRef = useRef<number | null>(null);
  const changeOpenGroup = useCallback((group: OpenGroup) => {
    if (group !== null) {
      setOpenInsertTool(null);
      hideTooltip({ immediate: true });
    }
    openedScrollTopRef.current =
      group === null ? null : toolsRef.current?.scrollTop ?? 0;
    openGroupRef.current = group;
    setOpenGroup(group);
  }, []);
  const [lastTools, setLastTools] = useState<Record<GroupId, string>>({
    selection: appState.preferredSelectionTool.type,
    writing: "freedraw",
    eraser: appState.preferredEraserMode,
    text: "text",
    shape: "rounded-rectangle",
    line: "arrow",
  });
  const activeTool = appState.activeTool.type;
  const activePreset = getCoursewareShapePreset(appState.activeTool);
  const activeInsertTool = getCoursewareInsertTool(appState.activeTool);
  const activeOptionId = activePreset?.id ?? activeInsertTool ?? activeTool;
  const tools = UIOptions.tools;
  const isToolEnabled = (tool: ToolType | "custom") =>
    tools?.[tool === "custom" ? "line" : tool] !== false;
  const toolbarStart = renderToolbarStart?.();
  useEffect(() => {
    const group = activePreset ? "shape" : (Object.keys(GROUP_TOOLS) as GroupId[]).find((key) =>
      GROUP_TOOLS[key].includes(activeTool as ToolType),
    );
    if (group && group !== "eraser") {
      setLastTools((previous) =>
        previous[group] === activeOptionId
          ? previous
          : { ...previous, [group]: activeOptionId },
      );
    }
    // Restoring a tool on opening must not dismiss its new palette.
    // Shortcuts and other imperative changes still close stale menus.
    const openingOption = activatingOptionRef.current === activeOptionId;
    activatingOptionRef.current = null;
    if (!openingOption) {
      changeOpenGroup(null);
      setOpenInsertTool(null);
    }
  }, [activeTool, activeOptionId, activePreset, activeInsertTool, changeOpenGroup]);

  useEffect(() => {
    if (appState.coursewareEmoji !== COURSEWARE_DEFAULT_EMOJI) {
      setHasEmojiSelection(true);
    }
  }, [appState.coursewareEmoji]);

  useEffect(() => {
    return app.onPointerDownEmitter.on(() => {
      changeOpenGroup(null);
      setOpenInsertTool(null);
    });
  }, [app, changeOpenGroup]);

  useEffect(() => {
    if (appState.openMenu || appState.openPopup) {
      hideTooltip({ immediate: true });
      changeOpenGroup(null);
      setOpenInsertTool(null);
      if (appState.openMenu === "canvas") {
        openedScrollTopRef.current = toolsRef.current?.scrollTop ?? 0;
      }
    }
  }, [appState.openMenu, appState.openPopup, changeOpenGroup]);


  const detectPen = (pointerType: string | null) => {
    if (!app.state.penDetected && pointerType === "pen") {
      app.togglePenMode(true);
    }
  };

  const activateOption = (
    option: ToolbarOption,
    group?: GroupId,
    keepMenuOpen = false,
  ) => {
    const optionKey = option.customType ? option.id : option.tool;
    if (keepMenuOpen && activeOptionId !== optionKey) {
      activatingOptionRef.current = optionKey;
    }
    if (appState.activeTool.type !== option.tool) {
      trackEvent("toolbar", option.tool, "ui");
    }
    // setActiveTool owns all cursor, selection, image and ink initialization.
    if (option.tool === "custom" && option.customType) {
      app.setActiveTool({ type: "custom", customType: option.customType });
    } else if (option.tool !== "custom") {
      app.setActiveTool({ type: option.tool });
    }
    if (group === "eraser") {
      setAppState({ preferredEraserMode: option.id as "path" | "box" });
    }
    if (group === "selection") {
      setAppState({
        preferredSelectionTool: {
          type: option.tool as "selection" | "lasso",
          initialized: true,
        },
      });
    }
    if (group) {
      setLastTools((previous) => ({ ...previous, [group]: option.id }));
    }
    if (!keepMenuOpen) {
      changeOpenGroup(null);
    }
  };

  const activateInsertTool = (
    customType:
      | typeof COURSEWARE_STICKY_CUSTOM_TYPE
      | typeof COURSEWARE_EMOJI_CUSTOM_TYPE,
    keepMenuOpen = false,
  ) =>
    activateOption(
      { id: customType, tool: "custom", customType, icon: null, label: customType },
      undefined,
      keepMenuOpen,
    );

  const renderOption = (option: ToolbarOption, group?: GroupId) => {
    const active =
      (option.customType ? activeOptionId === option.id : activeTool === option.tool) &&
      (group !== "eraser" || appState.preferredEraserMode === option.id);
    const title = option.shortcut
      ? `${option.label} — ${option.shortcut}`
      : option.label;
    return (
      <Tooltip key={option.id} label={title} position="top">
        <button
          type="button"
          className={clsx("ToolIcon Courseware-toolbar__option", {
            active,
            fillable: option.fillable,
          })}
          aria-label={option.label}
          aria-pressed={active}
          aria-keyshortcuts={option.shortcut}
          data-tool={option.tool}
          data-testid={`toolbar-${group === "eraser" ? "eraser-" : ""}${
            option.id
          }`}
          onPointerDown={(event) => detectPen(event.pointerType)}
          onClick={() => activateOption(option, group)}
        >
          <span className="ToolIcon__icon">
            {option.icon}
            {option.keyBindingLabel && (
              <span className="ToolIcon__keybinding">
                {option.keyBindingLabel}
              </span>
            )}
          </span>
        </button>
      </Tooltip>
    );
  };

  const renderGroup = (
    group: GroupId,
    label: string,
    availableOptions: ToolbarOption[],
  ) => {
    const options = availableOptions.filter((option) =>
      isToolEnabled(option.tool),
    );
    if (!options.length) {
      return null;
    }
    const active = options.some((option) =>
      option.customType ? option.id === activeOptionId : option.tool === activeTool,
    );
    const displayed =
      options.find(
        (option) =>
          (option.customType ? option.id === activeOptionId : option.tool === activeTool) &&
          (group !== "eraser" || option.id === appState.preferredEraserMode),
      ) ||
      options.find(
        (option) =>
          option.id ===
          (group === "eraser"
            ? appState.preferredEraserMode
            : lastTools[group]),
      ) ||
      options[0];

    const title = `${label} · ${displayed.label}${
      displayed.shortcut ? ` — ${displayed.shortcut}` : ""
    }`;
    return (
      <Popover.Root
        key={group}
        open={openGroup === group}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openMenu: null, openPopup: null });
            activateOption(displayed, group, true);
          }
          changeOpenGroup(open ? group : null);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={clsx("ToolIcon Courseware-toolbar__group-trigger", {
              active,
              fillable: displayed.fillable,
            })}
            aria-label={label}
            aria-pressed={active}
            aria-keyshortcuts={displayed.shortcut}
            data-testid={`toolbar-group-${group}`}
            data-active-tool={displayed.id}
            ref={getTriggerRef(group)}
            onPointerEnter={(event) =>
              showTooltip(event.currentTarget, title, false, "right")
            }
            onPointerLeave={(event) => hideTooltip({ owner: event.currentTarget })}
            onPointerDownCapture={() => hideTooltip({ immediate: true })}
            onKeyDownCapture={(event) => {
              if (event.key === "Escape") { hideTooltip({ owner: event.currentTarget }); }
            }}
          >
            <span className="ToolIcon__icon">{displayed.icon}</span>
            <svg
              className="Courseware-toolbar__group-chevron"
              viewBox="0 0 8 8"
              aria-hidden="true"
            >
              <path d="m3 2 2 2-2 2" fill="none" stroke="currentColor" />
            </svg>
          </button>
        </Popover.Trigger>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Content
            className={clsx("tool-popover-content Courseware-toolbar__popover", {
              "Courseware-toolbar__popover--shapes": group === "shape",
            })}
            data-tooltip-obstacle
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={{ top: 72, bottom: 72, left: 8, right: 8 }}
            collisionBoundary={container ?? undefined}
            aria-label={label}
            onEscapeKeyDown={(event) => {
              hideTooltip({ immediate: true });
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
              }
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const columns = group === "shape"
                  ? Math.max(1, getComputedStyle(event.currentTarget).gridTemplateColumns.split(" ").length)
                  : 1;
                const delta = event.key === "ArrowUp" ? -columns :
                  event.key === "ArrowDown" ? columns : event.key === "ArrowLeft" ? -1 : 1;
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
                  (index + delta + buttons.length) % buttons.length;
                event.preventDefault();
                event.stopPropagation();
                buttons[nextIndex]?.focus();
              }
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // Closing one group must not steal focus from a newly opened one.
              if (openGroupRef.current === null && !app.state.openMenu && !app.state.openPopup) {
                triggersRef.current[group]?.focus({ preventScroll: true });
              }
            }}
          >
            {options.map((option) => renderOption(option, group))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  };

  const renderTool = (tool: ToolType) => {
    if (!isToolEnabled(tool)) {
      return null;
    }
    const option = getToolOption(tool);
    const title = option.shortcut
      ? `${option.label} — ${option.shortcut}`
      : option.label;
    return (
      <Tooltip label={title} position="right">
        <ToolButton
          className="Shape"
          type="radio"
          icon={option.icon}
          checked={activeTool === tool}
          name="editor-current-shape"
          keyBindingLabel={option.keyBindingLabel}
          aria-label={option.label}
          aria-keyshortcuts={option.shortcut}
          data-testid={`toolbar-${tool}`}
          onPointerDown={({ pointerType }) => detectPen(pointerType)}
          onChange={() => activateOption(option)}
        />
      </Tooltip>
    );
  };

  const renderStickyTool = () => {
    if (!isToolEnabled("rectangle") || !isToolEnabled("text")) {
      return null;
    }
    const active = activeInsertTool === COURSEWARE_STICKY_CUSTOM_TYPE;
    return (
      <Popover.Root
        open={openInsertTool === "sticky"}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openMenu: null, openPopup: null });
            changeOpenGroup(null);
            hideTooltip({ immediate: true });
            openedScrollTopRef.current = toolsRef.current?.scrollTop ?? 0;
            activateInsertTool(COURSEWARE_STICKY_CUSTOM_TYPE, true);
          }
          setOpenInsertTool(open ? "sticky" : null);
        }}
      >
        <Tooltip label="便签 — N" position="right">
          <Popover.Trigger asChild>
            <button
              type="button"
              className={clsx("ToolIcon Courseware-toolbar__group-trigger", { active })}
              aria-label="便签"
              aria-keyshortcuts="N"
              aria-pressed={active}
              aria-expanded={openInsertTool === "sticky"}
              data-testid="toolbar-sticky"
              onPointerDown={() => hideTooltip({ immediate: true })}
            >
              <span className="ToolIcon__icon">
                {/* Same glyph as whiteboard's FEISHU_TOOLBAR_ICONS.sticky. */}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M21.5 14.108a2 2 0 0 1-.621 1.45l-5.667 5.391a2 2 0 0 1-1.379.551H4.5a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2zM4.3 19.5v-15c0-.11.09-.2.2-.2h15c.11 0 .2.09.2.2V14H15a1 1 0 0 0-1 1v4.617l-.029.028a.2.2 0 0 1-.138.055H4.5a.2.2 0 0 1-.2-.2" />
                </svg>
              </span>
              <svg className="Courseware-toolbar__group-chevron" viewBox="0 0 8 8" aria-hidden="true">
                <path d="m3 2 2 2-2 2" fill="none" stroke="currentColor" />
              </svg>
            </button>
          </Popover.Trigger>
        </Tooltip>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Content
            className="tool-popover-content Courseware-toolbar__popover Courseware-toolbar__insert-popover"
            data-tooltip-obstacle
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={{ top: 72, bottom: 72, left: 8, right: 8 }}
            collisionBoundary={container ?? undefined}
            aria-label="便签选择"
            onEscapeKeyDown={(event) => {
              hideTooltip({ immediate: true });
              event.stopPropagation();
            }}
          >
            {COURSEWARE_STICKY_COLORS.map((color) => (
              <Tooltip key={color} label={`便签颜色 ${color}`} position="top">
                <button
                  type="button"
                  className={clsx("Courseware-toolbar__insert-option", {
                    "is-selected": appState.coursewareStickyColor === color,
                  })}
                  aria-label={`便签颜色 ${color}`}
                  aria-pressed={appState.coursewareStickyColor === color}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setAppState({ coursewareStickyColor: color });
                    activateInsertTool(COURSEWARE_STICKY_CUSTOM_TYPE);
                    setOpenInsertTool(null);
                  }}
                />
              </Tooltip>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    );
  };

  const renderEmojiTool = () => {
    if (!renderEmojiPicker || !isToolEnabled("text")) {
      return null;
    }
    const active = activeInsertTool === COURSEWARE_EMOJI_CUSTOM_TYPE;
    return (
      <Tooltip label="表情" position="right">
        <div
          className="Courseware-toolbar__emoji-picker"
          onPointerDownCapture={() => hideTooltip({ immediate: true })}
        >
          {renderEmojiPicker({
            active,
            selectedEmoji: hasEmojiSelection ? appState.coursewareEmoji : undefined,
            disabled: false,
            open: openInsertTool === "emoji",
            triggerClassName: clsx("ToolIcon Courseware-toolbar__group-trigger", { active }),
            popoverSide: "right",
            popoverAlign: "start",
            onOpenChange: (open) => {
              if (open) {
                setAppState({ openMenu: null, openPopup: null });
                changeOpenGroup(null);
                hideTooltip({ immediate: true });
                openedScrollTopRef.current = toolsRef.current?.scrollTop ?? 0;
                activateInsertTool(COURSEWARE_EMOJI_CUSTOM_TYPE, true);
              }
              setOpenInsertTool(open ? "emoji" : null);
            },
            onEmojiSelect: (emoji) => {
              setHasEmojiSelection(true);
              setAppState({ coursewareEmoji: emoji });
              activateInsertTool(COURSEWARE_EMOJI_CUSTOM_TYPE);
              setOpenInsertTool(null);
            },
            onDefaultEmojiSelect: (emoji) => {
              if (!hasEmojiSelection) {
                setHasEmojiSelection(true);
                setAppState({ coursewareEmoji: emoji });
              }
            },
          })}
        </div>
      </Tooltip>
    );
  };

  const eraserOptions: ToolbarOption[] = [
    {
      id: "path",
      tool: "eraser",
      icon: EraserIcon,
      label: capitalizeString(t("toolBar.eraser")),
    },
    {
      id: "box",
      tool: "eraser",
      icon: RectangleIcon,
      label: capitalizeString(t("toolBar.eraserBox")),
    },
  ];

  return (
    <div
      className="Courseware-toolbar"
      role="toolbar"
      aria-label={t("headings.shapes")}
      aria-orientation="vertical"
    >
      <div
        className="Courseware-toolbar__tools"
        ref={toolsRef}
        onScroll={(event) => {
          // scrollIntoView can dispatch its scroll event after a menu opens.
          // Only movement since opening should dismiss that menu.
          if (
            openedScrollTopRef.current !== null &&
            event.currentTarget.scrollTop !== openedScrollTopRef.current
          ) {
            changeOpenGroup(null);
            setOpenInsertTool(null);
            if (appState.openMenu === "canvas") {
              setAppState({ openMenu: null });
            }
          }
        }}
        onWheel={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          // Portaled palette events keep their React ancestry; focus navigation
          // here only applies to controls physically inside the main rail.
          if (!event.currentTarget.contains(event.target as Node)) {
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
            return;
          }
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
            return;
          }
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ),
          );
          const index = controls.indexOf(document.activeElement as HTMLElement);
          const nextIndex =
            event.key === "Home"
              ? 0
              : event.key === "End"
              ? controls.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + controls.length) %
                controls.length;
          if (controls[nextIndex]) {
            event.preventDefault();
            event.stopPropagation();
            controls[nextIndex].focus({ preventScroll: true });
            const visibleControl =
              controls[nextIndex].closest<HTMLElement>(".ToolIcon") ||
              controls[nextIndex];
            visibleControl.scrollIntoView?.({ block: "nearest" });
          }
        }}
      >
        {toolbarStart}
        {toolbarStart && <div className="Courseware-toolbar__separator" />}
        <Tooltip label={`${t("toolBar.lock")} — Q`} position="right">
          <LockButton
            checked={appState.activeTool.locked}
            onChange={onLockToggle}
            title={t("toolBar.lock")}
            showNativeTooltip={false}
          />
        </Tooltip>
        {appState.penDetected && (
          <Tooltip label={t("toolBar.penMode")} position="right">
            <PenModeButton
              zenModeEnabled={appState.zenModeEnabled}
              checked={appState.penMode}
              onChange={() => onPenModeToggle(null)}
              title={t("toolBar.penMode")}
              showNativeTooltip={false}
              penDetected={appState.penDetected}
            />
          </Tooltip>
        )}
        <div className="Courseware-toolbar__separator" />
        {renderGroup("selection", t("toolBar.selection"), [
          getToolOption("selection"),
          getToolOption("lasso"),
        ])}
        {renderGroup("writing", t("toolBar.freedraw"), [
          getToolOption("freedraw"),
          getToolOption("laser"),
        ])}
        {renderGroup("eraser", t("toolBar.eraser"), eraserOptions)}
        {renderGroup("text", t("toolBar.text"), [
          getToolOption("text"),
          getToolOption("richText"),
        ])}
        {renderGroup("shape", t("headings.shapes"),
          COURSEWARE_WHITEBOARD_SHAPE_KINDS.map((kind): ToolbarOption => {
            const preset = COURSEWARE_SHAPE_PRESETS.find((item) => item.kind === kind);
            const option = preset
              ? { id: preset.id, tool: "custom" as const, customType: preset.customType, label: preset.label }
              : getToolOption(kind as "rectangle" | "diamond" | "ellipse");
            return { ...option, icon: <CoursewareShapeIcon kind={kind} /> };
          }),
        )}
        {renderGroup("line", t("toolBar.line"), [
          getToolOption("arrow"),
          getToolOption("line"),
        ])}
        <MindmapTool app={app} onOpen={() => { changeOpenGroup(null); setOpenInsertTool(null); setAppState({ openMenu: null, openPopup: null }); }} />
        {renderStickyTool()}
        {renderEmojiTool()}
        {renderTool("image")}
        {renderTool("frame")}
        <div className="Courseware-toolbar__separator" />
        <MainMenuTunnel.Out />
      </div>
    </div>
  );
};

export default CoursewareToolbar;
