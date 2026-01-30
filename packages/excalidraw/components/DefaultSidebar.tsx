import clsx from "clsx";
import { useEffect, useState } from "react";

import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  composeEventHandlers,
  LIBRARY_SIDEBAR_TAB,
  PRESENTATION_SIDEBAR_TAB,
  PROPERTIES_SIDEBAR_TAB,
  ANIMATION_SIDEBAR_TAB,
  SHARE_SIDEBAR_TAB,
  ANSWER_STATUS_SIDEBAR_TAB,
} from "@excalidraw/common";

import type { MarkOptional, Merge } from "@excalidraw/common/utility-types";

import { useTunnels } from "../context/tunnels";
import { useUIAppState } from "../context/ui-appState";
import { useShareMode } from "../context/share-mode";
import { useRole } from "../context/role";

import "../components/dropdownMenu/DropdownMenu.scss";

import { useExcalidrawSetAppState } from "./App";
import { SearchMenu } from "./SearchMenu";
import { Sidebar } from "./Sidebar/Sidebar";
import { withInternalFallback } from "./hoc/withInternalFallback";
import { searchIcon, PropertiesIcon, AnimationIcon, ShareIcon, DotsHorizontalIcon, usersIcon } from "./icons";
import DropdownMenu from "./dropdownMenu/DropdownMenu";

import type { SidebarProps, SidebarTriggerProps } from "./Sidebar/common";
import { LibraryMenu } from "./LibraryMenu";
import { LibraryIcon, PlaySquareIcon } from "./icons";
import { PresentationMenu } from "./PresentationMenu";
import { PropertiesMenu } from "./PropertiesMenu";
import { AnimationMenu } from "./AnimationMenu";
import { ShareMenu } from "./ShareMenu";
import { AnswerStatusMenu } from "./AnswerStatusMenu";

const DefaultSidebarTrigger = withInternalFallback(
  "DefaultSidebarTrigger",
  (
    props: Omit<SidebarTriggerProps, "name"> &
      React.HTMLAttributes<HTMLDivElement>,
  ) => {
    const { DefaultSidebarTriggerTunnel } = useTunnels();
    return (
      <DefaultSidebarTriggerTunnel.In>
        <Sidebar.Trigger
          {...props}
          className="default-sidebar-trigger"
          name={DEFAULT_SIDEBAR.name}
        />
      </DefaultSidebarTriggerTunnel.In>
    );
  },
);
DefaultSidebarTrigger.displayName = "DefaultSidebarTrigger";

const DefaultTabTriggers = ({ children }: { children: React.ReactNode }) => {
  const { DefaultSidebarTabTriggersTunnel } = useTunnels();
  return (
    <DefaultSidebarTabTriggersTunnel.In>
      {children}
    </DefaultSidebarTabTriggersTunnel.In>
  );
};
DefaultTabTriggers.displayName = "DefaultTabTriggers";

export const DefaultSidebar = Object.assign(
  withInternalFallback(
    "DefaultSidebar",
    ({
      children,
      className,
      onDock,
      docked,
      ...rest
    }: Merge<
      MarkOptional<Omit<SidebarProps, "name">, "children">,
      {
        /** pass `false` to disable docking */
        onDock?: SidebarProps["onDock"] | false;
      }
    >) => {
      const appState = useUIAppState();
      const setAppState = useExcalidrawSetAppState();
      const [moreMenuOpen, setMoreMenuOpen] = useState(false);
      const shareModePermissions = useShareMode();
      const role = useRole();
      const isMember = role === "member";

      const { DefaultSidebarTabTriggersTunnel } = useTunnels();

      // 分享模式下允许的 tabs
      const allowedTabs = shareModePermissions?.sidebar?.allowedTabs;
      const isTabAllowed = (tab: string) => !allowedTabs || allowedTabs.includes(tab);

      useEffect(() => {
        if (!allowedTabs) return;
        const activeTab = appState.openSidebar?.tab;
        if (!activeTab) return;
        if (!allowedTabs.includes(activeTab)) {
          setAppState({
            openSidebar: {
              name: DEFAULT_SIDEBAR.name,
              tab: CANVAS_SEARCH_TAB,
            },
          });
        }
      }, [allowedTabs, appState.openSidebar?.tab, setAppState]);

      // 学生端（member）隐藏"答题情况"标签
      const moreTabItems = [
        { tab: CANVAS_SEARCH_TAB, title: "搜索", icon: searchIcon },
        { tab: SHARE_SIDEBAR_TAB, title: "分享", icon: ShareIcon },
        { tab: ANSWER_STATUS_SIDEBAR_TAB, title: "答题情况", icon: usersIcon },
      ].filter((item) => !isMember || item.tab !== ANSWER_STATUS_SIDEBAR_TAB);

      const isMoreTabActive = moreTabItems.some(
        (item) => appState.openSidebar?.tab === item.tab
      );

      const isForceDocked = appState.openSidebar?.tab === CANVAS_SEARCH_TAB;

      return (
        <Sidebar
          {...rest}
          name="default"
          key="default"
          className={clsx("default-sidebar", className)}
          preventOutsideClose
          docked={
            isForceDocked || (docked ?? appState.defaultSidebarDockedPreference)
          }
          onDock={
            // `onDock=false` disables docking.
            // if `docked` passed, but no onDock passed, disable manual docking.
            isForceDocked || onDock === false || (!onDock && docked != null)
              ? undefined
              : // compose to allow the host app to listen on default behavior
              composeEventHandlers(onDock, (docked) => {
                setAppState({ defaultSidebarDockedPreference: docked });
              })
          }
        >
          <Sidebar.Tabs>
            <Sidebar.Header>
              <Sidebar.TabTriggers>
                {isTabAllowed(PROPERTIES_SIDEBAR_TAB) && (
                  <Sidebar.TabTrigger
                    tab={PROPERTIES_SIDEBAR_TAB}
                    title="属性"
                  >
                    {PropertiesIcon}
                  </Sidebar.TabTrigger>
                )}
                {isTabAllowed(ANIMATION_SIDEBAR_TAB) && (
                  <Sidebar.TabTrigger tab={ANIMATION_SIDEBAR_TAB} title="动画">
                    {AnimationIcon}
                  </Sidebar.TabTrigger>
                )}
                {isTabAllowed(PRESENTATION_SIDEBAR_TAB) && (
                  <Sidebar.TabTrigger
                    tab={PRESENTATION_SIDEBAR_TAB}
                    title="幻灯片"
                  >
                    {PlaySquareIcon}
                  </Sidebar.TabTrigger>
                )}
                {isTabAllowed(LIBRARY_SIDEBAR_TAB) && (
                  <Sidebar.TabTrigger tab={LIBRARY_SIDEBAR_TAB} title="素材库">
                    {LibraryIcon}
                  </Sidebar.TabTrigger>
                )}
                {/* 分享模式下隐藏“更多”菜单 */}
                {!allowedTabs && (
                  <div className="sidebar-more-trigger">
                    <DropdownMenu open={moreMenuOpen}>
                      <DropdownMenu.Trigger
                        onToggle={() => setMoreMenuOpen(!moreMenuOpen)}
                        className={clsx("sidebar-tab-trigger", {
                          "sidebar-tab-trigger--active": isMoreTabActive,
                        })}
                        data-state={isMoreTabActive ? "active" : "inactive"}
                      >
                        {DotsHorizontalIcon}
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content>
                        {moreTabItems.map((item) => (
                          <DropdownMenu.Item
                            key={item.tab}
                            icon={item.icon}
                            onSelect={() => {
                              setAppState({
                                openSidebar: {
                                  name: DEFAULT_SIDEBAR.name,
                                  tab: item.tab,
                                },
                              });
                              setMoreMenuOpen(false);
                            }}
                          >
                            {item.title}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  </div>
                )}
                <DefaultSidebarTabTriggersTunnel.Out />
              </Sidebar.TabTriggers>
            </Sidebar.Header>
            {isTabAllowed(PROPERTIES_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={PROPERTIES_SIDEBAR_TAB}>
                <PropertiesMenu />
              </Sidebar.Tab>
            )}
            {isTabAllowed(ANIMATION_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={ANIMATION_SIDEBAR_TAB}>
                <AnimationMenu />
              </Sidebar.Tab>
            )}
            {isTabAllowed(PRESENTATION_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={PRESENTATION_SIDEBAR_TAB}>
                <PresentationMenu />
              </Sidebar.Tab>
            )}
            {isTabAllowed(LIBRARY_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={LIBRARY_SIDEBAR_TAB}>
                <LibraryMenu />
              </Sidebar.Tab>
            )}
            {isTabAllowed(CANVAS_SEARCH_TAB) && (
              <Sidebar.Tab tab={CANVAS_SEARCH_TAB}>
                <SearchMenu />
              </Sidebar.Tab>
            )}
            {isTabAllowed(SHARE_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={SHARE_SIDEBAR_TAB}>
                <ShareMenu />
              </Sidebar.Tab>
            )}
            {/* 学生端（member）隐藏"答题情况"Tab */}
            {!isMember && isTabAllowed(ANSWER_STATUS_SIDEBAR_TAB) && (
              <Sidebar.Tab tab={ANSWER_STATUS_SIDEBAR_TAB}>
                <AnswerStatusMenu />
              </Sidebar.Tab>
            )}
            {children}
          </Sidebar.Tabs>
        </Sidebar>
      );
    },
  ),
  {
    Trigger: DefaultSidebarTrigger,
    TabTriggers: DefaultTabTriggers,
  },
);
