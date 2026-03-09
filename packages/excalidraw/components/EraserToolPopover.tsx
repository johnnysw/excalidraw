import React, { useEffect, useState } from "react";
import clsx from "clsx";

import { capitalizeString } from "@excalidraw/common";

import * as Popover from "@radix-ui/react-popover";

import { trackEvent } from "../analytics";
import { isEraserActive } from "../appState";
import { t } from "../i18n";

import { useExcalidrawContainer } from "./App";
import { EraserIcon, RectangleIcon } from "./icons";
import { ToolButton } from "./ToolButton";

import "./ToolPopover.scss";

import type { AppClassProperties, UIAppState } from "../types";

const SIDE_OFFSET = 32 / 2 + 10;

type EraserToolPopoverProps = {
  app: AppClassProperties;
  appState: Pick<UIAppState, "activeTool" | "preferredEraserMode">;
  setAppState: React.Component<any, any>["setState"];
  className?: string;
  title: string;
  keyBindingLabel?: string | null;
  "data-testid": string;
  onTriggerPointerDown?: (data: { pointerType: string | null }) => void;
};

export const EraserToolPopover = ({
  app,
  appState,
  setAppState,
  className = "Shape",
  title,
  keyBindingLabel,
  "data-testid": dataTestId,
  onTriggerPointerDown,
}: EraserToolPopoverProps) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const { container } = useExcalidrawContainer();

  useEffect(() => {
    const unsubscribe = app.onPointerDownEmitter.on(() => {
      setIsPopupOpen(false);
    });
    return () => unsubscribe?.();
  }, [app]);

  const isActive = isEraserActive(appState);
  const options = [
    {
      type: "path" as const,
      icon: EraserIcon,
      title: capitalizeString(t("toolBar.eraser")),
    },
    {
      type: "box" as const,
      icon: RectangleIcon,
      title: capitalizeString(t("toolBar.eraserBox")),
    },
  ];

  return (
    <Popover.Root open={isPopupOpen}>
      <Popover.Trigger asChild>
        <ToolButton
          className={clsx(className, { active: isActive })}
          type="radio"
          icon={EraserIcon}
          checked={isActive}
          name="editor-current-shape"
          title={title}
          keyBindingLabel={keyBindingLabel}
          aria-label={title}
          data-testid={dataTestId}
          onPointerDown={({ pointerType }) => {
            onTriggerPointerDown?.({ pointerType });
            setIsPopupOpen((value) => !value);
            app.setActiveTool({ type: "eraser" });
          }}
          onChange={() => {
            setIsPopupOpen(true);
            if (!isActive) {
              trackEvent("toolbar", "eraser", "ui");
            }
            app.setActiveTool({ type: "eraser" });
          }}
        />
      </Popover.Trigger>

      <Popover.Content
        className="tool-popover-content"
        sideOffset={SIDE_OFFSET}
        collisionBoundary={container ?? undefined}
      >
        {options.map((option) => (
          <ToolButton
            className={clsx(className, {
              active: appState.preferredEraserMode === option.type,
            })}
            key={option.type}
            type="radio"
            icon={option.icon}
            checked={appState.preferredEraserMode === option.type}
            name="eraser-mode-option"
            title={option.title}
            aria-label={option.title}
            data-testid={`toolbar-eraser-${option.type}`}
            onChange={() => {
              setIsPopupOpen(false);
              app.setActiveTool({ type: "eraser" });
              setAppState({ preferredEraserMode: option.type });
            }}
          />
        ))}
      </Popover.Content>
    </Popover.Root>
  );
};

export default EraserToolPopover;
