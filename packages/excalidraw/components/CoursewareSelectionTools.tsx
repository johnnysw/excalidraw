import clsx from "clsx";
import React, { useEffect, useRef } from "react";
import * as Popover from "@radix-ui/react-popover";

import { KEYS } from "@excalidraw/common";

import { trackEvent } from "../analytics";
import { t } from "../i18n";

import { useExcalidrawContainer } from "./App";
import { HandButton } from "./HandButton";
import { LassoIcon, SelectionIcon } from "./icons";

import type { AppClassProperties, AppProps, AppState, UIAppState } from "../types";

interface CoursewareSelectionToolsProps {
  app: AppClassProperties;
  appState: UIAppState;
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
  onHandToolToggle: () => void;
}

/** Courseware selection controls share one popup with all other editor menus. */
const CoursewareSelectionTools = ({
  app,
  appState,
  setAppState,
  UIOptions,
  onHandToolToggle,
}: CoursewareSelectionToolsProps) => {
  const { container } = useExcalidrawContainer();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(true);
  const activatingDefaultRef = useRef(false);
  const activeTool = appState.activeTool.type;
  const open = appState.openPopup === "coursewareSelection";
  const options = [
    { type: "selection" as const, icon: SelectionIcon, label: t("toolBar.selection") },
    { type: "lasso" as const, icon: LassoIcon, label: t("toolBar.lasso") },
  ].filter((option) => UIOptions.tools?.[option.type] !== false);
  const active = options.some((option) => option.type === activeTool);
  const displayed = options.find((option) => option.type === activeTool) ||
    options.find((option) => option.type === appState.preferredSelectionTool.type) ||
    options[0];
  const hasHand = UIOptions.tools?.hand !== false;

  useEffect(() => {
    if (activatingDefaultRef.current) {
      activatingDefaultRef.current = false;
      return;
    }
    if (app.state.openPopup === "coursewareSelection") {
      setAppState({ openPopup: null });
    }
  }, [activeTool, app, setAppState]);

  useEffect(() => app.onPointerDownEmitter.on(() => {
    if (app.state.openPopup === "coursewareSelection") {
      setAppState({ openPopup: null });
    }
  }), [app, setAppState]);

  if (!displayed && !hasHand) {
    return null;
  }

  return (
    <div className="Courseware-selection-tools" role="group" aria-label={t("toolBar.selection")}>
      {displayed && (
        <Popover.Root
          open={open}
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              restoreFocusRef.current = true;
              const firstOption = options[0];
              if (firstOption && !active) {
                activatingDefaultRef.current = true;
                trackEvent("toolbar", firstOption.type, "ui");
                app.setActiveTool({ type: firstOption.type });
                setAppState({
                  openMenu: null,
                  openPopup: "coursewareSelection",
                  preferredSelectionTool: {
                    type: firstOption.type,
                    initialized: true,
                  },
                });
              } else {
                setAppState({ openMenu: null, openPopup: "coursewareSelection" });
              }
            } else {
              // A dismissed layer can finish closing after another menu opens.
              // Clear only the popup owned by these controls.
              setAppState((state) => state.openPopup === "coursewareSelection"
                ? { openPopup: null } : null);
            }
          }}
        >
          <Popover.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              className={clsx("ToolIcon Courseware-selection-tools__trigger", { active })}
              aria-label={t("toolBar.selection")}
              aria-pressed={active}
              title={`${t("toolBar.selection")} · ${displayed.label}`}
              data-testid="toolbar-group-selection"
              data-active-tool={displayed.type}
            >
              <span className="ToolIcon__icon">{displayed.icon}</span>
              <svg className="Courseware-selection-tools__chevron" viewBox="0 0 8 8" aria-hidden="true">
                <path d="m2 5 2-2 2 2" fill="none" stroke="currentColor" />
              </svg>
            </button>
          </Popover.Trigger>
          <Popover.Portal container={container ?? undefined}>
            <Popover.Content
              className="tool-popover-content Courseware-selection-tools__popover"
              side="top"
              align="start"
              sideOffset={10}
              collisionBoundary={container ?? undefined}
              collisionPadding={8}
              aria-label={t("toolBar.selection")}
              onEscapeKeyDown={(event) => event.stopPropagation()}
              onInteractOutside={(event) => {
                const target = event.target;
                restoreFocusRef.current = !(target instanceof Element && target.closest(
                  ".Courseware-toolbar button, .Courseware-toolbar input, .App-menu_bottom--courseware button, .App-menu_bottom--courseware input, [data-testid='main-menu-trigger']",
                ));
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (restoreFocusRef.current && !app.state.openMenu && !app.state.openPopup) {
                  triggerRef.current?.focus({ preventScroll: true });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                }
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
                  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
                    (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
                  event.preventDefault();
                  event.stopPropagation();
                  buttons[nextIndex]?.focus();
                }
              }}
            >
              {options.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  className={clsx("ToolIcon", { active: activeTool === option.type })}
                  aria-label={option.label}
                  aria-pressed={activeTool === option.type}
                  aria-keyshortcuts={option.type === "selection" ? `${KEYS.V} ${KEYS["1"]}` : undefined}
                  data-testid={`toolbar-${option.type}`}
                  onPointerDown={(event) => {
                    if (!app.state.penDetected && event.pointerType === "pen") {
                      app.togglePenMode(true);
                    }
                  }}
                  onClick={() => {
                    if (activeTool !== option.type) {
                      trackEvent("toolbar", option.type, "ui");
                    }
                    app.setActiveTool({ type: option.type });
                    setAppState({
                      preferredSelectionTool: { type: option.type, initialized: true },
                      openPopup: null,
                    });
                  }}
                >
                  <span className="ToolIcon__icon">{option.icon}</span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
      {hasHand && (
        <HandButton checked={activeTool === "hand"} onChange={onHandToolToggle} title={t("toolBar.hand")} />
      )}
    </div>
  );
};

export default CoursewareSelectionTools;
