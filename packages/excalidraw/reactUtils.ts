/**
 * @param func handler taking at most single parameter (event).
 */

import { version as ReactVersion } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { isDevEnv, throttleRAF } from "@excalidraw/common";

export const withBatchedUpdates = <
  TFunction extends ((event: any) => void) | (() => void),
>(
  func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never,
) =>
  ((event) => {
    unstable_batchedUpdates(func as TFunction, event);
  }) as TFunction;

/**
 * barches React state updates and throttles the calls to a single call per
 * animation frame
 */
export const withBatchedUpdatesThrottled = <
  TFunction extends ((event: any) => void) | (() => void),
>(
  func: Parameters<TFunction>["length"] extends 0 | 1 ? TFunction : never,
) => {
  // @ts-ignore
  return throttleRAF<Parameters<TFunction>>(((event) => {
    unstable_batchedUpdates(func, event);
  }) as TFunction);
};

export const isRenderThrottlingEnabled = (() => {
  // we don't want to throttle in react < 18 because of #5439 and it was
  // getting more complex to maintain the fix
  let IS_REACT_18_AND_UP: boolean;
  try {
    const version = ReactVersion.split(".");
    IS_REACT_18_AND_UP = Number(version[0]) > 17;
  } catch {
    IS_REACT_18_AND_UP = false;
  }

  let hasWarned = false;

  return () => {
    if (window.EXCALIDRAW_THROTTLE_RENDER === true) {
      if (!IS_REACT_18_AND_UP) {
        if (!hasWarned) {
          hasWarned = true;
          console.warn(
            "Excalidraw: render throttling is disabled on React versions < 18.",
          );
        }
        return false;
      }
      return true;
    }
    return false;
  };
})();

export const isFreedrawPerfV2Enabled = () =>
  window.EXCALIDRAW_FREEDRAW_PERF_V2 === true;

export const isRichTextV2Enabled = () =>
  window.EXCALIDRAW_RICH_TEXT_V2 === true;

export const isExcalidrawPerfDebugEnabled = () =>
  isDevEnv() && window.EXCALIDRAW_PERF_DEBUG === true;

export const markExcalidrawPerf = (
  name: string,
  detail?: Record<string, unknown>,
) => {
  if (!isExcalidrawPerfDebugEnabled()) {
    return;
  }

  try {
    performance.mark(`excalidraw:${name}`, { detail });
  } catch {
    // Older browsers may not support structured mark details.
    performance.mark(`excalidraw:${name}`);
  }
};

export const measureExcalidrawPerf = (
  name: string,
  startMark: string,
  endMark?: string,
) => {
  if (!isExcalidrawPerfDebugEnabled()) {
    return;
  }

  try {
    performance.measure(
      `excalidraw:${name}`,
      `excalidraw:${startMark}`,
      endMark ? `excalidraw:${endMark}` : undefined,
    );
  } catch {
    // Perf marks are best-effort diagnostics and must never affect drawing.
  }
};
