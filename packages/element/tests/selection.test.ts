import { makeNextSelectedElementIds } from "../src/selection";
import { Scene } from "../src/Scene";
import { newElement } from "../src/newElement";

describe("makeNextSelectedElementIds", () => {
  const _makeNextSelectedElementIds = (
    selectedElementIds: { [id: string]: true },
    prevSelectedElementIds: { [id: string]: true },
    expectUpdated: boolean,
  ) => {
    const ret = makeNextSelectedElementIds(selectedElementIds, {
      selectedElementIds: prevSelectedElementIds,
    });
    expect(ret === selectedElementIds).toBe(expectUpdated);
  };
  it("should return prevState selectedElementIds if no change", () => {
    _makeNextSelectedElementIds({}, {}, false);
    _makeNextSelectedElementIds({ 1: true }, { 1: true }, false);
    _makeNextSelectedElementIds(
      { 1: true, 2: true },
      { 1: true, 2: true },
      false,
    );
  });
  it("should return new selectedElementIds if changed", () => {
    // _makeNextSelectedElementIds({ 1: true }, { 1: false }, true);
    _makeNextSelectedElementIds({ 1: true }, {}, true);
    _makeNextSelectedElementIds({}, { 1: true }, true);
    _makeNextSelectedElementIds({ 1: true }, { 2: true }, true);
    _makeNextSelectedElementIds({ 1: true }, { 1: true, 2: true }, true);
    _makeNextSelectedElementIds(
      { 1: true, 2: true },
      { 1: true, 3: true },
      true,
    );
  });
});

describe("Scene.getSelectedElements", () => {
  it("does not scan scene elements when the selection is empty", () => {
    const scene = new Scene([
      newElement({ type: "rectangle", x: 0, y: 0 }),
      newElement({ type: "rectangle", x: 100, y: 100 }),
    ]);
    const elements = new Proxy(scene.getNonDeletedElements(), {
      get(target, property, receiver) {
        if (property === "filter" || property === Symbol.iterator) {
          throw new Error("scene elements should not be scanned");
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(
      scene.getSelectedElements({
        selectedElementIds: {},
        elements,
      }),
    ).toEqual([]);
  });
});
