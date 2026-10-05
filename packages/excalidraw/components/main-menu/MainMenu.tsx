import React from "react";
import clsx from "clsx";

import { composeEventHandlers } from "@excalidraw/common";

import { useTunnels } from "../../context/tunnels";
import { useUIAppState } from "../../context/ui-appState";
import { useShareMode } from "../../context/share-mode";
import { t } from "../../i18n";
import {
  useApp,
  useAppProps,
  useEditorInterface,
  useExcalidrawContainer,
  useExcalidrawSetAppState,
} from "../App";
import { MoreToolsMenuItems } from "../Actions";
import { UserList } from "../UserList";
import DropdownMenu from "../dropdownMenu/DropdownMenu";
import { withInternalFallback } from "../hoc/withInternalFallback";
import { HamburgerMenuIcon } from "../icons";

import * as DefaultItems from "./DefaultItems";

const MainMenu = Object.assign(
  withInternalFallback(
    "MainMenu",
    ({
      children,
      onSelect,
    }: {
      children?: React.ReactNode;
      /**
       * Called when any menu item is selected (clicked on).
       */
      onSelect?: (event: Event) => void;
    }) => {
      const { MainMenuTunnel } = useTunnels();
      const editorInterface = useEditorInterface();
      const appState = useUIAppState();
      const setAppState = useExcalidrawSetAppState();
      const app = useApp();
      const { UIOptions } = useAppProps();
      const { container } = useExcalidrawContainer();
      const isMainMenuVisible = useShareMode()?.mainMenu?.visible !== false;
      const isCoursewareMenu =
        UIOptions.toolbarLayout === "left" &&
        editorInterface.formFactor !== "phone" &&
        !appState.viewModeEnabled &&
        appState.openDialog?.name !== "elementLinkSelector";
      const isOpen = appState.openMenu === "canvas";

      return (
        <MainMenuTunnel.In>
          <DropdownMenu open={isOpen}>
            <DropdownMenu.Trigger
              onToggle={() => {
                setAppState({
                  openMenu: appState.openMenu === "canvas" ? null : "canvas",
                  openPopup: null,
                  openDialog: null,
                });
              }}
              data-testid="main-menu-trigger"
              className={clsx("main-menu-trigger", {
                "Courseware-toolbar__menu-trigger": isCoursewareMenu,
              })}
              title={isCoursewareMenu ? t("buttons.menu") : undefined}
              aria-label={t("buttons.menu")}
              aria-expanded={isOpen}
              aria-haspopup={isCoursewareMenu ? "dialog" : "menu"}
              tooltipPosition={isCoursewareMenu ? "right" : undefined}
            >
              {HamburgerMenuIcon}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              onClickOutside={() => setAppState({ openMenu: null })}
              onSelect={composeEventHandlers(onSelect, () => {
                setAppState({ openMenu: null });
              })}
              placement={isCoursewareMenu ? "right" : "bottom"}
              className={clsx("main-menu-dropdown", {
                "Courseware-toolbar__menu": isCoursewareMenu,
              })}
              portal={isCoursewareMenu}
              onCloseAutoFocus={
                isCoursewareMenu
                  ? (event) => {
                      event.preventDefault();
                      // Another menu can open before Radix finishes restoring
                      // focus; let its own autofocus own that transition.
                      if (
                        !app.state.openMenu &&
                        !app.state.openPopup &&
                        !app.state.openDialog &&
                        !container?.querySelector(
                          '.Courseware-toolbar [aria-expanded="true"]',
                        )
                      ) {
                        container
                          ?.querySelector<HTMLButtonElement>(
                            '[data-testid="main-menu-trigger"]',
                          )
                          ?.focus({ preventScroll: true });
                      }
                    }
                  : undefined
              }
            >
              {(!isCoursewareMenu || isMainMenuVisible) && children}
              {isCoursewareMenu && (
                <>
                  {isMainMenuVisible && <DropdownMenu.Separator />}
                  <DropdownMenu.Group title={t("toolBar.extraTools")}>
                    <MoreToolsMenuItems
                      app={app}
                      activeTool={appState.activeTool}
                      UIOptions={UIOptions}
                      showTooltips
                    />
                  </DropdownMenu.Group>
                </>
              )}
              {editorInterface.formFactor === "phone" &&
                appState.collaborators.size > 0 && (
                  <fieldset className="UserList-Wrapper">
                    <legend>{t("labels.collaborators")}</legend>
                    <UserList
                      mobile={true}
                      collaborators={appState.collaborators}
                      userToFollow={appState.userToFollow?.socketId || null}
                    />
                  </fieldset>
                )}
            </DropdownMenu.Content>
          </DropdownMenu>
        </MainMenuTunnel.In>
      );
    },
  ),
  {
    Trigger: DropdownMenu.Trigger,
    Item: DropdownMenu.Item,
    ItemLink: DropdownMenu.ItemLink,
    ItemCustom: DropdownMenu.ItemCustom,
    Group: DropdownMenu.Group,
    Separator: DropdownMenu.Separator,
    DefaultItems,
  },
);

export default MainMenu;
