import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import { useRef, useEffect } from "react";
import type { ReactNode } from "react";

import {
  COLOR_OUTLINE_CONTRAST_THRESHOLD,
  COLOR_PALETTE,
  isTransparent,
} from "@excalidraw/common";

import type { ColorPaletteCustom } from "@excalidraw/common";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import { useAtom } from "../../editor-jotai";
import { t } from "../../i18n";
import { useStylesPanelMode } from "../App";
import { ButtonSeparator } from "../ButtonSeparator";
import { activeEyeDropperAtom } from "../EyeDropper";
import { slashIcon, strokeIcon } from "../icons";
import { PropertiesPopover } from "../PropertiesPopover";
import {
  saveCaretPosition,
  restoreCaretPosition,
  temporarilyDisableTextEditorBlur,
} from "../../hooks/useTextEditorFocus";

import { AdvancedColorPicker } from "./AdvancedColorPicker";
import { TopPicks } from "./TopPicks";
import { activeColorPickerSectionAtom, isColorDark } from "./colorPickerUtils";

import "./ColorPicker.scss";

import type { ColorPickerType } from "./colorPickerUtils";

import type { AppState } from "../../types";

const isValidColor = (color: string) => {
  const style = new Option().style;
  style.color = color;
  return !!style.color;
};

export const getColor = (color: string): string | null => {
  if (isTransparent(color)) {
    return color;
  }

  // testing for `#` first fixes a bug on Electron (more specfically, an
  // Obsidian popout window), where a hex color without `#` is (incorrectly)
  // considered valid
  return isValidColor(`#${color}`)
    ? `#${color}`
    : isValidColor(color)
    ? color
    : null;
};

interface ColorPickerProps {
  type: ColorPickerType;
  /**
   * null indicates no color should be displayed as active
   * (e.g. when multiple shapes selected with different colors)
   */
  color: string | null;
  onChange: (color: string) => void;
  label: string;
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  palette?: ColorPaletteCustom | null;
  topPicks?: readonly string[];
  updateData: (formData?: any) => void;
  bottomContent?: ReactNode;
  /** Custom icon for the trigger button in compact mode */
  icon?: ReactNode;
  /** Custom title/tooltip for the trigger button */
  title?: string;
}

const ColorPickerPopupContent = ({
  type,
  color,
  onChange,
  label,
  elements,
  palette = COLOR_PALETTE,
  updateData,
  getOpenPopup,
  appState,
  bottomContent,
}: Pick<
  ColorPickerProps,
  | "type"
  | "color"
  | "onChange"
  | "label"
  | "elements"
  | "palette"
  | "updateData"
  | "appState"
  | "bottomContent"
> & {
  getOpenPopup: () => AppState["openPopup"];
}) => {
  const [, setActiveColorPickerSection] = useAtom(activeColorPickerSectionAtom);

  const [eyeDropperState, setEyeDropperState] = useAtom(activeEyeDropperAtom);

  const handleEyeDropperToggle = (force?: boolean) => {
    setEyeDropperState((state) => {
      if (force) {
        state = state || {
          keepOpenOnAlt: true,
          onSelect: onChange,
          colorPickerType: type,
        };
        state.keepOpenOnAlt = true;
        return state;
      }

      return force === false || state
        ? null
        : {
            keepOpenOnAlt: false,
            onSelect: onChange,
            colorPickerType: type,
          };
    });
  };

  const handleClose = () => {
    // only clear if we're still the active popup (avoid racing with switch)
    if (getOpenPopup() === type) {
      updateData({ openPopup: null });
    }
    setActiveColorPickerSection(null);

    // Refocus text editor when popover closes if we were editing text
    if (appState.editingTextElement) {
      setTimeout(() => {
        const textEditor = document.querySelector(
          ".excalidraw-wysiwyg",
        ) as HTMLTextAreaElement;
        if (textEditor) {
          textEditor.focus();
        }
      }, 0);
    }
  };

  const handleColorChange = (changedColor: string) => {
    // Save caret position before color change if editing text
    const savedSelection = appState.editingTextElement
      ? saveCaretPosition()
      : null;

    onChange(changedColor);

    // Restore caret position after color change if editing text
    if (appState.editingTextElement && savedSelection) {
      restoreCaretPosition(savedSelection);
    }
  };

  return (
    <PropertiesPopover
      className="advanced-color-picker-popover"
      closeMode="manual"
      noIsland
      onClose={handleClose}
    >
      <AdvancedColorPicker
        color={color}
        onChange={handleColorChange}
        onEyeDropperToggle={handleEyeDropperToggle}
        onClose={handleClose}
      />
    </PropertiesPopover>
  );
};

const ColorPickerTrigger = ({
  label,
  color,
  type,
  mode = "background",
  onToggle,
  editingTextElement,
  icon,
  title: customTitle,
}: {
  color: string | null;
  label: string;
  type: ColorPickerType;
  mode?: "background" | "stroke";
  onToggle: () => void;
  editingTextElement?: boolean;
  icon?: ReactNode;
  title?: string;
}) => {
  const stylesPanelMode = useStylesPanelMode();
  const isCompactMode = stylesPanelMode !== "full";
  const isMobileMode = stylesPanelMode === "mobile";
  const handleClick = (e: React.MouseEvent) => {
    // use pointerdown so we run before outside-close logic
    e.preventDefault();
    e.stopPropagation();

    // If editing text, temporarily disable the wysiwyg blur event
    if (editingTextElement) {
      temporarilyDisableTextEditorBlur();
    }

    onToggle();
  };

  return (
    <Popover.Trigger
      type="button"
      className={clsx("color-picker__button active-color properties-trigger", {
        "is-transparent": !color || color === "transparent",
        "has-outline":
          !color || !isColorDark(color, COLOR_OUTLINE_CONTRAST_THRESHOLD),
        "compact-sizing": isCompactMode,
        "mobile-border": isMobileMode,
      })}
      aria-label={label}
      style={color ? { "--swatch-color": color } : undefined}
      title={
        customTitle ||
        (type === "elementStroke" || type === "textOutline"
          ? t("labels.showStroke")
          : t("labels.showBackground"))
      }
      data-openpopup={type}
      onClick={handleClick}
    >
      <div className="color-picker__button-outline">{!color && slashIcon}</div>
      {isCompactMode && color && mode === "stroke" && (
        <div className="color-picker__button-background">
          <span
            style={{
              color:
                color && isColorDark(color, COLOR_OUTLINE_CONTRAST_THRESHOLD)
                  ? "#fff"
                  : "#111",
            }}
          >
            {icon || strokeIcon}
          </span>
        </div>
      )}
    </Popover.Trigger>
  );
};

export const ColorPicker = ({
  type,
  color,
  onChange,
  label,
  elements,
  palette = COLOR_PALETTE,
  topPicks,
  updateData,
  appState,
  bottomContent,
  icon,
  title,
}: ColorPickerProps) => {
  const openRef = useRef(appState.openPopup);
  useEffect(() => {
    openRef.current = appState.openPopup;
  }, [appState.openPopup]);
  const stylesPanelMode = useStylesPanelMode();
  const isCompactMode = stylesPanelMode !== "full";

  return (
    <div>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("color-picker-container", {
          "color-picker-container--no-top-picks": isCompactMode,
        })}
      >
        {!isCompactMode && (
          <TopPicks
            activeColor={color}
            onChange={onChange}
            type={type}
            topPicks={topPicks}
          />
        )}
        {!isCompactMode && <ButtonSeparator />}
        <Popover.Root
          open={appState.openPopup === type}
          onOpenChange={(open) => {
            if (open) {
              updateData({ openPopup: type });
            }
          }}
        >
          {/* serves as an active color indicator as well */}
          <ColorPickerTrigger
            color={color}
            label={label}
            type={type}
            mode={type === "elementStroke" || type === "textOutline" ? "stroke" : "background"}
            editingTextElement={!!appState.editingTextElement}
            icon={icon}
            title={title}
            onToggle={() => {
              // atomic switch: if another popup is open, close it first, then open this one next tick
              if (appState.openPopup === type) {
                // toggle off on same trigger
                updateData({ openPopup: null });
              } else if (appState.openPopup) {
                updateData({ openPopup: type });
              } else {
                // open this one
                updateData({ openPopup: type });
              }
            }}
          />
          {/* popup content */}
          {appState.openPopup === type && (
            <ColorPickerPopupContent
              type={type}
              color={color}
              onChange={onChange}
              label={label}
              elements={elements}
              palette={palette}
              updateData={updateData}
              getOpenPopup={() => openRef.current}
              appState={appState}
              bottomContent={bottomContent}
            />
          )}
        </Popover.Root>
      </div>
    </div>
  );
};
