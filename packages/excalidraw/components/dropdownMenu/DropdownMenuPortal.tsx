import clsx from "clsx";
import React, { useLayoutEffect, useRef, useState } from "react";

import * as Popover from "@radix-ui/react-popover";

import { KEYS } from "@excalidraw/common";

import { useExcalidrawContainer } from "../App";
import { Island } from "../Island";

import { DropdownMenuContentPropsContext } from "./common";

import type { MenuContentProps } from "./DropdownMenuContent";

const DropdownMenuPortal = ({
  children,
  onClickOutside,
  className,
  onSelect,
  onCloseAutoFocus,
  style,
  placement = "bottom",
}: MenuContentProps) => {
  const { container } = useExcalidrawContainer();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const anchorRef = React.useMemo(() => ({ current: trigger! }), [trigger]);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const triggerButton = markerRef.current?.parentElement?.querySelector<
      HTMLButtonElement
    >(".dropdown-menu-button");
    setTrigger(triggerButton ?? null);
  }, []);

  return (
    <>
      <span ref={markerRef} hidden aria-hidden="true" />
      {container && trigger && (
        <Popover.Root
          open
          onOpenChange={(open) => {
            if (!open) {
              onClickOutside?.();
            }
          }}
        >
          <Popover.Anchor virtualRef={anchorRef} />
          <Popover.Portal container={container}>
            <Popover.Content
              ref={contentRef}
              className={clsx(
                "dropdown-menu dropdown-menu--portal",
                className,
              )}
              side={placement}
              sideOffset={10}
              align="start"
              collisionBoundary={container}
              collisionPadding={{ top: 72, bottom: 72, left: 8, right: 8 }}
              onInteractOutside={(event) => {
                if (
                  event.target instanceof Node &&
                  trigger.contains(event.target)
                ) {
                  event.preventDefault();
                }
              }}
              onCloseAutoFocus={(event) => {
                if (onCloseAutoFocus) {
                  onCloseAutoFocus(event);
                  return;
                }
                event.preventDefault();
                if (trigger.isConnected) {
                  trigger.focus();
                }
              }}
              onKeyDown={(event) => {
                if (event.key === KEYS.ESCAPE) {
                  event.preventDefault();
                  event.stopPropagation();
                  event.nativeEvent.stopImmediatePropagation();
                  onClickOutside?.();
                  return;
                }
                if (
                  ![
                    KEYS.ARROW_UP,
                    KEYS.ARROW_DOWN,
                    "Home",
                    "End",
                  ].includes(event.key)
                ) {
                  return;
                }
                const items = Array.from(
                  contentRef.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled), a[href], [tabindex='0']",
                  ) ?? [],
                );
                if (!items.length) {
                  return;
                }
                event.preventDefault();
                event.stopPropagation();
                const currentIndex = items.indexOf(
                  document.activeElement as HTMLElement,
                );
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (currentIndex +
                          (event.key === KEYS.ARROW_DOWN ? 1 : -1) +
                          items.length) %
                        items.length;
                items[nextIndex].focus();
              }}
              style={{
                ...style,
                position: "relative",
                inset: "auto",
                margin: 0,
              }}
              data-testid="dropdown-menu"
            >
              <DropdownMenuContentPropsContext.Provider value={{ onSelect }}>
                <Island
                  className="dropdown-menu-container"
                  padding={2}
                >
                  {children}
                </Island>
              </DropdownMenuContentPropsContext.Provider>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </>
  );
};

export default DropdownMenuPortal;
