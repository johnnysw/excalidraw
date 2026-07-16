import {
  getOrderedFrames,
  getPresentationFrames,
  isFrameExcludedFromPresentation,
  isPresentationFrame,
  mergePresentationFrameOrder,
  newElement,
  newFrameElement,
  newMagicFrameElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  ExcalidrawMagicFrameElement,
} from "@excalidraw/element/types";

const createFrame = ({
  id,
  x = 0,
  y = 0,
  customData,
  isDeleted = false,
}: {
  id: string;
  x?: number;
  y?: number;
  customData?: ExcalidrawElement["customData"];
  isDeleted?: boolean;
}): ExcalidrawFrameElement => ({
  ...newFrameElement({ x, y, customData }),
  id,
  isDeleted,
});

const createMagicFrame = ({
  id,
  customData,
  isDeleted = false,
}: {
  id: string;
  customData?: ExcalidrawElement["customData"];
  isDeleted?: boolean;
}): ExcalidrawMagicFrameElement => ({
  ...newMagicFrameElement({ x: 0, y: 0, customData }),
  id,
  isDeleted,
});

describe("frame presentation helpers", () => {
  describe("isFrameExcludedFromPresentation", () => {
    it.each([
      ["missing custom data", undefined],
      ["false", { excludeFromPresentation: false }],
      ["non-boolean value", { excludeFromPresentation: 1 }],
    ])("includes a frame when the field is %s", (_label, customData) => {
      expect(
        isFrameExcludedFromPresentation(
          createFrame({ id: "frame", customData }),
        ),
      ).toBe(false);
    });

    it("excludes a frame only when the field is strictly true", () => {
      expect(
        isFrameExcludedFromPresentation(
          createFrame({
            id: "excluded",
            customData: { excludeFromPresentation: true },
          }),
        ),
      ).toBe(true);
    });

    it("does not exclude non-frame elements or magic frames", () => {
      const rectangle = {
        ...newElement({ type: "rectangle", x: 0, y: 0 }),
        customData: { excludeFromPresentation: true },
      };
      const magicFrame = createMagicFrame({
        id: "magic",
        customData: { excludeFromPresentation: true },
      });

      expect(isFrameExcludedFromPresentation(rectangle)).toBe(false);
      expect(isFrameExcludedFromPresentation(magicFrame)).toBe(false);
    });
  });

  describe("isPresentationFrame", () => {
    it("accepts only non-deleted ordinary frames that are not excluded", () => {
      const included = createFrame({ id: "included" });
      const excluded = createFrame({
        id: "excluded",
        customData: { excludeFromPresentation: true },
      });
      const deleted = createFrame({ id: "deleted", isDeleted: true });
      const magicFrame = createMagicFrame({ id: "magic" });

      expect(isPresentationFrame(included)).toBe(true);
      expect(isPresentationFrame(excluded)).toBe(false);
      expect(isPresentationFrame(deleted)).toBe(false);
      expect(isPresentationFrame(magicFrame)).toBe(false);
    });
  });

  describe("getOrderedFrames", () => {
    it("uses valid unique custom IDs before position-sorted fallback frames", () => {
      const custom = createFrame({ id: "custom", x: 500, y: 500 });
      const fallbackRight = createFrame({ id: "right", x: 200, y: 100 });
      const fallbackLeft = createFrame({ id: "left", x: 10, y: 105 });
      const deleted = createFrame({ id: "deleted", isDeleted: true });
      const magicFrame = createMagicFrame({ id: "magic" });
      const rectangle = newElement({ type: "rectangle", x: 0, y: 0 });

      expect(
        getOrderedFrames(
          [fallbackRight, deleted, magicFrame, custom, rectangle, fallbackLeft],
          ["unknown", custom.id, custom.id],
        ).map((frame) => frame.id),
      ).toEqual([custom.id, fallbackLeft.id, fallbackRight.id]);
    });

    it("returns the same anchored-row order for every input permutation", () => {
      const frameA = createFrame({ id: "frame-a", x: 100, y: 0 });
      const frameB = createFrame({ id: "frame-b", x: 0, y: 9 });
      const frameC = createFrame({ id: "frame-c", x: -100, y: 18 });
      const inputOrders = [
        [frameA, frameB, frameC],
        [frameA, frameC, frameB],
        [frameB, frameA, frameC],
        [frameB, frameC, frameA],
        [frameC, frameA, frameB],
        [frameC, frameB, frameA],
      ];

      for (const frames of inputOrders) {
        expect(getOrderedFrames(frames).map((frame) => frame.id)).toEqual([
          frameB.id,
          frameA.id,
          frameC.id,
        ]);
      }
    });
  });

  describe("getPresentationFrames", () => {
    it("filters excluded frames after applying the complete frame order", () => {
      const excluded = createFrame({
        id: "excluded",
        customData: { excludeFromPresentation: true },
      });
      const included = createFrame({ id: "included" });

      expect(
        getPresentationFrames(
          [included, excluded],
          [excluded.id, included.id],
        ).map((frame) => frame.id),
      ).toEqual([included.id]);
    });

    it("returns an empty list when all ordinary frames are excluded", () => {
      const first = createFrame({
        id: "first",
        customData: { excludeFromPresentation: true },
      });
      const second = createFrame({
        id: "second",
        customData: { excludeFromPresentation: true },
      });

      expect(getPresentationFrames([first, second])).toEqual([]);
    });
  });

  describe("mergePresentationFrameOrder", () => {
    it("replaces only presentation-frame slots and preserves hidden slots", () => {
      expect(
        mergePresentationFrameOrder(
          ["frame-a", "frame-b-hidden", "frame-c"],
          ["frame-c", "frame-a"],
        ),
      ).toEqual(["frame-c", "frame-b-hidden", "frame-a"]);
    });

    it("ignores unknown and duplicate reordered IDs without losing full order", () => {
      expect(
        mergePresentationFrameOrder(
          ["frame-a", "frame-b-hidden", "frame-c", "frame-d-hidden"],
          ["unknown", "frame-c", "frame-c", "frame-a"],
        ),
      ).toEqual(["frame-c", "frame-b-hidden", "frame-a", "frame-d-hidden"]);
    });

    it("preserves duplicate full-order IDs and their multiplicity", () => {
      const fullOrder = ["frame-a", "frame-b", "frame-a", "frame-c"];

      const mergedOrder = mergePresentationFrameOrder(fullOrder, [
        "frame-c",
        "frame-a",
      ]);

      expect(mergedOrder).toEqual(["frame-c", "frame-b", "frame-a", "frame-a"]);
      expect(mergedOrder).toHaveLength(fullOrder.length);
      expect([...mergedOrder].sort()).toEqual([...fullOrder].sort());
    });

    it("keeps IDs missing from the reordered list in the complete order", () => {
      expect(
        mergePresentationFrameOrder(
          ["frame-a", "frame-b", "frame-c", "frame-d"],
          ["frame-c", "frame-a"],
        ),
      ).toEqual(["frame-c", "frame-b", "frame-a", "frame-d"]);
    });
  });
});
