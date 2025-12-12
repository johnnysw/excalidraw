import { CODES, KEYS } from "@excalidraw/common";

import { CaptureUpdateAction } from "@excalidraw/element";

import { boltIcon } from "../components/icons";

import { register } from "./register";

export const actionToggleSnapHaptics = register({
  name: "snapHaptics",
  label: "buttons.snapHaptics",
  icon: boltIcon,
  viewMode: false,
  trackEvent: {
    category: "canvas",
    predicate: (appState) => !appState.snapHapticsEnabled,
  },
  perform(elements, appState) {
    return {
      appState: {
        ...appState,
        snapHapticsEnabled: !this.checked!(appState),
      },
      captureUpdate: CaptureUpdateAction.EVENTUALLY,
    };
  },
  checked: (appState) => appState.snapHapticsEnabled,
  predicate: (elements, appState, appProps) => {
    return typeof appProps.snapHapticsEnabled === "undefined";
  },
  keyTest: (event) =>
    !event[KEYS.CTRL_OR_CMD] && event.altKey && event.code === CODES.D,
});
