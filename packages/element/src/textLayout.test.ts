import { FONT_FAMILY } from "@excalidraw/common";

import { newTextElement } from "./newElement";
import { setCustomTextMetricsProvider } from "./textMeasurements";
import {
  invalidateTextLayoutCache,
  layoutText,
  layoutTextElement,
} from "./textLayout";

import type { TextLayoutBaseStyle } from "./textLayout";
import type { ExcalidrawTextElement, FontString } from "./types";

const BASE_STYLE: TextLayoutBaseStyle = {
  color: "#111111",
  fontSize: 10,
  fontFamily: FONT_FAMILY.Helvetica,
  fontWeight: "normal",
  textOutlineColor: "transparent",
  textOutlineWidth: 0,
};

const LINE_HEIGHT = 2 as ExcalidrawTextElement["lineHeight"];

const getFontSize = (fontString: FontString) =>
  Number(fontString.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);

beforeEach(() => {
  setCustomTextMetricsProvider({
    getLineWidth: (text, fontString) => {
      const familyMultiplier = fontString.includes("Cascadia") ? 2 : 1;
      const weightMultiplier = fontString.startsWith("900 ") ? 1.5 : 1;
      return (
        text.length *
        getFontSize(fontString) *
        familyMultiplier *
        weightMultiplier
      );
    },
  });
});

describe("layoutText", () => {
  it("groups mixed fonts, sizes, and weights into measured source runs", () => {
    const layout = layoutText({
      originalText: "abcdef",
      baseStyle: BASE_STYLE,
      lineHeight: LINE_HEIGHT,
      textStyleRanges: [
        {
          start: 1,
          end: 3,
          fontSize: 20,
          fontFamily: FONT_FAMILY.Cascadia,
        },
        { start: 3, end: 5, fontWeight: "bold" },
      ],
    });

    expect(
      layout.lines[0].runs.map(
        ({ sourceStart, sourceEnd, text, style, width }) => ({
          sourceStart,
          sourceEnd,
          text,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          width,
        }),
      ),
    ).toEqual([
      {
        sourceStart: 0,
        sourceEnd: 1,
        text: "a",
        fontSize: 10,
        fontFamily: FONT_FAMILY.Helvetica,
        fontWeight: "normal",
        width: 10,
      },
      {
        sourceStart: 1,
        sourceEnd: 3,
        text: "bc",
        fontSize: 20,
        fontFamily: FONT_FAMILY.Cascadia,
        fontWeight: "normal",
        width: 80,
      },
      {
        sourceStart: 3,
        sourceEnd: 5,
        text: "de",
        fontSize: 10,
        fontFamily: FONT_FAMILY.Helvetica,
        fontWeight: "bold",
        width: 30,
      },
      {
        sourceStart: 5,
        sourceEnd: 6,
        text: "f",
        fontSize: 10,
        fontFamily: FONT_FAMILY.Helvetica,
        fontWeight: "normal",
        width: 10,
      },
    ]);
    expect(layout.lines[0].maxFontSize).toBe(20);
    expect(layout.lines[0].lineHeight).toBe(40);
    expect(layout.width).toBe(130);
    expect(layout.contentWidth).toBe(130);
  });

  it("keeps hard blank lines and their source gaps distinct", () => {
    const layout = layoutText({
      originalText: "a\n\nb",
      baseStyle: BASE_STYLE,
      lineHeight: LINE_HEIGHT,
    });

    expect(
      layout.lines.map(
        ({ sourceStart, sourceEnd, text, breakType, y, lineHeight }) => ({
          sourceStart,
          sourceEnd,
          text,
          breakType,
          y,
          lineHeight,
        }),
      ),
    ).toEqual([
      {
        sourceStart: 0,
        sourceEnd: 1,
        text: "a",
        breakType: "hard",
        y: 0,
        lineHeight: 20,
      },
      {
        sourceStart: 2,
        sourceEnd: 2,
        text: "",
        breakType: "hard",
        y: 20,
        lineHeight: 20,
      },
      {
        sourceStart: 3,
        sourceEnd: 4,
        text: "b",
        breakType: null,
        y: 40,
        lineHeight: 20,
      },
    ]);
    expect(layout.wrappedText).toBe("a\n\nb");
    expect(layout.height).toBe(60);
  });

  it("does not consume a source index at soft wrap boundaries", () => {
    const layout = layoutText({
      originalText: "abcd",
      baseStyle: BASE_STYLE,
      lineHeight: LINE_HEIGHT,
      maxWidth: 20,
    });

    expect(
      layout.lines.map(({ sourceStart, sourceEnd, text, breakType }) => ({
        sourceStart,
        sourceEnd,
        text,
        breakType,
      })),
    ).toEqual([
      { sourceStart: 0, sourceEnd: 2, text: "ab", breakType: "soft" },
      { sourceStart: 2, sourceEnd: 4, text: "cd", breakType: null },
    ]);
    expect(layout.lines[0].sourceEnd).toBe(layout.lines[1].sourceStart);
    expect(layout.wrappedText).toBe("ab\ncd");
  });

  it("wraps through style boundaries without treating them as word breaks", () => {
    const layout = layoutText({
      originalText: "abcd",
      baseStyle: BASE_STYLE,
      lineHeight: LINE_HEIGHT,
      maxWidth: 40,
      textStyleRanges: [{ start: 2, end: 4, fontWeight: "bold" }],
    });

    expect(layout.lines.map((line) => line.text)).toEqual(["abc", "d"]);
    expect(layout.lines[0].runs).toHaveLength(2);
    expect(layout.lines[1].runs).toHaveLength(1);
    expect(layout.lines[0].sourceEnd).toBe(layout.lines[1].sourceStart);
  });

  it.each([
    ["left", [0, 0]],
    ["center", [10, 15]],
    ["right", [20, 30]],
  ] as const)("positions %s-aligned lines and runs", (textAlign, offsets) => {
    const layout = layoutText({
      originalText: "aa\na",
      baseStyle: BASE_STYLE,
      lineHeight: LINE_HEIGHT,
      maxWidth: 40,
      textAlign,
    });

    expect(layout.width).toBe(40);
    expect(layout.lines.map((line) => line.x)).toEqual(offsets);
    expect(layout.lines.map((line) => line.runs[0].x)).toEqual(offsets);
    expect(layout.contentWidth).toBe(20);
  });

  it("aligns auto-resize text within its content width while wrapping at max width", () => {
    const element = newTextElement({
      x: 0,
      y: 0,
      text: "aa\na",
      fontSize: 10,
      fontFamily: FONT_FAMILY.Helvetica,
      textAlign: "center",
      autoResize: true,
    });

    const layout = layoutTextElement(element, { maxWidth: 40 });

    expect(layout.width).toBe(20);
    expect(layout.contentWidth).toBe(20);
    expect(layout.lines.map((line) => line.x)).toEqual([0, 5]);
    expect(layout.lines.map((line) => line.runs[0].x)).toEqual([0, 5]);
  });

  it("uses each visual line's maximum font size for its height", () => {
    const layout = layoutText({
      originalText: "ab\ncd",
      baseStyle: BASE_STYLE,
      lineHeight: 1.5 as ExcalidrawTextElement["lineHeight"],
      textStyleRanges: [
        { start: 1, end: 2, fontSize: 30 },
        { start: 4, end: 5, fontSize: 20 },
      ],
    });

    expect(
      layout.lines.map(({ maxFontSize, lineHeight, y }) => ({
        maxFontSize,
        lineHeight,
        y,
      })),
    ).toEqual([
      { maxFontSize: 30, lineHeight: 45, y: 0 },
      { maxFontSize: 20, lineHeight: 30, y: 45 },
    ]);
    expect(layout.height).toBe(75);
  });

  it("caches element layouts and invalidates them when font metrics change", () => {
    const element = newTextElement({
      x: 0,
      y: 0,
      text: "abcd",
      fontSize: 10,
      fontFamily: FONT_FAMILY.Helvetica,
      textStyleRanges: [{ start: 1, end: 3, fontSize: 20 }],
    });

    const first = layoutTextElement(element, { maxWidth: 40 });
    const second = layoutTextElement(element, { maxWidth: 40 });
    const draft = layoutTextElement(element, {
      originalText: "abcde",
      maxWidth: 40,
    });

    expect(second).toBe(first);
    expect(draft).not.toBe(first);

    setCustomTextMetricsProvider({
      getLineWidth: (text, fontString) => text.length * getFontSize(fontString),
    });
    expect(layoutTextElement(element, { maxWidth: 40 })).not.toBe(first);

    invalidateTextLayoutCache();
    expect(layoutTextElement(element, { maxWidth: 40 })).not.toBe(first);
  });

  it("preserves the requested width for fixed-width mixed text", () => {
    const element = newTextElement({
      x: 0,
      y: 0,
      width: 100,
      autoResize: false,
      text: "abcdef",
      fontSize: 10,
      fontFamily: FONT_FAMILY.Helvetica,
      textStyleRanges: [{ start: 1, end: 4, fontSize: 20 }],
    });

    expect(element.width).toBe(100);
    expect(
      layoutTextElement(element, { maxWidth: element.width }).width,
    ).toBe(100);
  });
});
