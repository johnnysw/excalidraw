import type { ExcalidrawTextElement, TextStyleRange } from "./types";

export type TextStyle = Omit<TextStyleRange, "start" | "end">;
export type TextStyleProperty = keyof TextStyle;
export type SelectionTextStyle = {
  [Property in TextStyleProperty]?: TextStyle[Property] | null;
};

export type TransformTextStyleRangesForEditParams = {
  oldText: string;
  newText: string;
  start: number;
  end: number;
  insertedText: string;
  ranges?: readonly TextStyleRange[];
  baseStyle: Readonly<TextStyle>;
};

export const getTextElementBaseStyle = (element: ExcalidrawTextElement) => ({
  color: element.strokeColor,
  fontSize: element.fontSize,
  fontFamily: element.fontFamily,
  fontWeight: element.fontWeight ?? "normal",
  textOutlineColor: element.textOutlineColor,
  textOutlineWidth: element.textOutlineWidth,
});

export const normalizeTextElementStyleRanges = <
  Element extends ExcalidrawTextElement,
>(
  element: Element,
): Element => {
  const { richTextRanges, ...elementWithoutLegacyRanges } = element;
  const legacyColorRanges = (richTextRanges ?? []).flatMap((range) =>
    range.color == null
      ? []
      : [{ start: range.start, end: range.end, color: range.color }],
  );
  const textStyleRanges = normalizeTextStyleRanges(
    element.originalText.length,
    [...(element.textStyleRanges ?? []), ...legacyColorRanges],
    getTextElementBaseStyle(element),
  );

  return {
    ...elementWithoutLegacyRanges,
    textStyleRanges: textStyleRanges.length ? textStyleRanges : undefined,
  } as Element;
};

const TEXT_STYLE_PROPERTIES = [
  "color",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "textOutlineColor",
  "textOutlineWidth",
] as const;

const hasOwn = (value: object, property: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, property);

const setStyleProperty = <Property extends TextStyleProperty>(
  style: TextStyle,
  property: Property,
  value: TextStyle[Property],
) => {
  style[property] = value;
};

const setSelectionStyleProperty = <Property extends TextStyleProperty>(
  style: SelectionTextStyle,
  property: Property,
  value: TextStyle[Property] | null,
) => {
  style[property] = value;
};

const deleteStyleProperty = <Property extends TextStyleProperty>(
  style: TextStyle,
  property: Property,
) => {
  delete style[property];
};

const normalizeTextLength = (textLength: number) =>
  Number.isFinite(textLength) ? Math.max(0, Math.trunc(textLength)) : 0;

const clampIndex = (index: number, textLength: number) => {
  if (index === Infinity) {
    return textLength;
  }
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.min(textLength, Math.max(0, Math.trunc(index)));
};

const normalizeUnboundedIndex = (index: number) =>
  Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;

const pickStyle = (source: Readonly<TextStyle>): TextStyle => {
  const style: TextStyle = {};

  for (const property of TEXT_STYLE_PROPERTIES) {
    const value = source[property];
    if (value !== undefined) {
      setStyleProperty(style, property, value);
    }
  }

  return style;
};

const getStyleOverrides = (
  style: Readonly<TextStyle>,
  baseStyle: Readonly<TextStyle>,
): TextStyle => {
  const overrides: TextStyle = {};

  for (const property of TEXT_STYLE_PROPERTIES) {
    const value = style[property];
    if (value !== undefined && !Object.is(value, baseStyle[property])) {
      setStyleProperty(overrides, property, value);
    }
  }

  return overrides;
};

const hasStyleOverrides = (style: Readonly<TextStyle>) =>
  TEXT_STYLE_PROPERTIES.some((property) => style[property] !== undefined);

const areStylesEqual = (
  first: Readonly<TextStyle>,
  second: Readonly<TextStyle>,
) =>
  TEXT_STYLE_PROPERTIES.every((property) =>
    Object.is(first[property], second[property]),
  );

const appendCanonicalRange = (
  ranges: TextStyleRange[],
  start: number,
  end: number,
  style: Readonly<TextStyle>,
) => {
  if (start >= end || !hasStyleOverrides(style)) {
    return;
  }

  const previous = ranges[ranges.length - 1];
  if (previous && previous.end === start && areStylesEqual(previous, style)) {
    previous.end = end;
    return;
  }

  ranges.push({ start, end, ...style });
};

const resolveTextStyleAtInternal = (
  index: number,
  ranges: readonly TextStyleRange[],
  baseStyle: Readonly<TextStyle>,
): TextStyle => {
  const style = pickStyle(baseStyle);

  for (const range of ranges) {
    if (index < range.start || index >= range.end) {
      continue;
    }

    for (const property of TEXT_STYLE_PROPERTIES) {
      const value = range[property];
      if (value !== undefined) {
        setStyleProperty(style, property, value);
      }
    }
  }

  return style;
};

const resolveCanonicalTextStyleAt = (
  index: number,
  ranges: readonly TextStyleRange[],
  baseStyle: Readonly<TextStyle>,
): TextStyle => {
  let lower = 0;
  let upper = ranges.length - 1;

  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const range = ranges[middle];
    if (index < range.start) {
      upper = middle - 1;
    } else if (index >= range.end) {
      lower = middle + 1;
    } else {
      return { ...pickStyle(baseStyle), ...pickStyle(range) };
    }
  }

  return pickStyle(baseStyle);
};

const normalizeNonOverlappingRanges = (
  textLength: number,
  ranges: readonly TextStyleRange[],
  baseStyle: Readonly<TextStyle>,
): TextStyleRange[] | null => {
  const normalized: TextStyleRange[] = [];
  let previousEnd = 0;

  for (const range of ranges) {
    const start = clampIndex(range.start, textLength);
    const end = clampIndex(range.end, textLength);
    if (start >= end) {
      continue;
    }
    if (start < previousEnd) {
      return null;
    }

    const style = pickStyle(baseStyle);
    for (const property of TEXT_STYLE_PROPERTIES) {
      const value = range[property];
      if (value !== undefined) {
        setStyleProperty(style, property, value);
      }
    }
    appendCanonicalRange(
      normalized,
      start,
      end,
      getStyleOverrides(style, baseStyle),
    );
    previousEnd = end;
  }

  return normalized;
};

export const normalizeTextStyleRanges = (
  textLength: number,
  ranges: readonly TextStyleRange[] | undefined,
  baseStyle: Readonly<TextStyle>,
): TextStyleRange[] => {
  const length = normalizeTextLength(textLength);
  if (length === 0 || !ranges?.length) {
    return [];
  }

  const nonOverlapping = normalizeNonOverlappingRanges(
    length,
    ranges,
    baseStyle,
  );
  if (nonOverlapping) {
    return nonOverlapping;
  }

  const clampedRanges: TextStyleRange[] = [];
  const boundaries = new Set<number>([0, length]);

  for (const range of ranges) {
    const start = clampIndex(range.start, length);
    const end = clampIndex(range.end, length);
    if (start >= end) {
      continue;
    }

    const clampedRange = { ...range, start, end };
    clampedRanges.push(clampedRange);
    boundaries.add(start);
    boundaries.add(end);
  }

  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  );
  const normalized: TextStyleRange[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index++) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];
    const style = resolveTextStyleAtInternal(start, clampedRanges, baseStyle);
    appendCanonicalRange(
      normalized,
      start,
      end,
      getStyleOverrides(style, baseStyle),
    );
  }

  return normalized;
};

export const resolveTextStyleAt = (
  index: number,
  ranges: readonly TextStyleRange[] | undefined,
  baseStyle: Readonly<TextStyle>,
): TextStyle => {
  const normalizedIndex = normalizeUnboundedIndex(index);
  return resolveTextStyleAtInternal(normalizedIndex, ranges ?? [], baseStyle);
};

export const resolveSelectionTextStyle = (
  start: number,
  end: number,
  ranges: readonly TextStyleRange[] | undefined,
  baseStyle: Readonly<TextStyle>,
): SelectionTextStyle => {
  const normalizedStart = normalizeUnboundedIndex(Math.min(start, end));
  const normalizedEnd = normalizeUnboundedIndex(Math.max(start, end));

  if (normalizedStart === normalizedEnd) {
    return resolveTextStyleAt(
      normalizedStart > 0 ? normalizedStart - 1 : 0,
      ranges,
      baseStyle,
    );
  }

  const normalizedRanges = normalizeTextStyleRanges(
    normalizedEnd,
    ranges,
    baseStyle,
  );

  const candidates = new Set<number>([normalizedStart]);
  for (const range of normalizedRanges) {
    const rangeStart = range.start;
    const rangeEnd = range.end;
    if (rangeStart > normalizedStart && rangeStart < normalizedEnd) {
      candidates.add(rangeStart);
    }
    if (rangeEnd > normalizedStart && rangeEnd < normalizedEnd) {
      candidates.add(rangeEnd);
    }
  }

  const candidateIndices = [...candidates].sort(
    (first, second) => first - second,
  );
  const firstStyle = resolveCanonicalTextStyleAt(
    candidateIndices[0],
    normalizedRanges,
    baseStyle,
  );
  const selectionStyle: SelectionTextStyle = {};

  for (const property of TEXT_STYLE_PROPERTIES) {
    const value = firstStyle[property];
    const isMixed = candidateIndices.some(
      (candidate) =>
        !Object.is(
          resolveCanonicalTextStyleAt(candidate, normalizedRanges, baseStyle)[
            property
          ],
          value,
        ),
    );

    if (isMixed) {
      setSelectionStyleProperty(selectionStyle, property, null);
    } else if (value !== undefined) {
      setSelectionStyleProperty(selectionStyle, property, value);
    }
  }

  return selectionStyle;
};

export const applyTextStyleToRange = (
  textLength: number,
  ranges: readonly TextStyleRange[] | undefined,
  start: number,
  end: number,
  stylePatch: Readonly<TextStyle>,
  baseStyle: Readonly<TextStyle>,
): TextStyleRange[] => {
  const length = normalizeTextLength(textLength);
  const normalized = normalizeTextStyleRanges(length, ranges, baseStyle);
  const rangeStart = clampIndex(Math.min(start, end), length);
  const rangeEnd = clampIndex(Math.max(start, end), length);
  const patchedProperties = TEXT_STYLE_PROPERTIES.filter((property) =>
    hasOwn(stylePatch, property),
  );

  if (rangeStart >= rangeEnd || patchedProperties.length === 0) {
    return normalized;
  }

  const boundaries = new Set<number>([0, length, rangeStart, rangeEnd]);
  for (const range of normalized) {
    boundaries.add(range.start);
    boundaries.add(range.end);
  }

  const sortedBoundaries = [...boundaries].sort(
    (first, second) => first - second,
  );
  const result: TextStyleRange[] = [];
  let normalizedRangeIndex = 0;

  for (let index = 0; index < sortedBoundaries.length - 1; index++) {
    const segmentStart = sortedBoundaries[index];
    const segmentEnd = sortedBoundaries[index + 1];
    while (
      normalizedRangeIndex < normalized.length &&
      normalized[normalizedRangeIndex].end <= segmentStart
    ) {
      normalizedRangeIndex++;
    }
    const activeRange = normalized[normalizedRangeIndex];
    const segmentStyle =
      activeRange &&
      activeRange.start <= segmentStart &&
      segmentStart < activeRange.end
        ? { ...pickStyle(baseStyle), ...pickStyle(activeRange) }
        : pickStyle(baseStyle);

    if (segmentStart >= rangeStart && segmentEnd <= rangeEnd) {
      for (const property of patchedProperties) {
        const value = stylePatch[property];
        if (value === undefined) {
          const baseValue = baseStyle[property];
          if (baseValue === undefined) {
            deleteStyleProperty(segmentStyle, property);
          } else {
            setStyleProperty(segmentStyle, property, baseValue);
          }
        } else {
          setStyleProperty(segmentStyle, property, value);
        }
      }
    }

    appendCanonicalRange(
      result,
      segmentStart,
      segmentEnd,
      getStyleOverrides(segmentStyle, baseStyle),
    );
  }

  return result;
};

const normalizeNonOverlappingStylePatches = (
  textLength: number,
  patches: readonly TextStyleRange[],
): TextStyleRange[] | null => {
  const normalized: TextStyleRange[] = [];
  let previousEnd = 0;

  for (const patch of patches) {
    const start = clampIndex(patch.start, textLength);
    const end = clampIndex(patch.end, textLength);
    if (start >= end) {
      continue;
    }
    if (start < previousEnd) {
      return null;
    }
    const style = pickStyle(patch);
    if (hasStyleOverrides(style)) {
      normalized.push({ start, end, ...style });
    }
    previousEnd = end;
  }

  return normalized;
};

export const applyTextStyleRanges = (
  textLength: number,
  ranges: readonly TextStyleRange[] | undefined,
  patches: readonly TextStyleRange[] | undefined,
  baseStyle: Readonly<TextStyle>,
): TextStyleRange[] => {
  const length = normalizeTextLength(textLength);
  const normalized = normalizeTextStyleRanges(length, ranges, baseStyle);
  if (!patches?.length || length === 0) {
    return normalized;
  }

  const normalizedPatches = normalizeNonOverlappingStylePatches(
    length,
    patches,
  );
  if (!normalizedPatches) {
    return patches.reduce(
      (result, patch) =>
        applyTextStyleToRange(
          length,
          result,
          patch.start,
          patch.end,
          pickStyle(patch),
          baseStyle,
        ),
      normalized,
    );
  }

  const result: TextStyleRange[] = [];
  let rangeIndex = 0;
  let patchIndex = 0;
  let position = 0;

  while (position < length) {
    while (
      rangeIndex < normalized.length &&
      normalized[rangeIndex].end <= position
    ) {
      rangeIndex++;
    }
    while (
      patchIndex < normalizedPatches.length &&
      normalizedPatches[patchIndex].end <= position
    ) {
      patchIndex++;
    }

    const range = normalized[rangeIndex];
    const patch = normalizedPatches[patchIndex];
    const activeRange =
      range && range.start <= position && position < range.end ? range : null;
    const activePatch =
      patch && patch.start <= position && position < patch.end ? patch : null;
    const nextBoundary = Math.min(
      length,
      activeRange ? activeRange.end : range?.start ?? length,
      activePatch ? activePatch.end : patch?.start ?? length,
    );
    const style = {
      ...pickStyle(baseStyle),
      ...(activeRange ? pickStyle(activeRange) : null),
      ...(activePatch ? pickStyle(activePatch) : null),
    };

    appendCanonicalRange(
      result,
      position,
      nextBoundary,
      getStyleOverrides(style, baseStyle),
    );
    position = nextBoundary;
  }

  return result;
};

export const clearTextStyleProperty = (
  textLength: number,
  ranges: readonly TextStyleRange[] | undefined,
  start: number,
  end: number,
  property: TextStyleProperty,
  baseStyle: Readonly<TextStyle>,
): TextStyleRange[] => {
  const stylePatch: TextStyle = {};
  setStyleProperty(stylePatch, property, baseStyle[property]);

  return applyTextStyleToRange(
    textLength,
    ranges,
    start,
    end,
    stylePatch,
    baseStyle,
  );
};

export const scaleTextStyleRanges = (
  ranges: readonly TextStyleRange[] | undefined,
  scale: number,
): TextStyleRange[] | undefined => {
  if (!ranges?.length || !Number.isFinite(scale)) {
    return ranges?.length ? ranges.map((range) => ({ ...range })) : undefined;
  }
  return ranges.map((range) => ({
    ...range,
    ...(range.fontSize != null ? { fontSize: range.fontSize * scale } : {}),
    ...(range.textOutlineWidth != null
      ? { textOutlineWidth: range.textOutlineWidth * scale }
      : {}),
  }));
};

export const transformTextStyleRangesForEdit = ({
  oldText,
  newText,
  start,
  end,
  insertedText,
  ranges,
  baseStyle,
}: TransformTextStyleRangesForEditParams): TextStyleRange[] => {
  const oldTextLength = oldText.length;
  const newTextLength = newText.length;
  const editStart = clampIndex(Math.min(start, end), oldTextLength);
  const editEnd = clampIndex(Math.max(start, end), oldTextLength);
  const insertedTextLength = insertedText.length;
  const offset = insertedTextLength - (editEnd - editStart);
  const normalized = normalizeTextStyleRanges(oldTextLength, ranges, baseStyle);
  const transformed: TextStyleRange[] = [];

  for (const range of normalized) {
    if (range.start < editStart) {
      transformed.push({
        ...range,
        end: Math.min(range.end, editStart),
      });
    }

    if (range.end > editEnd) {
      transformed.push({
        ...range,
        start: Math.max(range.start, editEnd) + offset,
        end: range.end + offset,
      });
    }
  }

  if (insertedTextLength > 0) {
    const inheritedStyle =
      editEnd > editStart
        ? resolveCanonicalTextStyleAt(editStart, normalized, baseStyle)
        : editStart > 0
        ? resolveCanonicalTextStyleAt(editStart - 1, normalized, baseStyle)
        : editEnd < oldTextLength
        ? resolveCanonicalTextStyleAt(editEnd, normalized, baseStyle)
        : pickStyle(baseStyle);
    const inheritedOverrides = getStyleOverrides(inheritedStyle, baseStyle);

    if (hasStyleOverrides(inheritedOverrides)) {
      transformed.push({
        start: editStart,
        end: editStart + insertedTextLength,
        ...inheritedOverrides,
      });
    }
  }

  return normalizeTextStyleRanges(newTextLength, transformed, baseStyle);
};
