import { getFontString, getVerticalOffset } from "@excalidraw/common";

import {
  getLineHeightInPx,
  getLineWidth,
  getTextMetricsProviderVersion,
} from "./textMeasurements";
import {
  getTextElementBaseStyle,
  normalizeTextStyleRanges,
} from "./textStyleRanges";

import type { TextStyle } from "./textStyleRanges";
import type {
  ExcalidrawTextElement,
  FontFamilyValues,
  TextAlign,
  TextStyleRange,
} from "./types";

export type TextLayoutBaseStyle = Omit<TextStyle, "fontSize" | "fontFamily"> & {
  fontSize: number;
  fontFamily: FontFamilyValues;
};

export type TextLayoutStyle = Omit<
  TextStyle,
  "fontSize" | "fontFamily" | "fontWeight"
> & {
  fontSize: number;
  fontFamily: FontFamilyValues;
  fontWeight: "normal" | "bold";
};

export type TextLayoutBreak = "hard" | "soft" | null;

export type TextLayoutRun = {
  sourceStart: number;
  sourceEnd: number;
  text: string;
  style: TextLayoutStyle;
  width: number;
  x: number;
  y: number;
  lineHeight: number;
};

export type TextLayoutLine = {
  sourceStart: number;
  sourceEnd: number;
  text: string;
  runs: TextLayoutRun[];
  width: number;
  x: number;
  y: number;
  lineHeight: number;
  maxFontSize: number;
  baseline: number;
  breakType: TextLayoutBreak;
};

export type TextLayout = {
  lines: TextLayoutLine[];
  contentWidth: number;
  width: number;
  height: number;
  wrappedText: string;
};

export type TextLayoutOptions = {
  originalText: string;
  baseStyle: Readonly<TextLayoutBaseStyle>;
  textStyleRanges?: readonly TextStyleRange[];
  lineHeight: ExcalidrawTextElement["lineHeight"];
  maxWidth?: number;
  textAlign?: TextAlign;
  preserveMaxWidth?: boolean;
};

export type TextElementLayoutOptions = {
  originalText?: string;
  maxWidth?: number;
  textAlign?: TextAlign;
};

type TextElementLayoutCacheEntry = {
  version: number;
  originalText: string;
  textStyleRanges: ExcalidrawTextElement["textStyleRanges"];
  fontSize: number;
  fontFamily: FontFamilyValues;
  fontWeight: ExcalidrawTextElement["fontWeight"];
  strokeColor: string;
  textOutlineColor: string;
  textOutlineWidth: number;
  lineHeight: ExcalidrawTextElement["lineHeight"];
  layout: TextLayout;
};

const MAX_LAYOUTS_PER_ELEMENT = 8;
let textElementLayoutCache = new WeakMap<
  ExcalidrawTextElement,
  Map<string, TextElementLayoutCacheEntry>
>();
let fontMetricsVersion = 0;

export const invalidateTextLayoutCache = () => {
  fontMetricsVersion++;
  textElementLayoutCache = new WeakMap();
};

type SourceStyleRun = {
  sourceStart: number;
  sourceEnd: number;
  text: string;
  style: TextLayoutStyle;
};

type HardLine = {
  sourceStart: number;
  sourceEnd: number;
  breakEnd: number;
};

type PendingRun = Omit<TextLayoutRun, "width" | "x" | "y" | "lineHeight">;

type PendingLine = {
  sourceStart: number;
  sourceEnd: number;
  runs: PendingRun[];
  breakType: TextLayoutBreak;
};

type MeasuredLine = Omit<TextLayoutLine, "x" | "y">;

type SourceToken = {
  fragments: SourceStyleRun[];
  width: number;
};

const TEXT_STYLE_PROPERTIES: readonly (keyof TextLayoutStyle)[] = [
  "color",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "textOutlineColor",
  "textOutlineWidth",
];

const resolveStyle = (
  baseStyle: Readonly<TextLayoutBaseStyle>,
  overrides?: Readonly<TextStyle>,
): TextLayoutStyle => ({
  ...baseStyle,
  ...overrides,
  fontSize: overrides?.fontSize ?? baseStyle.fontSize,
  fontFamily: overrides?.fontFamily ?? baseStyle.fontFamily,
  fontWeight: overrides?.fontWeight ?? baseStyle.fontWeight ?? "normal",
});

const areStylesEqual = (
  first: Readonly<TextLayoutStyle>,
  second: Readonly<TextLayoutStyle>,
) =>
  TEXT_STYLE_PROPERTIES.every((property) =>
    Object.is(first[property], second[property]),
  );

const getRunWidth = (text: string, style: Readonly<TextLayoutStyle>) =>
  getLineWidth(
    text,
    getFontString({
      fontSize: style.fontSize,
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
    }),
  );

const getSourceStyleRuns = (
  originalText: string,
  baseStyle: Readonly<TextLayoutBaseStyle>,
  textStyleRanges?: readonly TextStyleRange[],
): SourceStyleRun[] => {
  const normalizedRanges = normalizeTextStyleRanges(
    originalText.length,
    textStyleRanges,
    baseStyle,
  );
  const base = resolveStyle(baseStyle);
  const runs: SourceStyleRun[] = [];
  let sourceIndex = 0;

  for (const range of normalizedRanges) {
    if (sourceIndex < range.start) {
      runs.push({
        sourceStart: sourceIndex,
        sourceEnd: range.start,
        text: originalText.slice(sourceIndex, range.start),
        style: base,
      });
    }

    runs.push({
      sourceStart: range.start,
      sourceEnd: range.end,
      text: originalText.slice(range.start, range.end),
      style: resolveStyle(baseStyle, range),
    });
    sourceIndex = range.end;
  }

  if (sourceIndex < originalText.length) {
    runs.push({
      sourceStart: sourceIndex,
      sourceEnd: originalText.length,
      text: originalText.slice(sourceIndex),
      style: base,
    });
  }

  return runs;
};

const getHardLines = (originalText: string): HardLine[] => {
  const lines: HardLine[] = [];
  let lineStart = 0;

  for (let index = 0; index < originalText.length; index++) {
    const character = originalText[index];
    if (character !== "\n" && character !== "\r") {
      continue;
    }

    const breakEnd =
      character === "\r" && originalText[index + 1] === "\n"
        ? index + 2
        : index + 1;
    lines.push({
      sourceStart: lineStart,
      sourceEnd: index,
      breakEnd,
    });
    lineStart = breakEnd;
    index = breakEnd - 1;
  }

  lines.push({
    sourceStart: lineStart,
    sourceEnd: originalText.length,
    breakEnd: originalText.length,
  });

  return lines;
};

const getCodePointLength = (text: string, index: number) =>
  text.codePointAt(index)! > 0xffff ? 2 : 1;

const appendRun = (runs: PendingRun[], run: PendingRun) => {
  if (!run.text) {
    return;
  }

  const previous = runs[runs.length - 1];
  if (
    previous &&
    previous.sourceEnd === run.sourceStart &&
    areStylesEqual(previous.style, run.style)
  ) {
    previous.sourceEnd = run.sourceEnd;
    previous.text += run.text;
    return;
  }

  runs.push(run);
};

const getHardLineRuns = (
  hardLine: HardLine,
  sourceRuns: readonly SourceStyleRun[],
  sourceRunIndex: number,
) => {
  const runs: SourceStyleRun[] = [];
  let nextSourceRunIndex = sourceRunIndex;

  while (
    nextSourceRunIndex < sourceRuns.length &&
    sourceRuns[nextSourceRunIndex].sourceEnd <= hardLine.sourceStart
  ) {
    nextSourceRunIndex++;
  }

  let index = nextSourceRunIndex;
  while (
    index < sourceRuns.length &&
    sourceRuns[index].sourceStart < hardLine.sourceEnd
  ) {
    const sourceRun = sourceRuns[index];
    const sourceStart = Math.max(sourceRun.sourceStart, hardLine.sourceStart);
    const sourceEnd = Math.min(sourceRun.sourceEnd, hardLine.sourceEnd);

    if (sourceStart < sourceEnd) {
      runs.push({
        sourceStart,
        sourceEnd,
        text: sourceRun.text.slice(
          sourceStart - sourceRun.sourceStart,
          sourceEnd - sourceRun.sourceStart,
        ),
        style: sourceRun.style,
      });
    }

    if (sourceRun.sourceEnd <= hardLine.sourceEnd) {
      index++;
    } else {
      break;
    }
  }

  return { runs, sourceRunIndex: index };
};

const splitRunAtWhitespaceBoundaries = (
  run: SourceStyleRun,
): SourceStyleRun[] => {
  const fragments: SourceStyleRun[] = [];
  let fragmentStart = 0;
  let tokenIsWhitespace: boolean | null = null;

  for (let index = 0; index < run.text.length; ) {
    const codePointLength = getCodePointLength(run.text, index);
    const isWhitespace = /\s/u.test(
      run.text.slice(index, index + codePointLength),
    );

    if (tokenIsWhitespace !== null && tokenIsWhitespace !== isWhitespace) {
      fragments.push({
        sourceStart: run.sourceStart + fragmentStart,
        sourceEnd: run.sourceStart + index,
        text: run.text.slice(fragmentStart, index),
        style: run.style,
      });
      fragmentStart = index;
    }

    tokenIsWhitespace = isWhitespace;
    index += codePointLength;
  }

  if (fragmentStart < run.text.length) {
    fragments.push({
      sourceStart: run.sourceStart + fragmentStart,
      sourceEnd: run.sourceEnd,
      text: run.text.slice(fragmentStart),
      style: run.style,
    });
  }

  return fragments;
};

const getSourceTokens = (
  sourceRuns: readonly SourceStyleRun[],
): SourceToken[] => {
  const tokens: SourceToken[] = [];
  let currentToken: SourceToken | null = null;
  let currentTokenIsWhitespace: boolean | null = null;

  for (const sourceRun of sourceRuns) {
    for (const fragment of splitRunAtWhitespaceBoundaries(sourceRun)) {
      const isWhitespace = /\s/u.test(fragment.text[0]);
      const width = getRunWidth(fragment.text, fragment.style);

      if (
        !currentToken ||
        currentTokenIsWhitespace === null ||
        currentTokenIsWhitespace !== isWhitespace
      ) {
        currentToken = { fragments: [], width: 0 };
        tokens.push(currentToken);
        currentTokenIsWhitespace = isWhitespace;
      }

      currentToken.fragments.push(fragment);
      currentToken.width += width;
    }
  }

  return tokens;
};

const wrapHardLine = (
  hardLine: HardLine,
  sourceRuns: readonly SourceStyleRun[],
  maxWidth: number | undefined,
): PendingLine[] => {
  const hasHardBreak = hardLine.breakEnd > hardLine.sourceEnd;
  if (sourceRuns.length === 0) {
    return [
      {
        sourceStart: hardLine.sourceStart,
        sourceEnd: hardLine.sourceEnd,
        runs: [],
        breakType: hasHardBreak ? "hard" : null,
      },
    ];
  }

  if (maxWidth === undefined) {
    return [
      {
        sourceStart: hardLine.sourceStart,
        sourceEnd: hardLine.sourceEnd,
        runs: sourceRuns.map(({ sourceStart, sourceEnd, text, style }) => ({
          sourceStart,
          sourceEnd,
          text,
          style,
        })),
        breakType: hasHardBreak ? "hard" : null,
      },
    ];
  }

  const lines: PendingLine[] = [];
  let currentRuns: PendingRun[] = [];
  let currentWidth = 0;

  const pushLine = (breakType: TextLayoutBreak) => {
    const first = currentRuns[0];
    const last = currentRuns[currentRuns.length - 1];
    if (!first || !last) {
      return;
    }

    lines.push({
      sourceStart: first.sourceStart,
      sourceEnd: last.sourceEnd,
      runs: currentRuns,
      breakType,
    });
    currentRuns = [];
    currentWidth = 0;
  };

  const appendFragment = (fragment: SourceStyleRun, width: number) => {
    appendRun(currentRuns, fragment);
    currentWidth += width;
  };

  for (const token of getSourceTokens(sourceRuns)) {
    if (currentRuns.length > 0 && currentWidth + token.width > maxWidth) {
      pushLine("soft");
    }

    if (token.width <= maxWidth) {
      for (const fragment of token.fragments) {
        appendFragment(fragment, getRunWidth(fragment.text, fragment.style));
      }
      continue;
    }

    for (const fragment of token.fragments) {
      for (let index = 0; index < fragment.text.length; ) {
        const codePointLength = getCodePointLength(fragment.text, index);
        const text = fragment.text.slice(index, index + codePointLength);
        const width = getRunWidth(text, fragment.style);

        if (currentRuns.length > 0 && currentWidth + width > maxWidth) {
          pushLine("soft");
        }

        appendFragment(
          {
            sourceStart: fragment.sourceStart + index,
            sourceEnd: fragment.sourceStart + index + codePointLength,
            text,
            style: fragment.style,
          },
          width,
        );
        index += codePointLength;
      }
    }
  }

  pushLine(hasHardBreak ? "hard" : null);
  return lines;
};

const measureLine = (
  line: PendingLine,
  baseStyle: Readonly<TextLayoutBaseStyle>,
  lineHeight: ExcalidrawTextElement["lineHeight"],
): MeasuredLine => {
  const maxFontSize =
    line.runs.length > 0
      ? line.runs.reduce(
          (maximum, run) => Math.max(maximum, run.style.fontSize),
          0,
        )
      : baseStyle.fontSize;
  const measuredRuns = line.runs.map((run) => ({
    ...run,
    width: getRunWidth(run.text, run.style),
    x: 0,
    y: 0,
    lineHeight: getLineHeightInPx(maxFontSize, lineHeight),
  }));
  const width = measuredRuns.reduce((total, run) => total + run.width, 0);
  const measuredLineHeight = getLineHeightInPx(maxFontSize, lineHeight);
  const baseline = measuredRuns.length
    ? measuredRuns.reduce(
        (maximum, run) =>
          Math.max(
            maximum,
            getVerticalOffset(
              run.style.fontFamily,
              run.style.fontSize,
              measuredLineHeight,
            ),
          ),
        0,
      )
    : getVerticalOffset(baseStyle.fontFamily, maxFontSize, measuredLineHeight);

  return {
    ...line,
    text: measuredRuns.map((run) => run.text).join(""),
    runs: measuredRuns,
    width,
    lineHeight: measuredLineHeight,
    maxFontSize,
    baseline,
  };
};

const getAlignedX = (
  textAlign: TextAlign,
  layoutWidth: number,
  lineWidth: number,
) => {
  if (textAlign === "center") {
    return (layoutWidth - lineWidth) / 2;
  }
  if (textAlign === "right") {
    return layoutWidth - lineWidth;
  }
  return 0;
};

export const layoutText = ({
  originalText,
  baseStyle,
  textStyleRanges,
  lineHeight,
  maxWidth,
  textAlign = "left",
  preserveMaxWidth = true,
}: TextLayoutOptions): TextLayout => {
  const wrappingWidth =
    maxWidth !== undefined && Number.isFinite(maxWidth) && maxWidth >= 0
      ? maxWidth
      : undefined;
  const sourceRuns = getSourceStyleRuns(
    originalText,
    baseStyle,
    textStyleRanges,
  );
  const pendingLines: PendingLine[] = [];
  let sourceRunIndex = 0;

  for (const hardLine of getHardLines(originalText)) {
    const hardLineRuns = getHardLineRuns(hardLine, sourceRuns, sourceRunIndex);
    sourceRunIndex = hardLineRuns.sourceRunIndex;
    pendingLines.push(
      ...wrapHardLine(hardLine, hardLineRuns.runs, wrappingWidth),
    );
  }

  const measuredLines = pendingLines.map((line) =>
    measureLine(line, baseStyle, lineHeight),
  );
  const contentWidth = measuredLines.reduce(
    (maximum, line) => Math.max(maximum, line.width),
    0,
  );
  const width = Math.max(
    contentWidth,
    preserveMaxWidth ? wrappingWidth ?? 0 : 0,
  );
  let y = 0;

  const lines = measuredLines.map((line): TextLayoutLine => {
    const x = getAlignedX(textAlign, width, line.width);
    let runX = x;
    const positionedLine: TextLayoutLine = {
      ...line,
      x,
      y,
      runs: line.runs.map((run) => {
        const positionedRun = { ...run, x: runX, y };
        runX += run.width;
        return positionedRun;
      }),
    };
    y += line.lineHeight;
    return positionedLine;
  });

  return {
    lines,
    contentWidth,
    width,
    height: y,
    wrappedText: lines.map((line) => line.text).join("\n"),
  };
};

export const layoutTextElement = (
  element: ExcalidrawTextElement,
  {
    originalText = element.originalText,
    maxWidth,
    textAlign = element.textAlign,
  }: TextElementLayoutOptions = {},
): TextLayout => {
  const cacheKey = `${fontMetricsVersion}:${getTextMetricsProviderVersion()}:${
    element.version
  }:${maxWidth ?? "auto"}:${textAlign}`;
  let elementCache = textElementLayoutCache.get(element);
  const cached = elementCache?.get(cacheKey);

  if (
    cached &&
    cached.version === element.version &&
    cached.originalText === originalText &&
    cached.textStyleRanges === element.textStyleRanges &&
    cached.fontSize === element.fontSize &&
    cached.fontFamily === element.fontFamily &&
    cached.fontWeight === element.fontWeight &&
    cached.strokeColor === element.strokeColor &&
    cached.textOutlineColor === element.textOutlineColor &&
    cached.textOutlineWidth === element.textOutlineWidth &&
    cached.lineHeight === element.lineHeight
  ) {
    return cached.layout;
  }

  const layout = layoutText({
    originalText,
    baseStyle: getTextElementBaseStyle(element),
    textStyleRanges: element.textStyleRanges,
    lineHeight: element.lineHeight,
    maxWidth,
    textAlign,
    preserveMaxWidth: !element.autoResize,
  });

  if (!elementCache) {
    elementCache = new Map();
    textElementLayoutCache.set(element, elementCache);
  }
  if (elementCache.size >= MAX_LAYOUTS_PER_ELEMENT) {
    elementCache.delete(elementCache.keys().next().value!);
  }
  elementCache.set(cacheKey, {
    version: element.version,
    originalText,
    textStyleRanges: element.textStyleRanges,
    fontSize: element.fontSize,
    fontFamily: element.fontFamily,
    fontWeight: element.fontWeight,
    strokeColor: element.strokeColor,
    textOutlineColor: element.textOutlineColor,
    textOutlineWidth: element.textOutlineWidth,
    lineHeight: element.lineHeight,
    layout,
  });

  return layout;
};
