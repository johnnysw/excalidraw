import clsx from "clsx";

import { actionShortcuts } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { ExitZenModeButton, UndoRedoActions, ZoomActions } from "../Actions";
import { HelpButton } from "../HelpButton";
import { Section } from "../Section";
import Stack from "../Stack";

import type { ActionManager } from "../../actions/manager";
import type { UIAppState } from "../../types";

import PresentationMenuButton from "../PresentationMenuButton";
import CoursewareSelectionTools from "../CoursewareSelectionTools";

import type { AppClassProperties, AppProps, AppState } from "../../types";

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
      className={clsx(
        "layer-ui__wrapper__footer App-menu App-menu_bottom",
        { "App-menu_bottom--courseware": isLeftToolbar },
      )}
    >
      {!isLeftToolbar && (
        <div
          className={clsx("layer-ui__wrapper__footer-left zen-mode-transition", {
            "layer-ui__wrapper__footer-left--transition-left":
              appState.zenModeEnabled,
          })}
        >
          <Stack.Col gap={2}>
            <Section heading="canvasActions">
              <ZoomActions
                renderAction={actionManager.renderAction}
                zoom={appState.zoom}
              />

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
      )}
      <FooterCenterTunnel.Out />
      <div
        className={clsx("layer-ui__wrapper__footer-right zen-mode-transition", {
          "transition-right": appState.zenModeEnabled,
        })}
      >
        {isLeftToolbar && (
          <Section heading="canvasActions" className="Courseware-canvas-actions">
            <UndoRedoActions renderAction={actionManager.renderAction} />
            <div className="Courseware-navigation-controls">
              <CoursewareSelectionTools
                app={app}
                appState={appState}
                setAppState={setAppState}
                UIOptions={UIOptions}
                onHandToolToggle={onHandToolToggle}
              />
              {(UIOptions.tools?.selection !== false || UIOptions.tools?.lasso !== false || UIOptions.tools?.hand !== false) && (
                <div className="Courseware-navigation-controls__separator" aria-hidden="true" />
              )}
              <ZoomActions
                renderAction={actionManager.renderAction}
                zoom={appState.zoom}
              />
            </div>
          </Section>
        )}
        <div
          className={isLeftToolbar ? "Courseware-footer__auxiliary" : undefined}
          style={{ position: "relative", display: "flex", gap: "8px" }}
        >
          {!isLeftToolbar && (
            <PresentationMenuButton
              canPresent={canPresent}
              viewModeEnabled={appState.viewModeEnabled}
              onPresent={onPresent}
            />
          )}
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
