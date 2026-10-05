import { randomInteger, getUpdatedTimestamp } from "@excalidraw/common";
import type { ExcalidrawElement } from "./types";
import type { ElementUpdate } from "./mutateElement";

export const newElementWith = <TElement extends ExcalidrawElement>(
  element: TElement,
  updates: ElementUpdate<TElement>,
  /** pass `true` to always regenerate */
  force = false,
): TElement => {
  let didChange = false;
  for (const key in updates) {
    const value = (updates as any)[key];
    if (typeof value !== "undefined") {
      if (
        (element as any)[key] === value &&
        // if object, always update because its attrs could have changed
        (typeof value !== "object" || value === null)
      ) {
        continue;
      }
      didChange = true;
    }
  }

  if (!didChange && !force) {
    return element;
  }

  return {
    ...element,
    ...updates,
    version: updates.version ?? element.version + 1,
    versionNonce: updates.versionNonce ?? randomInteger(),
    updated: getUpdatedTimestamp(),
  };
};
