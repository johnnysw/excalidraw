import clsx from "clsx";

import { KEYS } from "@excalidraw/common";

import { actionShortcuts } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { ExitZenModeButton, UndoRedoActions, ZoomActions } from "../Actions";
import { HelpButton } from "../HelpButton";
import { Section } from "../Section";
import Stack from "../Stack";

import PresentationMenuButton from "../PresentationMenuButton";
import { HandButton } from "../HandButton";
import { Tooltip } from "../Tooltip";
import { t } from "../../i18n";

import type { ActionManager } from "../../actions/manager";
import type { AppClassProperties, AppProps, AppState, UIAppState } from "../../types";

const Footer = ({
  appState,
  actionManager,
  showExitZenModeBtn,
  renderWelcomeScreen,
  isLeftToolbar,
  canPresent,
  onPresent,
  app,
  setAppState,
  UIOptions,
  onHandToolToggle,
}: {
  appState: UIAppState;
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
  renderWelcomeScreen: boolean;
  isLeftToolbar: boolean;
  canPresent: boolean;
  onPresent: (mode: "viewer" | "presenter") => void;
  app: AppClassProperties;
  setAppState: React.Component<any, AppState>["setState"];
  UIOptions: AppProps["UIOptions"];
  onHandToolToggle: () => void;
}) => {
  const { FooterCenterTunnel, WelcomeScreenHelpHintTunnel } = useTunnels();

  return (
    <footer
      role="contentinfo"
      className={clsx("layer-ui__wrapper__footer App-menu App-menu_bottom", {
        "App-menu_bottom--courseware": isLeftToolbar,
      })}
    >
      <div
        className={clsx("layer-ui__wrapper__footer-left zen-mode-transition", {
          "layer-ui__wrapper__footer-left--transition-left":
            appState.zenModeEnabled,
        })}
      >
        <Stack.Col gap={2}>
          <Section heading="canvasActions">
            {isLeftToolbar ? (
              <div
                className={clsx("Courseware-navigation-controls", {
                  "Courseware-navigation-controls--with-hand":
                    UIOptions.tools?.hand !== false,
                })}
              >
                <ZoomActions
                  renderAction={actionManager.renderAction}
                  zoom={appState.zoom}
                />
                {UIOptions.tools?.hand !== false && (
                  <Tooltip
                    label={`${t("toolBar.hand")} — ${KEYS.H}`}
                    position="top"
                  >
                    <HandButton
                      checked={appState.activeTool.type === "hand"}
                      onChange={onHandToolToggle}
                      title={t("toolBar.hand")}
                      showNativeTooltip={false}
                    />
                  </Tooltip>
                )}
              </div>
            ) : (
              <ZoomActions
                renderAction={actionManager.renderAction}
                zoom={appState.zoom}
              />
            )}

            {!appState.viewModeEnabled && (
              <UndoRedoActions
                renderAction={actionManager.renderAction}
                className={clsx("zen-mode-transition", {
                  "layer-ui__wrapper__footer-left--transition-bottom":
                    appState.zenModeEnabled,
                })}
              />
            )}
          </Section>
        </Stack.Col>
      </div>
      <FooterCenterTunnel.Out />
      <div
        className={clsx("layer-ui__wrapper__footer-right zen-mode-transition", {
          "transition-right": appState.zenModeEnabled,
        })}
      >
        <div
          className={isLeftToolbar ? "Courseware-footer__auxiliary" : undefined}
          style={{ position: "relative", display: "flex", gap: "8px" }}
        >
          <PresentationMenuButton
            portal={isLeftToolbar}
            open={
              isLeftToolbar ? appState.openPopup === "presentation" : undefined
            }
            onOpenChange={
              isLeftToolbar
                ? (open) => {
                    setAppState((state) =>
                      open
                        ? { openMenu: null, openPopup: "presentation" }
                        : state.openPopup === "presentation"
                        ? { openMenu: state.openMenu, openPopup: null }
                        : null,
                    );
                  }
                : undefined
            }
            onCloseAutoFocus={
              isLeftToolbar
                ? (event) => {
                    event.preventDefault();
                    const container = app.excalidrawContainerRef.current;
                    if (
                      !app.state.openMenu &&
                      !app.state.openPopup &&
                      !container?.querySelector(
                        '.Courseware-toolbar [aria-expanded="true"]',
                      )
                    ) {
                      container
                        ?.querySelector<HTMLButtonElement>(
                          '[data-testid="footer-presentation"]',
                        )
                        ?.focus({ preventScroll: true });
                    }
                  }
                : undefined
            }
            canPresent={canPresent}
            viewModeEnabled={appState.viewModeEnabled}
            onPresent={onPresent}
          />
          {renderWelcomeScreen && <WelcomeScreenHelpHintTunnel.Out />}
          <HelpButton
            onClick={() => actionManager.executeAction(actionShortcuts)}
          />
        </div>
      </div>
      <ExitZenModeButton
        actionManager={actionManager}
        showExitZenModeBtn={showExitZenModeBtn}
      />
    </footer>
  );
};

export default Footer;
Footer.displayName = "Footer";
