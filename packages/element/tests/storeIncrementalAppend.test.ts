import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type {
  OrderedExcalidrawElement,
  SceneElementsMap,
} from "@excalidraw/element/types";

import { newElementWith } from "../src/mutateElement";
import { StoreChange, StoreSnapshot } from "../src/store";

describe("StoreSnapshot incremental append", () => {
  it("shares the element map for a precomputed append delta", () => {
    const initial = API.createElement({ type: "rectangle", x: 0, y: 0 });
    const appended = API.createElement({ type: "freedraw", x: 20, y: 20 });
    const elements = new Map([[initial.id, initial]]) as SceneElementsMap;
    const snapshot = StoreSnapshot.create(
      elements,
      StoreSnapshot.empty().appState,
    );

    const nextSnapshot = snapshot.applyChange(
      StoreChange.createAppend(
        appended as OrderedExcalidrawElement,
        {},
      ),
    );

    expect(nextSnapshot.elements).toBe(snapshot.elements);
    expect(nextSnapshot.elements.get(initial.id)).toBe(initial);
    expect(nextSnapshot.elements.get(appended.id)).toBe(appended);
  });

  it("keeps the immutable map path for general element changes", () => {
    const initial = API.createElement({ type: "rectangle", x: 0, y: 0 });
    const elements = new Map([[initial.id, initial]]) as SceneElementsMap;
    const snapshot = StoreSnapshot.create(
      elements,
      StoreSnapshot.empty().appState,
    );
    const updated = newElementWith(initial, { x: 100 });

    const nextSnapshot = snapshot.applyChange(
      StoreChange.createDirect(
        { [updated.id]: updated as OrderedExcalidrawElement },
        {},
      ),
    );

    expect(nextSnapshot.elements).not.toBe(snapshot.elements);
    expect(snapshot.elements.get(initial.id)).toBe(initial);
    expect(nextSnapshot.elements.get(updated.id)).toBe(updated);
  });
});
