import clsx from "clsx";
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

import { capitalizeString, KEYS } from "@excalidraw/common";

import { trackEvent } from "../analytics";
import { t } from "../i18n";

import { useExcalidrawContainer } from "./App";
import { MoreToolsMenu } from "./Actions";
import { LockButton } from "./LockButton";
import { PenModeButton } from "./PenModeButton";
import { ToolButton } from "./ToolButton";
import { Tooltip, hideTooltip, showTooltip } from "./Tooltip";
import PresentationMenuButton, { usePresentationMenuVisibility } from "./PresentationMenuButton";
import { SHAPES } from "./shapes";
import {
  EraserIcon,
  frameToolIcon,
  laserPointerToolIcon,
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
  canPresent: boolean;
  onPresent: (mode: "viewer" | "presenter") => void;
}

type GroupId = "eraser" | "text" | "shape" | "line";
type OpenGroup = GroupId | "more" | "presentation" | null;

type ToolbarOption = {
  id: string;
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  keyBindingLabel?: string;
  fillable?: boolean;
};

const GROUP_TOOLS: Record<GroupId, readonly ToolType[]> = {
  eraser: ["eraser"],
  text: ["text", "richText"],
  shape: ["rectangle", "diamond", "ellipse"],
  line: ["arrow", "line"],
};

const getToolOption = (tool: ToolType): ToolbarOption => {
  const definition = SHAPES.find((shape) => shape.value === tool);
  const extra = {
    frame: { icon: frameToolIcon, key: KEYS.F, numericKey: null },
    laser: { icon: laserPointerToolIcon, key: KEYS.K, numericKey: null },
  }[tool as "frame" | "laser"];
  const letterKey = definition?.key ?? extra?.key;
  const numericKey = definition?.numericKey ?? extra?.numericKey;
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
  canPresent,
  onPresent,
}: CoursewareToolbarProps) => {
  const { container } = useExcalidrawContainer();
  const [openGroup, setOpenGroup] = useState<OpenGroup>(null);
  const openGroupRef = useRef(openGroup);
  openGroupRef.current = openGroup;
  const triggersRef = useRef<Partial<Record<GroupId, HTMLButtonElement>>>({});
  const toolsRef = useRef<HTMLDivElement>(null);
  const openedScrollTopRef = useRef<number | null>(null);
  const changeOpenGroup = useCallback((group: OpenGroup) => {
    openedScrollTopRef.current =
      group === null ? null : toolsRef.current?.scrollTop ?? 0;
    openGroupRef.current = group;
    setOpenGroup(group);
  }, []);
  const [lastTools, setLastTools] = useState<Record<GroupId, string>>({
    eraser: appState.preferredEraserMode,
    text: "text",
    shape: "rectangle",
    line: "arrow",
  });
  const activeTool = appState.activeTool.type;
  const tools = UIOptions.tools;
  const isToolEnabled = (tool: ToolType) => tools?.[tool] !== false;
  const toolbarStart = renderToolbarStart?.();
  const showPresentation = usePresentationMenuVisibility(appState.viewModeEnabled);
  useEffect(() => {
    const group = (Object.keys(GROUP_TOOLS) as GroupId[]).find((key) =>
      GROUP_TOOLS[key].includes(activeTool as ToolType),
    );
    if (group && group !== "eraser") {
      setLastTools((previous) =>
        previous[group] === activeTool
          ? previous
          : { ...previous, [group]: activeTool },
      );
    }
    // Keyboard shortcuts and imperative tool changes also dismiss stale menus.
    changeOpenGroup(null);
  }, [activeTool, changeOpenGroup]);

  useEffect(() => {
    return app.onPointerDownEmitter.on(() => changeOpenGroup(null));
  }, [app, changeOpenGroup]);

  useEffect(() => {
    if (appState.openMenu || appState.openPopup) {
      changeOpenGroup(null);
    }
  }, [appState.openMenu, appState.openPopup, changeOpenGroup]);


  const detectPen = (pointerType: string | null) => {
    if (!app.state.penDetected && pointerType === "pen") {
      app.togglePenMode(true);
    }
  };

  const activateOption = (option: ToolbarOption, group?: GroupId) => {
    if (appState.activeTool.type !== option.tool) {
      trackEvent("toolbar", option.tool, "ui");
    }
    // setActiveTool owns all cursor, selection, image and ink initialization.
    app.setActiveTool({ type: option.tool });
    if (group === "eraser") {
      setAppState({ preferredEraserMode: option.id as "path" | "box" });
    }
    if (group) {
      setLastTools((previous) => ({ ...previous, [group]: option.id }));
    }
    changeOpenGroup(null);
  };

  const renderOption = (option: ToolbarOption, group?: GroupId) => {
    const active =
      activeTool === option.tool &&
      (group !== "eraser" || appState.preferredEraserMode === option.id);
    const title = option.shortcut
      ? `${option.label} — ${option.shortcut}`
      : option.label;
    return (
      <button
        key={option.id}
        type="button"
        className={clsx("ToolIcon Courseware-toolbar__option", {
          active,
          fillable: option.fillable,
        })}
        aria-label={option.label}
        aria-pressed={active}
        aria-keyshortcuts={option.shortcut}
        title={title}
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
    const active = options.some((option) => option.tool === activeTool);
    const displayed =
      options.find(
        (option) =>
          option.tool === activeTool &&
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

    const title = `${label} · ${displayed.label}`;
    return (
      <Popover.Root
        key={group}
        open={openGroup === group}
        onOpenChange={(open) => {
          if (open) {
            setAppState({ openMenu: null, openPopup: null });
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
            title={title}
            data-testid={`toolbar-group-${group}`}
            data-active-tool={displayed.id}
            ref={(element) => {
              if (element) {
                triggersRef.current[group] = element;
              } else {
                delete triggersRef.current[group];
              }
            }}
            onPointerEnter={(event) =>
              showTooltip(event.currentTarget, title, false, "right")
            }
            onPointerLeave={hideTooltip}
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
            className="tool-popover-content Courseware-toolbar__popover"
            side="right"
            align="start"
            sideOffset={10}
            collisionPadding={{ top: 72, bottom: 72, left: 8, right: 8 }}
            collisionBoundary={container ?? undefined}
            aria-label={label}
            onEscapeKeyDown={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
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
          title={title}
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
        {showPresentation && (
          <>
            <PresentationMenuButton
              inToolbar
              canPresent={canPresent}
              viewModeEnabled={appState.viewModeEnabled}
              onPresent={onPresent}
              open={openGroup === "presentation"}
              onOpenChange={(open) => {
                if (open) {
                  setAppState({ openMenu: null, openPopup: null });
                }
                changeOpenGroup(open ? "presentation" : null);
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (openGroupRef.current === null && !app.state.openMenu && !app.state.openPopup) {
                  container
                    ?.querySelector<HTMLButtonElement>(
                      ".Courseware-toolbar [data-testid='toolbar-presentation']",
                    )
                    ?.focus({ preventScroll: true });
                }
              }}
            />
            <div className="Courseware-toolbar__separator" />
          </>
        )}
        <Tooltip label={t("toolBar.lock")} position="right">
          <LockButton
            checked={appState.activeTool.locked}
            onChange={onLockToggle}
            title={t("toolBar.lock")}
          />
        </Tooltip>
        {appState.penDetected && (
          <Tooltip label={t("toolBar.penMode")} position="right">
            <PenModeButton
              zenModeEnabled={appState.zenModeEnabled}
              checked={appState.penMode}
              onChange={() => onPenModeToggle(null)}
              title={t("toolBar.penMode")}
              penDetected={appState.penDetected}
            />
          </Tooltip>
        )}
        <div className="Courseware-toolbar__separator" />
        {renderTool("freedraw")}
        {renderGroup("eraser", t("toolBar.eraser"), eraserOptions)}
        {renderGroup("text", t("toolBar.text"), [
          getToolOption("text"),
          getToolOption("richText"),
        ])}
        {renderGroup("shape", t("headings.shapes"), [
          getToolOption("rectangle"),
          getToolOption("diamond"),
          getToolOption("ellipse"),
        ])}
        {renderGroup("line", t("toolBar.line"), [
          getToolOption("arrow"),
          getToolOption("line"),
        ])}
        {renderTool("image")}
        {renderTool("frame")}
        {renderTool("laser")}
        <div className="Courseware-toolbar__separator" />
        <MoreToolsMenu
          app={app}
          activeTool={appState.activeTool}
          setAppState={setAppState}
          UIOptions={UIOptions}
          open={openGroup === "more"}
          onOpenChange={(open) => changeOpenGroup(open ? "more" : null)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openGroupRef.current === null && !app.state.openMenu && !app.state.openPopup) {
              container
                ?.querySelector<HTMLButtonElement>(
                  ".Courseware-toolbar [data-testid='toolbar-extra-tools-trigger']",
                )
                ?.focus({ preventScroll: true });
            }
          }}
        />
      </div>
    </div>
  );
};

export default CoursewareToolbar;
