import {
  BOUND_TEXT_PADDING,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  getFontString,
  isTestEnv,
  normalizeEOL,
} from "@excalidraw/common";

import type {
  FontString,
  ExcalidrawTextElement,
  FontFamilyValues,
  TextStyleRange,
} from "./types";

export const measureText = (
  text: string,
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const _text = text
    .split("\n")
    // replace empty lines with single space because leading/trailing empty
    // lines would be stripped from computation
    .map((x) => x || " ")
    .join("\n");
  const fontSize = parseFloat(font);
  const height = getTextHeight(_text, fontSize, lineHeight);
  const width = getTextWidth(_text, font);
  return { width, height };
};

export const measureTextWithStyleRanges = (
  text: string,
  baseFontSize: number,
  baseFontFamily: FontFamilyValues,
  lineHeight: ExcalidrawTextElement["lineHeight"],
  textStyleRanges?: readonly TextStyleRange[],
) => {
  if (!textStyleRanges || textStyleRanges.length === 0) {
    return measureText(
      text,
      getFontString({ fontSize: baseFontSize, fontFamily: baseFontFamily }),
      lineHeight,
    );
  }

  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  let maxWidth = 0;
  let totalHeight = 0;
  let globalIndex = 0;

  const getStyleAt = (index: number) => {
    let fontSize = baseFontSize;
    let fontFamily = baseFontFamily;
    for (const range of textStyleRanges) {
      if (index >= range.start && index < range.end) {
        if (range.fontSize != null) {
          fontSize = range.fontSize;
        }
        if (range.fontFamily != null) {
          fontFamily = range.fontFamily;
        }
      }
    }
    return { fontSize, fontFamily };
  };

  for (const rawLine of lines) {
    const lineStart = globalIndex;
    const lineEnd = globalIndex + rawLine.length;

    if (rawLine.length === 0) {
      const font = getFontString({
        fontSize: baseFontSize,
        fontFamily: baseFontFamily,
      });
      maxWidth = Math.max(maxWidth, getLineWidth(" ", font));
      totalHeight += getLineHeightInPx(baseFontSize, lineHeight);
      globalIndex = lineEnd + 1;
      continue;
    }

    let width = 0;
    let maxLineFontSize = baseFontSize;
    let segmentStart = 0;
    let currentStyle = getStyleAt(lineStart);
    maxLineFontSize = Math.max(maxLineFontSize, currentStyle.fontSize);

    for (let localIndex = 0; localIndex < rawLine.length; localIndex++) {
      const global = lineStart + localIndex;
      const nextStyle = getStyleAt(global);
      if (
        nextStyle.fontSize !== currentStyle.fontSize ||
        nextStyle.fontFamily !== currentStyle.fontFamily
      ) {
        const segmentText = rawLine.slice(segmentStart, localIndex);
        const segmentFont = getFontString({
          fontSize: currentStyle.fontSize,
          fontFamily: currentStyle.fontFamily,
        });
        width += getLineWidth(segmentText, segmentFont);
        segmentStart = localIndex;
        currentStyle = nextStyle;
      }
      maxLineFontSize = Math.max(maxLineFontSize, nextStyle.fontSize);
    }

    const tailText = rawLine.slice(segmentStart);
    const tailFont = getFontString({
      fontSize: currentStyle.fontSize,
      fontFamily: currentStyle.fontFamily,
    });
    width += getLineWidth(tailText, tailFont);

    maxWidth = Math.max(maxWidth, width);
    totalHeight += getLineHeightInPx(maxLineFontSize, lineHeight);

    globalIndex = lineEnd + 1;
  }

  return { width: maxWidth, height: totalHeight };
};

const DUMMY_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toLocaleUpperCase();

// FIXME rename to getApproxMinContainerWidth
export const getApproxMinLineWidth = (
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const maxCharWidth = getMaxCharWidth(font);
  if (maxCharWidth === 0) {
    return (
      measureText(DUMMY_TEXT.split("").join("\n"), font, lineHeight).width +
      BOUND_TEXT_PADDING * 2
    );
  }
  return maxCharWidth + BOUND_TEXT_PADDING * 2;
};

export const getMinTextElementWidth = (
  font: FontString,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  return measureText("", font, lineHeight).width + BOUND_TEXT_PADDING * 2;
};

export const isMeasureTextSupported = () => {
  const width = getTextWidth(
    DUMMY_TEXT,
    getFontString({
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: DEFAULT_FONT_FAMILY,
    }),
  );
  return width > 0;
};

export const normalizeText = (text: string) => {
  return (
    normalizeEOL(text)
      // replace tabs with spaces so they render and measure correctly
      .replace(/\t/g, "        ")
  );
};

const splitIntoLines = (text: string) => {
  return normalizeText(text).split("\n");
};

/**
 * To get unitless line-height (if unknown) we can calculate it by dividing
 * height-per-line by fontSize.
 */
export const detectLineHeight = (textElement: ExcalidrawTextElement) => {
  const lineCount = splitIntoLines(textElement.text).length;
  return (textElement.height /
    lineCount /
    textElement.fontSize) as ExcalidrawTextElement["lineHeight"];
};

/**
 * We calculate the line height from the font size and the unitless line height,
 * aligning with the W3C spec.
 */
export const getLineHeightInPx = (
  fontSize: ExcalidrawTextElement["fontSize"],
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  return fontSize * lineHeight;
};

// FIXME rename to getApproxMinContainerHeight
export const getApproxMinLineHeight = (
  fontSize: ExcalidrawTextElement["fontSize"],
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  return getLineHeightInPx(fontSize, lineHeight) + BOUND_TEXT_PADDING * 2;
};

let textMetricsProvider: TextMetricsProvider | undefined;

/**
 * Set a custom text metrics provider.
 *
 * Useful for overriding the width calculation algorithm where canvas API is not available / desired.
 */
export const setCustomTextMetricsProvider = (provider: TextMetricsProvider) => {
  textMetricsProvider = provider;
};

export interface TextMetricsProvider {
  getLineWidth(text: string, fontString: FontString): number;
}

class CanvasTextMetricsProvider implements TextMetricsProvider {
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement("canvas");
  }

  /**
   * We need to use the advance width as that's the closest thing to the browser wrapping algo, hence using it for:
   * - text wrapping
   * - wysiwyg editor (+padding)
   *
   * > The advance width is the distance between the glyph's initial pen position and the next glyph's initial pen position.
   */
  public getLineWidth(text: string, fontString: FontString): number {
    const context = this.canvas.getContext("2d")!;
    context.font = fontString;
    const metrics = context.measureText(text);
    const advanceWidth = metrics.width;

    // since in test env the canvas measureText algo
    // doesn't measure text and instead just returns number of
    // characters hence we assume that each letteris 10px
    if (isTestEnv()) {
      return advanceWidth * 10;
    }

    return advanceWidth;
  }
}

export const getLineWidth = (text: string, font: FontString) => {
  if (!textMetricsProvider) {
    textMetricsProvider = new CanvasTextMetricsProvider();
  }

  return textMetricsProvider.getLineWidth(text, font);
};

export const getTextWidth = (text: string, font: FontString) => {
  const lines = splitIntoLines(text);
  let width = 0;
  lines.forEach((line) => {
    width = Math.max(width, getLineWidth(line, font));
  });

  return width;
};

export const getTextHeight = (
  text: string,
  fontSize: number,
  lineHeight: ExcalidrawTextElement["lineHeight"],
) => {
  const lineCount = splitIntoLines(text).length;
  return getLineHeightInPx(fontSize, lineHeight) * lineCount;
};

export const charWidth = (() => {
  const cachedCharWidth: { [key: FontString]: Array<number> } = {};

  const calculate = (char: string, font: FontString) => {
    const unicode = char.charCodeAt(0);
    if (!cachedCharWidth[font]) {
      cachedCharWidth[font] = [];
    }
    if (!cachedCharWidth[font][unicode]) {
      const width = getLineWidth(char, font);
      cachedCharWidth[font][unicode] = width;
    }

    return cachedCharWidth[font][unicode];
  };

  const getCache = (font: FontString) => {
    return cachedCharWidth[font];
  };

  const clearCache = (font: FontString) => {
    cachedCharWidth[font] = [];
  };

  return {
    calculate,
    getCache,
    clearCache,
  };
})();

export const getMinCharWidth = (font: FontString) => {
  const cache = charWidth.getCache(font);
  if (!cache) {
    return 0;
  }
  const cacheWithOutEmpty = cache.filter((val) => val !== undefined);

  return Math.min(...cacheWithOutEmpty);
};

export const getMaxCharWidth = (font: FontString) => {
  const cache = charWidth.getCache(font);
  if (!cache) {
    return 0;
  }
  const cacheWithOutEmpty = cache.filter((val) => val !== undefined);
  return Math.max(...cacheWithOutEmpty);
};
