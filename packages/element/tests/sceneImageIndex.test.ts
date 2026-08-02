import {
  Scene,
  newElement,
  newElementWith,
  newImageElement,
} from "@excalidraw/element";

import type { FileId } from "@excalidraw/element/types";

const createImage = (fileId: string | null, x = 0) =>
  newImageElement({
    type: "image",
    x,
    y: 0,
    fileId: fileId as FileId | null,
  });

describe("Scene initialized image index", () => {
  it("indexes only non-deleted initialized images in scene order", () => {
    const first = createImage("first", 0);
    const uninitialized = createImage(null, 100);
    const deleted = newElementWith(createImage("deleted", 200), {
      isDeleted: true,
    });
    const last = createImage("last", 300);
    const scene = new Scene(
      [first, uninitialized, deleted, newElement({ type: "rectangle", x: 0, y: 0 }), last],
      { skipValidation: true },
    );

    expect(scene.getNonDeletedInitializedImageElements()).toEqual([
      first,
      last,
    ]);
  });

  it("updates the index for replace, append, delete, and restore", () => {
    const first = createImage("first");
    const appended = createImage("appended", 100);
    const scene = new Scene([first], { skipValidation: true });

    expect(
      scene.appendElementFromActionResult(appended, [first, appended]),
    ).toBe(true);
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([
      first,
      appended,
    ]);

    const deleted = newElementWith(first, { isDeleted: true });
    scene.replaceAllElements([deleted, appended], { skipValidation: true });
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([appended]);

    const restored = newElementWith(deleted, { isDeleted: false });
    scene.replaceAllElements([restored, appended], { skipValidation: true });
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([
      restored,
      appended,
    ]);
  });

  it("tracks image initialization mutations and clears on destroy", () => {
    const image = createImage(null);
    const scene = new Scene([image], { skipValidation: true });

    scene.mutateElement(image, { fileId: "initialized" as FileId });
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([image]);

    scene.mutateElement(image, { fileId: null });
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([]);

    scene.destroy();
    expect(scene.getNonDeletedInitializedImageElements()).toEqual([]);
  });
});
