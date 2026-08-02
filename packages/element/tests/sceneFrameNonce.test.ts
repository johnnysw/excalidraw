import { Scene, newElement, newFrameElement } from "@excalidraw/element";

describe("Scene frame nonce", () => {
  it("stays stable when an ordinary element is appended", () => {
    const existing = newElement({ type: "rectangle", x: 0, y: 0 });
    const appended = newElement({ type: "rectangle", x: 100, y: 100 });
    const scene = new Scene([existing], { skipValidation: true });
    const framesNonce = scene.getFramesNonce();

    expect(
      scene.appendElementFromActionResult(appended, [existing, appended]),
    ).toBe(true);
    expect(scene.getFramesNonce()).toBe(framesNonce);
  });

  it("changes when a frame is appended", () => {
    const frame = newFrameElement({ x: 0, y: 0, width: 100, height: 100 });
    const scene = new Scene([], { skipValidation: true });
    const framesNonce = scene.getFramesNonce();

    expect(scene.appendElementFromActionResult(frame, [frame])).toBe(true);
    expect(scene.getFramesNonce()).toBe(framesNonce + 1);
  });

  it("changes when a frame is mutated", () => {
    const frame = newFrameElement({ x: 0, y: 0, width: 100, height: 100 });
    const scene = new Scene([frame], { skipValidation: true });
    const framesNonce = scene.getFramesNonce();

    scene.mutateElement(frame, { x: 20 });

    expect(scene.getFramesNonce()).toBe(framesNonce + 1);
  });
});
