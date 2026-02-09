import clsx from "clsx";
import React from "react";

import {
  CLASSES,
  DEFAULT_SIDEBAR,
  TOOL_TYPE,
  KEYS,
  arrayToMap,
  capitalizeString,
  isShallowEqual,
} from "@excalidraw/common";

import { mutateElement } from "@excalidraw/element";

import { showSelectedShapeActions } from "@excalidraw/element";

import { ShapeCache } from "@excalidraw/element";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { actionToggleStats } from "../actions";
import { trackEvent } from "../analytics";
import { isHandToolActive } from "../appState";
import { TunnelsContext, useInitializeTunnels } from "../context/tunnels";
import { UIAppStateContext } from "../context/ui-appState";
import { ShareModeContext } from "../context/share-mode";
import { RoleContext } from "../context/role";
import { useAtom, useAtomValue } from "../editor-jotai";

import { t } from "../i18n";
import { calculateScrollCenter } from "../scene";

import {
  SelectedShapeActions,
  ShapesSwitcher,
  CompactShapeActions,
  SelectionTool,
} from "./Actions";
import { LoadingMessage } from "./LoadingMessage";
import { LockButton } from "./LockButton";
import { MobileMenu } from "./MobileMenu";
import { PasteChartDialog } from "./PasteChartDialog";
import { Section } from "./Section";
import Stack from "./Stack";
import { UserList } from "./UserList";
import { PenModeButton } from "./PenModeButton";
import Footer from "./footer/Footer";
import { isSidebarDockedAtom } from "./Sidebar/Sidebar";
import MainMenu from "./main-menu/MainMenu";
import { ActiveConfirmDialog } from "./ActiveConfirmDialog";
import { useEditorInterface, useStylesPanelMode } from "./App";
import { OverwriteConfirmDialog } from "./OverwriteConfirm/OverwriteConfirm";
import { sidebarRightIcon, PlayIcon, FreedrawIcon, EraserIcon, TextIcon, frameToolIcon } from "./icons";
import { DefaultSidebar } from "./DefaultSidebar";
import { TTDDialog } from "./TTDDialog/TTDDialog";
import { Stats } from "./Stats";
import ElementLinkDialog from "./ElementLinkDialog";
import { ErrorDialog } from "./ErrorDialog";
import { EyeDropper, activeEyeDropperAtom } from "./EyeDropper";
import { FixedSideContainer } from "./FixedSideContainer";
import { HandButton } from "./HandButton";
import { HelpDialog } from "./HelpDialog";
import { ToolButton } from "./ToolButton";
import { getToolbarTools } from "./shapes";
import { HintViewer } from "./HintViewer";
import { ImageExportDialog } from "./ImageExportDialog";
import { Island } from "./Island";
import { JSONExportDialog } from "./JSONExportDialog";
import { LaserPointerButton } from "./LaserPointerButton";

import "./LayerUI.scss";
import "./Toolbar.scss";

import type { ActionManager } from "../actions/manager";

import type { Language } from "../i18n";
import type {
  AppProps,
  AppState,
  ExcalidrawProps,
  BinaryFiles,
  UIAppState,
  AppClassProperties,
} from "../types";

interface LayerUIProps {
  role: ExcalidrawProps["role"];
  actionManager: ActionManager;
  appState: UIAppState;
  files: BinaryFiles;
  canvas: HTMLCanvasElement;
  setAppState: React.Component<any, AppState>["setState"];
  elements: readonly NonDeletedExcalidrawElement[];
  onLockToggle: () => void;
  onHandToolToggle: () => void;
  onPenModeToggle: AppClassProperties["togglePenMode"];
  showExitZenModeBtn: boolean;
  langCode: Language["code"];
  renderTopLeftUI?: ExcalidrawProps["renderTopLeftUI"];
  renderTopRightUI?: ExcalidrawProps["renderTopRightUI"];
  renderCustomStats?: ExcalidrawProps["renderCustomStats"];
  UIOptions: AppProps["UIOptions"];
  onExportImage: AppClassProperties["onExportImage"];
  renderWelcomeScreen: boolean;
  children?: React.ReactNode;
  app: AppClassProperties;
  isCollaborating: boolean;
  generateLinkForSelection?: AppProps["generateLinkForSelection"];
  shareModePermissions?: ExcalidrawProps["shareModePermissions"];
}

const DefaultMainMenu: React.FC<{
  UIOptions: AppProps["UIOptions"];
  role: ExcalidrawProps["role"];
}> = ({ UIOptions, role }) => {
  // 学生端（member）只显示：在画布中查找、帮助、画布背景
  const isMember = role === "member";

  return (
    <MainMenu __fallback>
      {!isMember && <MainMenu.DefaultItems.LoadScene />}
      {!isMember && <MainMenu.DefaultItems.SaveToActiveFile />}
      {/* FIXME we should to test for this inside the item itself */}
      {!isMember && UIOptions.canvasActions.export && <MainMenu.DefaultItems.Export />}
      {/* FIXME we should to test for this inside the item itself */}
      {!isMember && UIOptions.canvasActions.saveAsImage && (
        <MainMenu.DefaultItems.SaveAsImage />
      )}
      <MainMenu.DefaultItems.SearchMenu />
      <MainMenu.DefaultItems.Help />
      {!isMember && <MainMenu.DefaultItems.ClearCanvas />}
      {!isMember && <MainMenu.Separator />}
      {!isMember && <MainMenu.DefaultItems.ToggleTheme />}
      <MainMenu.DefaultItems.ChangeCanvasBackground />
    </MainMenu>
  );
};

const DefaultOverwriteConfirmDialog = () => {
  return (
    <OverwriteConfirmDialog __fallback>
      <OverwriteConfirmDialog.Actions.SaveToDisk />
      <OverwriteConfirmDialog.Actions.ExportToImage />
    </OverwriteConfirmDialog>
  );
};

const LayerUI = ({
  role,
  actionManager,
  appState,
  files,
  setAppState,
  elements,
  canvas,
  onLockToggle,
  onHandToolToggle,
  onPenModeToggle,
  showExitZenModeBtn,
  renderTopLeftUI,
  renderTopRightUI,
  renderCustomStats,
  UIOptions,
  onExportImage,
  renderWelcomeScreen,
  children,
  app,
  isCollaborating,
  generateLinkForSelection,
  shareModePermissions,
}: LayerUIProps) => {
  const editorInterface = useEditorInterface();
  const stylesPanelMode = useStylesPanelMode();
  const isCompactStylesPanel = stylesPanelMode === "compact";
  const tunnels = useInitializeTunnels();

  const isMainMenuVisible = shareModePermissions?.mainMenu?.visible ?? true;
  const isSidebarVisible = shareModePermissions?.sidebar?.visible ?? true;

  const isSidebarDocked = useAtomValue(isSidebarDockedAtom);

  const spacing = isCompactStylesPanel
    ? {
      menuTopGap: 4,
      toolbarColGap: 4,
      toolbarRowGap: 1,
      toolbarInnerRowGap: 0.5,
      islandPadding: 1,
      collabMarginLeft: 8,
    }
    : {
      menuTopGap: 6,
      toolbarColGap: 4,
      toolbarRowGap: 1,
      toolbarInnerRowGap: 1,
      islandPadding: 1,
      collabMarginLeft: 8,
    };

  const renderSidebars = () => {
    if (!isSidebarVisible) return null;
    return (
      <DefaultSidebar
        __fallback
        onDock={(docked) => {
          trackEvent(
            "sidebar",
            docked ? "dock" : "undock",
            "default-sidebar",
          );
        }}
      />
    );
  };

  const TunnelsJotaiProvider = tunnels.tunnelsJotai.Provider;

  // 吸管工具已禁用：保留状态以便后续恢复
  // const [eyeDropperState, setEyeDropperState] = useAtom(activeEyeDropperAtom);

  const renderJSONExportDialog = () => {
    if (!UIOptions.canvasActions.export) {
      return null;
    }

    return (
      <JSONExportDialog
        elements={elements}
        appState={appState}
        files={files}
        actionManager={actionManager}
        exportOpts={UIOptions.canvasActions.export}
        canvas={canvas}
        setAppState={setAppState}
      />
    );
  };

  const renderImageExportDialog = () => {
    if (
      !UIOptions.canvasActions.saveAsImage ||
      appState.openDialog?.name !== "imageExport"
    ) {
      return null;
    }

    return (
      <ImageExportDialog
        elements={elements}
        appState={appState}
        files={files}
        actionManager={actionManager}
        onExportImage={onExportImage}
        onCloseRequest={() => setAppState({ openDialog: null })}
        name={app.getName()}
      />
    );
  };

  const renderCanvasActions = () => (
    <div style={{ position: "relative" }}>
      {/* wrapping to Fragment stops React from occasionally complaining
                about identical Keys */}
      {isMainMenuVisible && <tunnels.MainMenuTunnel.Out />}
      {renderWelcomeScreen && <tunnels.WelcomeScreenMenuHintTunnel.Out />}
    </div>
  );

  const renderSelectedShapeActions = () => {
    const isCompactMode = isCompactStylesPanel;

    return (
      <Section
        heading="selectedShapeActions"
        className={clsx("selected-shape-actions zen-mode-transition", {
          "transition-left": appState.zenModeEnabled,
        })}
      >
        {isCompactMode ? (
          <Island
            className={clsx("compact-shape-actions-island")}
            padding={0}
            style={{
              // we want to make sure this doesn't overflow so subtracting the
              // approximate height of hamburgerMenu + footer
              maxHeight: `${appState.height - 166}px`,
            }}
          >
            <CompactShapeActions
              appState={appState}
              elementsMap={app.scene.getNonDeletedElementsMap()}
              renderAction={actionManager.renderAction}
              app={app}
              setAppState={setAppState}
            />
          </Island>
        ) : (
          <Island
            className={CLASSES.SHAPE_ACTIONS_MENU}
            padding={2}
            style={{
              // we want to make sure this doesn't overflow so subtracting the
              // approximate height of hamburgerMenu + footer
              maxHeight: `${appState.height - 166}px`,
            }}
          >
            <SelectedShapeActions
              appState={appState}
              elementsMap={app.scene.getNonDeletedElementsMap()}
              renderAction={actionManager.renderAction}
              app={app}
            />
          </Island>
        )}
      </Section>
    );
  };

  const renderFixedSideContainer = () => {
    const shouldRenderSelectedShapeActions = showSelectedShapeActions(
      appState,
      elements,
    );

    const shouldShowStats =
      appState.stats.open &&
      !appState.zenModeEnabled &&
      !appState.viewModeEnabled &&
      appState.openDialog?.name !== "elementLinkSelector";

    return (
      <FixedSideContainer side="top">
        <div className="App-menu App-menu_top">
          <Stack.Col
            gap={spacing.menuTopGap}
            className={clsx("App-menu_top__left")}
          >
            {renderCanvasActions()}

            <div
              className={clsx("selected-shape-actions-container", {
                "selected-shape-actions-container--compact":
                  isCompactStylesPanel,
              })}
            >
              {/* 左侧属性面板已隐藏，使用右侧 PropertiesMenu 替代 */}
              {false && shouldRenderSelectedShapeActions && renderSelectedShapeActions()}
            </div>
          </Stack.Col>
          {!appState.viewModeEnabled &&
            appState.openDialog?.name !== "elementLinkSelector" && (
              <Section heading="shapes" className="shapes-section">
                {(heading: React.ReactNode) => (
                  <div style={{ position: "relative" }}>
                    {renderWelcomeScreen && (
                      <tunnels.WelcomeScreenToolbarHintTunnel.Out />
                    )}
                    <Stack.Col gap={spacing.toolbarColGap} align="start">
                      <Stack.Row
                        gap={spacing.toolbarRowGap}
                        className={clsx("App-toolbar-container", {
                          "zen-mode": appState.zenModeEnabled,
                        })}
                      >
                        <Island
                          padding={spacing.islandPadding}
                          className={clsx("App-toolbar", {
                            "zen-mode": appState.zenModeEnabled,
                            "App-toolbar--compact": isCompactStylesPanel,
                          })}
                        >
                          <HintViewer
                            appState={appState}
                            isMobile={editorInterface.formFactor === "phone"}
                            editorInterface={editorInterface}
                            app={app}
                          />
                          {heading}
                          <Stack.Row gap={spacing.toolbarInnerRowGap}>
                            <PenModeButton
                              zenModeEnabled={appState.zenModeEnabled}
                              checked={appState.penMode}
                              onChange={() => onPenModeToggle(null)}
                              title={t("toolBar.penMode")}
                              penDetected={appState.penDetected}
                            />
                            <LockButton
                              checked={appState.activeTool.locked}
                              onChange={onLockToggle}
                              title={t("toolBar.lock")}
                            />

                            <div className="App-toolbar__divider" />

                            <SelectionTool
                              app={app}
                              appState={appState}
                              setAppState={setAppState}
                              isCompactStylesPanel={isCompactStylesPanel}
                            />

                            <HandButton
                              checked={isHandToolActive(appState)}
                              onChange={() => onHandToolToggle()}
                              title={t("toolBar.hand")}
                            />

                            {(() => {
                              const freedrawTool = getToolbarTools(app).find(
                                (tool) => tool.value === "freedraw",
                              );
                              if (!freedrawTool) {
                                return null;
                              }
                              const { icon, key, numericKey } = freedrawTool;
                              const label = t("toolBar.freedraw");
                              const letter =
                                key &&
                                capitalizeString(
                                  typeof key === "string" ? key : key[0],
                                );
                              const shortcut = letter
                                ? `${letter} ${t("helpDialog.or")} ${numericKey}`
                                : `${numericKey}`;
                              return (
                                <ToolButton
                                  className="Shape"
                                  type="radio"
                                  icon={icon}
                                  checked={appState.activeTool.type === "freedraw"}
                                  name="editor-current-shape"
                                  title={`${capitalizeString(label)} — ${shortcut}`}
                                  keyBindingLabel={numericKey || letter}
                                  aria-label={capitalizeString(label)}
                                  aria-keyshortcuts={shortcut}
                                  data-testid="toolbar-freedraw"
                                  onPointerDown={({ pointerType }) => {
                                    if (!app.state.penDetected && pointerType === "pen") {
                                      app.togglePenMode(true);
                                    }
                                  }}
                                  onChange={() => {
                                    if (appState.activeTool.type !== "freedraw") {
                                      trackEvent("toolbar", "freedraw", "ui");
                                    }
                                    app.setActiveTool({ type: "freedraw" });
                                  }}
                                />
                              );
                            })()}

                            {(() => {
                              const eraserTool = getToolbarTools(app).find(
                                (tool) => tool.value === "eraser",
                              );
                              if (!eraserTool) {
                                return null;
                              }
                              const { icon, key, numericKey } = eraserTool;
                              const label = t("toolBar.eraser");
                              const letter =
                                key &&
                                capitalizeString(
                                  typeof key === "string" ? key : key[0],
                                );
                              const shortcut = letter
                                ? `${letter} ${t("helpDialog.or")} ${numericKey}`
                                : `${numericKey}`;
                              return (
                                <ToolButton
                                  className="Shape"
                                  type="radio"
                                  icon={icon}
                                  checked={appState.activeTool.type === "eraser"}
                                  name="editor-current-shape"
                                  title={`${capitalizeString(label)} — ${shortcut}`}
                                  keyBindingLabel={numericKey || letter}
                                  aria-label={capitalizeString(label)}
                                  aria-keyshortcuts={shortcut}
                                  data-testid="toolbar-eraser"
                                  onPointerDown={({ pointerType }) => {
                                    if (!app.state.penDetected && pointerType === "pen") {
                                      app.togglePenMode(true);
                                    }
                                  }}
                                  onChange={() => {
                                    if (appState.activeTool.type !== "eraser") {
                                      trackEvent("toolbar", "eraser", "ui");
                                    }
                                    app.setActiveTool({ type: "eraser" });
                                  }}
                                />
                              );
                            })()}

                            {(() => {
                              const textTool = getToolbarTools(app).find(
                                (tool) => tool.value === "text",
                              );
                              if (!textTool) {
                                return null;
                              }
                              const { icon, key, numericKey } = textTool;
                              const label = t("toolBar.text");
                              const letter =
                                key &&
                                capitalizeString(
                                  typeof key === "string" ? key : key[0],
                                );
                              const shortcut = letter
                                ? `${letter} ${t("helpDialog.or")} ${numericKey}`
                                : `${numericKey}`;
                              return (
                                <ToolButton
                                  className="Shape"
                                  type="radio"
                                  icon={icon}
                                  checked={appState.activeTool.type === "text"}
                                  name="editor-current-shape"
                                  title={`${capitalizeString(label)} — ${shortcut}`}
                                  keyBindingLabel={numericKey || letter}
                                  aria-label={capitalizeString(label)}
                                  aria-keyshortcuts={shortcut}
                                  data-testid="toolbar-text"
                                  onPointerDown={({ pointerType }) => {
                                    if (!app.state.penDetected && pointerType === "pen") {
                                      app.togglePenMode(true);
                                    }
                                  }}
                                  onChange={() => {
                                    if (appState.activeTool.type !== "text") {
                                      trackEvent("toolbar", "text", "ui");
                                    }
                                    app.setActiveTool({ type: "text" });
                                  }}
                                />
                              );
                            })()}
                            <ShapesSwitcher
                              setAppState={setAppState}
                              activeTool={appState.activeTool}
                              UIOptions={UIOptions}
                              app={app}
                            />
                          </Stack.Row>
                        </Island>
                        {isCollaborating && (
                          <Island
                            style={{
                              marginLeft: spacing.collabMarginLeft,
                              alignSelf: "center",
                              height: "fit-content",
                            }}
                          >
                            <LaserPointerButton
                              title={t("toolBar.laser")}
                              checked={
                                appState.activeTool.type === TOOL_TYPE.laser
                              }
                              onChange={() =>
                                app.setActiveTool({ type: TOOL_TYPE.laser })
                              }
                              isMobile
                            />
                          </Island>
                        )}
                      </Stack.Row>
                    </Stack.Col>
                  </div>
                )}
              </Section>
            )}
          <div
            className={clsx(
              "layer-ui__wrapper__top-right zen-mode-transition",
              {
                "transition-right": appState.zenModeEnabled,
                "layer-ui__wrapper__top-right--compact": isCompactStylesPanel,
              },
            )}
          >
            {appState.collaborators.size > 0 && (
              <UserList
                collaborators={appState.collaborators}
                userToFollow={appState.userToFollow?.socketId || null}
              />
            )}
            {renderTopRightUI?.(
              editorInterface.formFactor === "phone",
              appState,
            )}
            {!appState.viewModeEnabled &&
              appState.openDialog?.name !== "elementLinkSelector" &&
              // hide button when sidebar docked
              isSidebarVisible &&
              (!isSidebarDocked ||
                appState.openSidebar?.name !== DEFAULT_SIDEBAR.name) && (
                <tunnels.DefaultSidebarTriggerTunnel.Out />
              )}
            {shouldShowStats && (
              <Stats
                app={app}
                onClose={() => {
                  actionManager.executeAction(actionToggleStats);
                }}
                renderCustomStats={renderCustomStats}
              />
            )}
          </div>
        </div>
      </FixedSideContainer>
    );
  };

  const layerUIJSX = appState.presentationMode ? null : (
    <>
      {/* ------------------------- tunneled UI ---------------------------- */}
      {/* make sure we render host app components first so that we can detect
          them first on initial render to optimize layout shift */}
      {children}
      {/* render component fallbacks. Can be rendered anywhere as they'll be
          tunneled away. We only render tunneled components that actually
        have defaults when host do not render anything. */}
      {isMainMenuVisible && <DefaultMainMenu UIOptions={UIOptions} role={role} />}
      {isSidebarVisible && (
        <DefaultSidebar.Trigger
          __fallback
          icon={sidebarRightIcon}
          title={capitalizeString(t("toolBar.library"))}
        />
      )}
      <DefaultOverwriteConfirmDialog />
      {appState.openDialog?.name === "ttd" && <TTDDialog __fallback />}
      {/* ------------------------------------------------------------------ */}

      {appState.isLoading && <LoadingMessage delay={250} />}
      {appState.errorMessage && (
        <ErrorDialog onClose={() => setAppState({ errorMessage: null })}>
          {appState.errorMessage}
        </ErrorDialog>
      )}
      {/* 吸管工具已禁用：保留渲染逻辑以便后续恢复 */}
      {/* {eyeDropperState && editorInterface.formFactor !== "phone" && (
        <EyeDropper
          colorPickerType={eyeDropperState.colorPickerType}
          onCancel={() => {
            setEyeDropperState(null);
          }}
          onChange={(colorPickerType, color, selectedElements, { altKey }) => {
            if (
              colorPickerType !== "elementBackground" &&
              colorPickerType !== "elementStroke"
            ) {
              return;
            }

            if (selectedElements.length) {
              for (const element of selectedElements) {
                mutateElement(element, arrayToMap(elements), {
                  [altKey && eyeDropperState.swapPreviewOnAlt
                    ? colorPickerType === "elementBackground"
                      ? "strokeColor"
                      : "backgroundColor"
                    : colorPickerType === "elementBackground"
                      ? "backgroundColor"
                      : "strokeColor"]: color,
                });
                ShapeCache.delete(element);
              }
              app.scene.triggerUpdate();
            } else if (colorPickerType === "elementBackground") {
              setAppState({
                currentItemBackgroundColor: color,
              });
            } else {
              setAppState({ currentItemStrokeColor: color });
            }
          }}
          onSelect={(color, event) => {
            setEyeDropperState((state) => {
              return state?.keepOpenOnAlt && event.altKey ? state : null;
            });
            eyeDropperState?.onSelect?.(color, event);
          }}
        />
      )} */}
      {appState.openDialog?.name === "help" && (
        <HelpDialog
          onClose={() => {
            setAppState({ openDialog: null });
          }}
        />
      )}
      <ActiveConfirmDialog />
      {appState.openDialog?.name === "elementLinkSelector" && (
        <ElementLinkDialog
          sourceElementId={appState.openDialog.sourceElementId}
          onClose={() => {
            setAppState({
              openDialog: null,
            });
          }}
          scene={app.scene}
          appState={appState}
          generateLinkForSelection={generateLinkForSelection}
        />
      )}
      <tunnels.OverwriteConfirmDialogTunnel.Out />
      {renderImageExportDialog()}
      {renderJSONExportDialog()}
      {appState.pasteDialog.shown && (
        <PasteChartDialog
          setAppState={setAppState}
          appState={appState}
          onClose={() =>
            setAppState({
              pasteDialog: { shown: false, data: null },
            })
          }
        />
      )}
      {editorInterface.formFactor === "phone" && (
        <MobileMenu
          app={app}
          appState={appState}
          elements={elements}
          actionManager={actionManager}
          renderJSONExportDialog={renderJSONExportDialog}
          renderImageExportDialog={renderImageExportDialog}
          setAppState={setAppState}
          onHandToolToggle={onHandToolToggle}
          onPenModeToggle={onPenModeToggle}
          renderTopLeftUI={renderTopLeftUI}
          renderTopRightUI={renderTopRightUI}
          renderSidebars={renderSidebars}
          renderWelcomeScreen={renderWelcomeScreen}
          UIOptions={UIOptions}
        />
      )}
      {editorInterface.formFactor !== "phone" && (
        <>
          <div
            className="layer-ui__wrapper"
            style={
              appState.openSidebar &&
                isSidebarDocked &&
                editorInterface.canFitSidebar
                ? { width: `calc(100% - var(--right-sidebar-width))` }
                : {}
            }
          >
            {renderWelcomeScreen && <tunnels.WelcomeScreenCenterTunnel.Out />}
            {renderFixedSideContainer()}
            <Footer
              appState={appState}
              actionManager={actionManager}
              showExitZenModeBtn={showExitZenModeBtn}
              renderWelcomeScreen={renderWelcomeScreen}
              onPresent={(mode) => {
                let presenterWindow: Window | null = null;
                if (mode === "presenter") {
                  // 在用户点击手势中打开窗口，避免被浏览器拦截
                  presenterWindow = window.open(
                    "",
                    "presenter-view",
                    "width=520,height=740",
                  );
                  // 尽量保持焦点在当前窗口
                  if (presenterWindow) {
                    try {
                      presenterWindow.blur();
                      window.focus();
                    } catch {
                      // 某些浏览器可能不允许，忽略
                    }
                  }
                }

                if (app.excalidrawContainerRef.current) {
                  try {
                    const maybePromise =
                      app.excalidrawContainerRef.current.requestFullscreen();
                    // 某些浏览器会返回 Promise
                    if (maybePromise && typeof (maybePromise as any).catch === "function") {
                      (maybePromise as Promise<void>).catch(() => {
                        // 忽略全屏权限错误，保持演示流程
                      });
                    }
                  } catch (err) {
                    // 忽略权限失败，继续后续逻辑
                  }
                }
                setAppState({
                  presentationMode: true,
                  presentationSlideIndex: 0,
                  presentationStep: 0,
                } as any);
                const event = new CustomEvent("excalidraw:startPresentation", {
                  detail: { mode, presenterWindow },
                  bubbles: true,
                });
                document.dispatchEvent(event);
              }}
            />
            {appState.scrolledOutside && (
              <button
                type="button"
                className="scroll-back-to-content"
                onClick={() => {
                  setAppState((appState) => ({
                    ...calculateScrollCenter(elements, appState),
                  }));
                }}
              >
                {t("buttons.scrollBackToContent")}
              </button>
            )}
          </div>
          {renderSidebars()}
        </>
      )}
    </>
  );

  return (
    <UIAppStateContext.Provider value={appState}>
      <RoleContext.Provider value={role}>
        <ShareModeContext.Provider value={shareModePermissions}>
          <TunnelsJotaiProvider>
            <TunnelsContext.Provider value={tunnels}>
              {layerUIJSX}
            </TunnelsContext.Provider>
          </TunnelsJotaiProvider>
        </ShareModeContext.Provider>
      </RoleContext.Provider>
    </UIAppStateContext.Provider>
  );
};

const stripIrrelevantAppStateProps = (appState: AppState): UIAppState => {
  const { startBoundElement, cursorButton, scrollX, scrollY, ...ret } =
    appState;
  return ret;
};

const areEqual = (prevProps: LayerUIProps, nextProps: LayerUIProps) => {
  // short-circuit early
  if (prevProps.children !== nextProps.children) {
    return false;
  }

  const { canvas: _pC, appState: prevAppState, ...prev } = prevProps;
  const { canvas: _nC, appState: nextAppState, ...next } = nextProps;

  return (
    isShallowEqual(
      // asserting AppState because we're being passed the whole AppState
      // but resolve to only the UI-relevant props
      stripIrrelevantAppStateProps(prevAppState as AppState),
      stripIrrelevantAppStateProps(nextAppState as AppState),
      {
        selectedElementIds: isShallowEqual,
        selectedGroupIds: isShallowEqual,
      },
    ) && isShallowEqual(prev, next)
  );
};

export default React.memo(LayerUI, areEqual);
