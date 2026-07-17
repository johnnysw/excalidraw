import {
  applyTextStyleRanges,
  applyTextStyleToRange,
  clearTextStyleProperty,
  normalizeTextStyleRanges,
  resolveSelectionTextStyle,
  resolveTextStyleAt,
  transformTextStyleRangesForEdit,
  scaleTextStyleRanges,
} from "./textStyleRanges";

import type { TextStyle } from "./textStyleRanges";
import type { TextStyleRange } from "./types";

const BASE_STYLE: TextStyle = {
  color: "#111111",
  fontSize: 20,
  fontFamily: 1,
  fontWeight: "normal",
  textOutlineColor: "transparent",
  textOutlineWidth: 0,
};

describe("normalizeTextStyleRanges", () => {
  it("resolves overlapping ranges per property in input order", () => {
    const ranges: TextStyleRange[] = [
      { start: 0, end: 6, color: "red", fontSize: 24 },
      { start: 2, end: 4, color: "blue", fontWeight: "bold" },
      {
        start: 3,
        end: 5,
        fontSize: BASE_STYLE.fontSize,
        textOutlineWidth: 2,
      },
    ];

    expect(normalizeTextStyleRanges(6, ranges, BASE_STYLE)).toEqual([
      { start: 0, end: 2, color: "red", fontSize: 24 },
      {
        start: 2,
        end: 3,
        color: "blue",
        fontSize: 24,
        fontWeight: "bold",
      },
      {
        start: 3,
        end: 4,
        color: "blue",
        fontWeight: "bold",
        textOutlineWidth: 2,
      },
      { start: 4, end: 5, color: "red", textOutlineWidth: 2 },
      { start: 5, end: 6, color: "red", fontSize: 24 },
    ]);
  });

  it("sorts, clamps, truncates, and drops invalid ranges", () => {
    const ranges: TextStyleRange[] = [
      { start: 3.9, end: Infinity, fontWeight: "bold" },
      { start: -4, end: 2.8, color: "red" },
      { start: 4, end: 1, color: "blue" },
      { start: 2, end: 2, fontSize: 30 },
    ];

    expect(normalizeTextStyleRanges(5, ranges, BASE_STYLE)).toEqual([
      { start: 0, end: 2, color: "red" },
      { start: 3, end: 5, fontWeight: "bold" },
    ]);
  });

  it("strips empty and default properties and merges equal neighbors", () => {
    const ranges: TextStyleRange[] = [
      { start: 0, end: 2, color: BASE_STYLE.color },
      { start: 2, end: 4 },
      { start: 4, end: 6, color: "red" },
      {
        start: 6,
        end: 8,
        color: "red",
        fontSize: BASE_STYLE.fontSize,
      },
    ];

    expect(normalizeTextStyleRanges(8, ranges, BASE_STYLE)).toEqual([
      { start: 4, end: 8, color: "red" },
    ]);
  });

  it("keeps original array order as overlap precedence", () => {
    const ranges: TextStyleRange[] = [
      { start: 2, end: 6, color: "blue" },
      { start: 0, end: 4, color: "red" },
    ];

    expect(normalizeTextStyleRanges(6, ranges, BASE_STYLE)).toEqual([
      { start: 0, end: 4, color: "red" },
      { start: 4, end: 6, color: "blue" },
    ]);
  });

  it("does not mutate the source ranges", () => {
    const ranges: TextStyleRange[] = [{ start: -1, end: 9, color: "red" }];

    normalizeTextStyleRanges(3, ranges, BASE_STYLE);

    expect(ranges).toEqual([{ start: -1, end: 9, color: "red" }]);
  });

  it("normalizes 1k canonical ranges with linear property access", () => {
    let propertyReads = 0;
    const ranges = Array.from(
      { length: 1000 },
      (_, index) =>
        new Proxy(
          {
            start: index * 10,
            end: index * 10 + 5,
            color: index % 2 === 0 ? "red" : "blue",
          },
          {
            get(target, property, receiver) {
              propertyReads++;
              return Reflect.get(target, property, receiver);
            },
          },
        ),
    );

    expect(normalizeTextStyleRanges(10_000, ranges, BASE_STYLE)).toHaveLength(
      1000,
    );
    expect(propertyReads).toBeLessThan(50_000);
  });
});

describe("style resolution", () => {
  const ranges: TextStyleRange[] = [
    { start: 0, end: 4, color: "red", fontSize: 28 },
    { start: 2, end: 4, color: "blue", fontWeight: "bold" },
    { start: 3, end: 4, fontSize: 20 },
  ];

  it("resolves all style properties at a UTF-16 index", () => {
    expect(resolveTextStyleAt(3, ranges, BASE_STYLE)).toEqual({
      ...BASE_STYLE,
      color: "blue",
      fontSize: 20,
      fontWeight: "bold",
    });
    expect(resolveTextStyleAt(-1, ranges, BASE_STYLE)).toEqual({
      ...BASE_STYLE,
      color: "red",
      fontSize: 28,
    });
  });

  it("reports each mixed selection property as null", () => {
    expect(resolveSelectionTextStyle(0, 4, ranges, BASE_STYLE)).toEqual({
      ...BASE_STYLE,
      color: null,
      fontSize: null,
      fontWeight: null,
    });
  });

  it("uses the left style for a collapsed selection and right style at zero", () => {
    expect(resolveSelectionTextStyle(2, 2, ranges, BASE_STYLE).color).toBe(
      "red",
    );
    expect(resolveSelectionTextStyle(0, 0, ranges, BASE_STYLE).color).toBe(
      "red",
    );
  });
});

describe("style property edits", () => {
  it("applies canonical range patches in a single sweep", () => {
    expect(
      applyTextStyleRanges(
        6,
        [{ start: 0, end: 6, color: "red", fontSize: 30 }],
        [
          { start: 1, end: 3, color: BASE_STYLE.color },
          { start: 3, end: 5, fontWeight: "bold" },
        ],
        BASE_STYLE,
      ),
    ).toEqual([
      { start: 0, end: 1, color: "red", fontSize: 30 },
      { start: 1, end: 3, fontSize: 30 },
      { start: 3, end: 5, color: "red", fontSize: 30, fontWeight: "bold" },
      { start: 5, end: 6, color: "red", fontSize: 30 },
    ]);
  });

  it("applies 1k canonical patches with linear property access", () => {
    let propertyReads = 0;
    const patches = Array.from(
      { length: 1000 },
      (_, index) =>
        new Proxy(
          {
            start: index * 10,
            end: index * 10 + 5,
            color: index % 2 === 0 ? "red" : "blue",
          },
          {
            get(target, property, receiver) {
              propertyReads++;
              return Reflect.get(target, property, receiver);
            },
          },
        ),
    );

    expect(
      applyTextStyleRanges(10_000, undefined, patches, BASE_STYLE),
    ).toHaveLength(1000);
    expect(propertyReads).toBeLessThan(50_000);
  });

  it("scales local font size and outline width without changing indices", () => {
    expect(
      scaleTextStyleRanges(
        [
          {
            start: 1,
            end: 3,
            color: "red",
            fontSize: 24,
            textOutlineWidth: 2,
          },
        ],
        0.5,
      ),
    ).toEqual([
      {
        start: 1,
        end: 3,
        color: "red",
        fontSize: 12,
        textOutlineWidth: 1,
      },
    ]);
  });

  it("applies a property while preserving all unrelated properties", () => {
    const ranges: TextStyleRange[] = [
      { start: 0, end: 6, color: "red", fontSize: 30 },
    ];

    expect(
      applyTextStyleToRange(
        6,
        ranges,
        2,
        4,
        { fontWeight: "bold" },
        BASE_STYLE,
      ),
    ).toEqual([
      { start: 0, end: 2, color: "red", fontSize: 30 },
      {
        start: 2,
        end: 4,
        color: "red",
        fontSize: 30,
        fontWeight: "bold",
      },
      { start: 4, end: 6, color: "red", fontSize: 30 },
    ]);
  });

  it("fills uncovered gaps without changing existing overrides", () => {
    const ranges: TextStyleRange[] = [{ start: 0, end: 2, color: "red" }];

    expect(
      applyTextStyleToRange(6, ranges, 1, 5, { fontSize: 30 }, BASE_STYLE),
    ).toEqual([
      { start: 0, end: 1, color: "red" },
      { start: 1, end: 2, color: "red", fontSize: 30 },
      { start: 2, end: 5, fontSize: 30 },
    ]);
  });

  it("clears only the requested property back to the base style", () => {
    const ranges: TextStyleRange[] = [
      {
        start: 0,
        end: 6,
        color: "red",
        fontSize: 30,
        fontWeight: "bold",
      },
    ];

    expect(
      clearTextStyleProperty(6, ranges, 2, 4, "fontSize", BASE_STYLE),
    ).toEqual([
      {
        start: 0,
        end: 2,
        color: "red",
        fontSize: 30,
        fontWeight: "bold",
      },
      { start: 2, end: 4, color: "red", fontWeight: "bold" },
      {
        start: 4,
        end: 6,
        color: "red",
        fontSize: 30,
        fontWeight: "bold",
      },
    ]);
  });

  it("treats an explicit undefined patch as a property clear", () => {
    expect(
      applyTextStyleToRange(
        4,
        [{ start: 0, end: 4, color: "red", fontSize: 30 }],
        1,
        3,
        { color: undefined },
        BASE_STYLE,
      ),
    ).toEqual([
      { start: 0, end: 1, color: "red", fontSize: 30 },
      { start: 1, end: 3, fontSize: 30 },
      { start: 3, end: 4, color: "red", fontSize: 30 },
    ]);
  });
});

describe("transformTextStyleRangesForEdit", () => {
  it("inherits the left style for insertion and shifts the right ranges", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "abcdef",
        newText: "abcXYdef",
        start: 3,
        end: 3,
        insertedText: "XY",
        ranges: [
          { start: 0, end: 3, color: "red" },
          { start: 3, end: 6, color: "blue", fontWeight: "bold" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 5, color: "red" },
      { start: 5, end: 8, color: "blue", fontWeight: "bold" },
    ]);
  });

  it("inherits the right style for insertion at index zero", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "ab",
        newText: "Xab",
        start: 0,
        end: 0,
        insertedText: "X",
        ranges: [
          { start: 0, end: 1, color: "red" },
          { start: 1, end: 2, color: "blue" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 2, color: "red" },
      { start: 2, end: 3, color: "blue" },
    ]);
  });

  it("uses the base style when inserting into empty text", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "",
        newText: "X",
        start: 0,
        end: 0,
        insertedText: "X",
        ranges: [],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([]);
  });

  it("inherits the selection-start style when replacing from index zero", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "abc",
        newText: "Xbc",
        start: 0,
        end: 1,
        insertedText: "X",
        ranges: [
          { start: 0, end: 1, color: "red" },
          { start: 1, end: 3, color: "blue" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 1, color: "red" },
      { start: 1, end: 3, color: "blue" },
    ]);
  });

  it("removes replaced styles and inherits the selection-start style", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "abcdef",
        newText: "abXYf",
        start: 2,
        end: 5,
        insertedText: "XY",
        ranges: [
          { start: 0, end: 2, color: "red" },
          { start: 2, end: 4, fontWeight: "bold" },
          { start: 4, end: 6, color: "blue" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 2, color: "red" },
      { start: 2, end: 4, fontWeight: "bold" },
      { start: 4, end: 5, color: "blue" },
    ]);
  });

  it("cuts and shifts ranges for deletion", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "abcdef",
        newText: "af",
        start: 1,
        end: 5,
        insertedText: "",
        ranges: [
          { start: 0, end: 2, color: "red" },
          { start: 2, end: 5, fontSize: 30 },
          { start: 5, end: 6, color: "blue" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 1, color: "red" },
      { start: 1, end: 2, color: "blue" },
    ]);
  });

  it("counts inserted newlines as UTF-16 code units", () => {
    expect(
      transformTextStyleRangesForEdit({
        oldText: "ab\ncd",
        newText: "ab\n\ncd",
        start: 2,
        end: 2,
        insertedText: "\n",
        ranges: [
          { start: 0, end: 2, fontWeight: "bold" },
          { start: 3, end: 5, color: "red" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 3, fontWeight: "bold" },
      { start: 4, end: 6, color: "red" },
    ]);
  });

  it("counts emoji surrogate pairs as two UTF-16 code units", () => {
    expect("A😀B").toHaveLength(4);
    expect("🙂").toHaveLength(2);

    expect(
      transformTextStyleRangesForEdit({
        oldText: "A😀B",
        newText: "A😀🙂B",
        start: 3,
        end: 3,
        insertedText: "🙂",
        ranges: [
          { start: 0, end: 3, color: "red" },
          { start: 3, end: 4, color: "blue" },
        ],
        baseStyle: BASE_STYLE,
      }),
    ).toEqual([
      { start: 0, end: 5, color: "red" },
      { start: 5, end: 6, color: "blue" },
    ]);
  });
});
