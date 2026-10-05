import {
  addElementsToFrame,
  deepCopyElement,
  isCursorInFrame,
  isElementInFrame,
  Scene,
  updateFrameMembershipOfSelectedElements,
} from "@excalidraw/element";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppClassProperties, AppState } from "../types";

/** Native frame helpers mutate records; use an owned scene until the atomic commit. */
export function updateMindmapFrameMembership(
  elements: readonly ExcalidrawElement[],
  movedIds: ReadonlySet<string>,
  point: { x: number; y: number },
  state: AppState,
  app: AppClassProperties,
) {
  const scene = new Scene(elements.map(deepCopyElement), {
    skipValidation: true,
  });
  try {
    const prepared = scene.getElementsMapIncludingDeleted();
    const frame =
      scene
        .getNonDeletedFramesLikes()
        .filter(
          (candidate) =>
            !candidate.locked &&
            isCursorInFrame(point, candidate, scene.getNonDeletedElementsMap()),
        )
        .at(-1) ?? null;
    const frameState: AppState = {
      ...state,
      selectedElementIds: Object.fromEntries(
        [...movedIds].map((id) => [id, true]),
      ),
      selectedElementsAreBeingDragged: true,
      frameToHighlight: frame,
      editingGroupId: null,
    };
    if (frame) {
      const adding = [...movedIds].flatMap((id) => {
        const element = scene.getNonDeletedElement(id);
        return element &&
          element.frameId !== frame.id &&
          isElementInFrame(element, prepared, frameState)
          ? [element]
          : [];
      });
      addElementsToFrame(prepared, adding, frame, frameState);
    }
    const frameApp = Object.create(app) as AppClassProperties;
    frameApp.scene = scene;
    updateFrameMembershipOfSelectedElements(prepared, frameState, frameApp);
    return [...prepared.values()];
  } finally {
    scene.destroy();
  }
}
