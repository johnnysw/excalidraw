import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import { actionShortcuts } from "../../actions";
import { useTunnels } from "../../context/tunnels";
import { ExitZenModeButton, UndoRedoActions, ZoomActions } from "../Actions";
import { HelpButton } from "../HelpButton";
import { Section } from "../Section";
import Stack from "../Stack";

import type { ActionManager } from "../../actions/manager";
import type { UIAppState } from "../../types";

import { PlayIcon } from "../icons";

const Footer = ({
  appState,
  actionManager,
  showExitZenModeBtn,
  renderWelcomeScreen,
  onPresent,
}: {
  appState: UIAppState;
  actionManager: ActionManager;
  showExitZenModeBtn: boolean;
  renderWelcomeScreen: boolean;
  onPresent: (mode: "viewer" | "presenter") => void;
}) => {
  const { FooterCenterTunnel, WelcomeScreenHelpHintTunnel } = useTunnels();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        triggerRef.current &&
        !menuRef.current.contains(target) &&
        !triggerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <footer
      role="contentinfo"
      className="layer-ui__wrapper__footer App-menu App-menu_bottom"
    >
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
      <FooterCenterTunnel.Out />
      <div
        className={clsx("layer-ui__wrapper__footer-right zen-mode-transition", {
          "transition-right": appState.zenModeEnabled,
        })}
      >
        <div style={{ position: "relative", display: "flex", gap: "8px" }}>
          {!appState.viewModeEnabled && (
            <div style={{ position: "relative" }}>
              <button
                ref={triggerRef}
                className="App-menu__left-btn"
                onClick={() => setMenuOpen((open) => !open)}
                title="演示模式"
                style={{
                  background: "var(--color-surface-low)",
                  border: "1px solid var(--button-gray-1)",
                  borderRadius: "var(--border-radius-lg)",
                  cursor: "pointer",
                  padding: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                }}
              >
                <div style={{ width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {PlayIcon}
                </div>
              </button>

              {menuOpen && (
                <div
                  ref={menuRef}
                  style={{
                    position: "absolute",
                    right: 0,
                    bottom: "44px",
                    background: "var(--color-surface-low)",
                    border: "1px solid var(--button-gray-1)",
                    borderRadius: "12px",
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
                    overflow: "hidden",
                    minWidth: "140px",
                    zIndex: 10,
                  }}
                >
                  {[
                    { key: "viewer" as const, label: "普通视图" },
                    { key: "presenter" as const, label: "演讲者视图" },
                  ].map((item, index) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        onPresent(item.key);
                        setMenuOpen(false);
                      }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        color: "var(--button-text-color)",
                        borderBottom:
                          index === 0
                            ? "1px solid var(--button-gray-1)"
                            : "none",
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
