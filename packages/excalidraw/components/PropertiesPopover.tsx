import * as Popover from "@radix-ui/react-popover";
import clsx from "clsx";
import React, { type ReactNode } from "react";

import { isInteractive } from "@excalidraw/common";

import { useEditorInterface } from "./App";
import { Island } from "./Island";

interface PropertiesPopoverProps {
  className?: string;
  container?: HTMLDivElement | null;
  children: ReactNode;
  style?: object;
  onClose: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
  onFocusOutside?: Popover.PopoverContentProps["onFocusOutside"];
  onPointerDownOutside?: Popover.PopoverContentProps["onPointerDownOutside"];
  preventAutoFocusOnTouch?: boolean;
  /** 弹出方向，默认 "bottom" */
  side?: Popover.PopoverContentProps["side"];
  /** 对齐方式，默认 "end" */
  align?: Popover.PopoverContentProps["align"];
  /** 弹出方向偏移，默认 8 */
  sideOffset?: number;
  /** 对齐偏移，默认 0 */
  alignOffset?: number;
  /** 是否显示箭头，默认 false */
  showArrow?: boolean;
  /**
   * 关闭模式：
   * - "manual": 只能通过调用 onClose 手动关闭（阻止外部点击和 Escape 键关闭）
   * - "auto": 点击外部或按 Escape 键自动关闭
   * 默认 "auto"
   */
  closeMode?: "manual" | "auto";
  /** 是否不使用 Island 包裹 children，默认 false */
  noIsland?: boolean;
}

export const PropertiesPopover = React.forwardRef<
  HTMLDivElement,
  PropertiesPopoverProps
>(
  (
    {
      className,
      container,
      children,
      style,
      onClose,
      onKeyDown,
      onFocusOutside,
      onPointerLeave,
      onPointerDownOutside,
      preventAutoFocusOnTouch = false,
      side = "bottom",
      align = "end",
      sideOffset = 8,
      alignOffset = 0,
      showArrow = false,
      closeMode = "auto",
      noIsland = false,
    },
    ref,
  ) => {
    const editorInterface = useEditorInterface();

    const handleInteractOutside = (event: Event) => {
      if (closeMode === "manual") {
        // 手动模式：阻止外部点击关闭
        event.preventDefault();
      } else {
        // 自动模式：允许外部点击关闭
        onClose();
      }
    };

    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (closeMode === "manual") {
        // 手动模式：阻止 Escape 键关闭
        event.preventDefault();
      } else {
        // 自动模式：允许 Escape 键关闭
        onClose();
      }
    };

    return (
      <Popover.Content
        ref={ref}
        className={clsx("focus-visible-none properties-popover", className)}
        data-prevent-outside-click
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        style={{
          zIndex: "var(--zIndex-ui-styles-popup)",
          ...style,
        }}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onFocusOutside={onFocusOutside}
        onPointerDownOutside={(event) => {
          handleInteractOutside(event);
          onPointerDownOutside?.(event);
        }}
        onInteractOutside={handleInteractOutside}
        onEscapeKeyDown={handleEscapeKeyDown}
        onOpenAutoFocus={(e) => {
          // prevent auto-focus on touch devices to avoid keyboard popup
          if (preventAutoFocusOnTouch && editorInterface.isTouchScreen) {
            e.preventDefault();
          }
        }}
        onCloseAutoFocus={(e) => {
          e.stopPropagation();
          // prevents focusing the trigger
          e.preventDefault();

          // return focus to excalidraw container unless
          // user focuses an interactive element, such as a button, or
          // enters the text editor by clicking on canvas with the text tool
          if (container && !isInteractive(document.activeElement)) {
            container.focus();
          }
        }}
      >
        {noIsland ? (
          children
        ) : (
          <Island padding={3} style={style}>
            {children}
          </Island>
        )}
        {showArrow && (
          <Popover.Arrow
            width={20}
            height={10}
            style={{
              fill: "var(--popup-bg-color)",
              filter: "drop-shadow(rgba(0, 0, 0, 0.05) 0px 3px 2px)",
            }}
          />
        )}
      </Popover.Content>
    );
  },
);
