import { FONT_FAMILY } from "@excalidraw/common";
import { newTextElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";

import { Fonts } from "./Fonts";

type FontCollectors = {
  getUniqueFamilies: (
    elements: readonly ExcalidrawElement[],
  ) => ExcalidrawTextElement["fontFamily"][];
  getCharsPerFamily: (
    elements: readonly ExcalidrawElement[],
  ) => Record<number, Set<string>>;
};

const collectors = Fonts as unknown as FontCollectors;

describe("rich text font collection", () => {
  const element = newTextElement({
    x: 0,
    y: 0,
    text: "A中🙂D",
    fontFamily: FONT_FAMILY.Helvetica,
    textStyleRanges: [
      {
        start: 1,
        end: 4,
        fontFamily: FONT_FAMILY.Cascadia,
      },
    ],
  });

  it("includes font families referenced only by local ranges", () => {
    expect(collectors.getUniqueFamilies([element])).toEqual([
      FONT_FAMILY.Helvetica,
      FONT_FAMILY.Cascadia,
    ]);
  });

  it("assigns UTF-16 source characters to their final run family", () => {
    const chars = collectors.getCharsPerFamily([element]);

    expect([...chars[FONT_FAMILY.Helvetica]]).toEqual(["A", "D"]);
    expect([...chars[FONT_FAMILY.Cascadia]]).toEqual(["中", "🙂"]);
  });
});
