import type {
  MindmapLabelStyle,
  MindmapLabelStyleRange,
  MindmapNode,
} from "./types";

export interface MindmapTextMetrics {
  measure(
    text: string,
    style: { fontSize: number; bold: boolean; italic: boolean }
  ): number;
  /** Increment when fonts become available. */
  revision?: number;
}
export interface MindmapTextRun {
  text: string;
  start: number;
  end: number;
  line: number;
  x: number;
  y: number;
  width: number;
  style: MindmapLabelStyle;
}
export interface MindmapTextLayout {
  lines: string[];
  lineHeight: number;
  width: number;
  height: number;
  runs: MindmapTextRun[];
}
let configuredMetrics: MindmapTextMetrics | undefined;
let revision = 0;
let observedMetricsRevision: number | undefined;
let measurementCache = new Map<string, number>();
let layoutCache = new Map<string, MindmapTextLayout>();
/** The injected implementation is owned by the host; this package never reads DOM. */
export function configureMindmapTextMetrics(metrics?: MindmapTextMetrics) {
  configuredMetrics = metrics;
  observedMetricsRevision = metrics?.revision;
  revision++;
  measurementCache.clear();
  layoutCache.clear();
}
export function invalidateMindmapTextMetrics() {
  revision++;
  measurementCache.clear();
  layoutCache.clear();
}
export function getMindmapTextMetricsRevision() {
  if (observedMetricsRevision !== configuredMetrics?.revision) {
    observedMetricsRevision = configuredMetrics?.revision;
    revision++;
    measurementCache.clear();
    layoutCache.clear();
  }
  return revision;
}
export function clearMindmapCaches() {
  measurementCache.clear();
  layoutCache.clear();
  revision++;
}
type GraphemeSegmenter = {
  segment(text: string): Iterable<{ segment: string; index: number }>;
};
let graphemeSegmenter: GraphemeSegmenter | undefined;
export function mindmapGraphemes(
  text: string
): { text: string; start: number; end: number }[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (locale?: string, options?: { granularity: string }) => {
        segment(text: string): Iterable<{ segment: string; index: number }>;
      };
    }
  ).Segmenter;
  if (Segmenter) {
    graphemeSegmenter ||= new Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(graphemeSegmenter.segment(text), (part) => ({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
    }));
  }
  let offset = 0;
  return Array.from(text, (value) => {
    const part = { text: value, start: offset, end: offset + value.length };
    offset = part.end;
    return part;
  });
}
export function snapMindmapTextOffset(
  text: string,
  offset: number,
  direction: "before" | "after" = "before"
) {
  const value = Math.max(
    0,
    Math.min(text.length, Number.isFinite(offset) ? Math.floor(offset) : 0)
  );
  for (const glyph of mindmapGraphemes(text))
    if (value > glyph.start && value < glyph.end)
      return direction === "before" ? glyph.start : glyph.end;
  return value;
}
function cleanStyle(style: MindmapLabelStyle): MindmapLabelStyle {
  const result: MindmapLabelStyle = {};
  if (typeof style.color === "string" && style.color)
    result.color = style.color;
  for (const key of ["bold", "italic", "underline", "strikethrough"] as const)
    if (typeof style[key] === "boolean") result[key] = style[key];
  return result;
}
export function normalizeMindmapLabelStyleRanges(
  text: string,
  ranges: readonly MindmapLabelStyleRange[] = []
): MindmapLabelStyleRange[] {
  const clean = ranges
    .filter(
      (range) =>
        range && Number.isFinite(range.start) && Number.isFinite(range.end)
    )
    .map((range) => ({
      ...cleanStyle(range),
      start: snapMindmapTextOffset(text, range.start),
      end: snapMindmapTextOffset(text, range.end, "after"),
    }))
    .filter((range) => range.end > range.start);
  const points = [
    ...new Set([
      0,
      text.length,
      ...clean.flatMap((range) => [range.start, range.end]),
    ]),
  ].sort((a, b) => a - b);
  const result: MindmapLabelStyleRange[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i],
      end = points[i + 1];
    const style = Object.assign(
      {},
      ...clean
        .filter((range) => range.start <= start && range.end >= end)
        .map(cleanStyle)
    ) as MindmapLabelStyle;
    if (!Object.keys(style).length) continue;
    const last = result[result.length - 1];
    if (
      last &&
      last.end === start &&
      JSON.stringify(cleanStyle(last)) === JSON.stringify(style)
    )
      last.end = end;
    else result.push({ ...style, start, end });
  }
  return result;
}
export function applyMindmapLabelStyle(
  text: string,
  ranges: readonly MindmapLabelStyleRange[],
  start: number,
  end: number,
  style: MindmapLabelStyle
) {
  return normalizeMindmapLabelStyleRanges(text, [
    ...ranges,
    { ...style, start, end },
  ]);
}
/** Splices text and transforms ranges; inserted text inherits an explicit typing style. */
export function replaceMindmapText(
  text: string,
  ranges: readonly MindmapLabelStyleRange[],
  start: number,
  end: number,
  insert: string,
  style: MindmapLabelStyle = {}
) {
  start = snapMindmapTextOffset(text, start);
  end = snapMindmapTextOffset(text, end, "after");
  const label = text.slice(0, start) + insert + text.slice(end);
  const delta = insert.length - (end - start);
  const next: MindmapLabelStyleRange[] = [];
  for (const range of normalizeMindmapLabelStyleRanges(text, ranges)) {
    if (range.start < start)
      next.push({ ...range, end: Math.min(range.end, start) });
    if (range.end > end)
      next.push({
        ...range,
        start: Math.max(range.start, end) + delta,
        end: range.end + delta,
      });
  }
  if (insert && Object.keys(style).length)
    next.push({ ...style, start, end: start + insert.length });
  return {
    label,
    labelStyleRanges: normalizeMindmapLabelStyleRanges(label, next),
  };
}
export function measureMindmapText(
  text: string,
  fontSize: number,
  bold = false,
  italic = false,
  metrics = configuredMetrics
) {
  const key = `${getMindmapTextMetricsRevision()}|${fontSize}|${+bold}|${+italic}|${text}`;
  if (!metrics || metrics === configuredMetrics) {
    const cached = measurementCache.get(key);
    if (cached !== undefined) return cached;
  }
  let width = metrics?.measure(text, { fontSize, bold, italic });
  if (!Number.isFinite(width))
    width =
      Array.from(text).reduce(
        (total, char) =>
          total +
          (/\s/.test(char) ? 0.34 : /[\u0000-\u00ff]/.test(char) ? 0.58 : 1),
        0
      ) *
      fontSize *
      (bold ? 1.06 : 1) *
      (italic ? 1.02 : 1);
  width = Math.max(0, width!);
  if (!metrics || metrics === configuredMetrics) {
    if (measurementCache.size >= 12000) measurementCache.clear();
    measurementCache.set(key, width);
  }
  return width;
}
function buildMindmapTextLayout(
  node: Pick<
    MindmapNode,
    | "label"
    | "fontWeight"
    | "fontStyle"
    | "labelStyleRanges"
    | "widthMode"
    | "textMaxWidth"
    | "textDecoration"
    | "color"
  >,
  fontSize: number,
  options: { maxWidth?: number; metrics?: MindmapTextMetrics } = {}
): MindmapTextLayout {
  const ranges = normalizeMindmapLabelStyleRanges(
    node.label,
    node.labelStyleRanges
  );
  const base: MindmapLabelStyle = {
    bold: node.fontWeight === "bold",
    italic: node.fontStyle === "italic",
    underline: node.textDecoration === "underline",
    strikethrough: node.textDecoration === "line-through",
    ...(node.color ? { color: node.color } : {}),
  };
  const maxWidth =
    options.maxWidth && options.maxWidth > 0 ? options.maxWidth : Infinity;
  const lineHeight = fontSize * 1.4;
  const lines: string[] = [];
  const runs: MindmapTextRun[] = [];
  let current = "",
    line = 0,
    x = 0,
    width = 0;
  const finish = () => {
    lines.push(current);
    width = Math.max(width, x);
    current = "";
    x = 0;
    line++;
  };
  const glyphs = mindmapGraphemes(node.label);
  const styled = glyphs.map((glyph) => ({
    ...glyph,
    style: {
      ...base,
      ...Object.assign(
        {},
        ...ranges
          .filter(
            (range) => range.start <= glyph.start && range.end >= glyph.end
          )
          .map(cleanStyle)
      ),
    },
  }));
  for (let i = 0; i < styled.length; i++) {
    const glyph = styled[i];
    if (glyph.text === "\r") continue;
    if (glyph.text === "\n" || glyph.text === "\r\n") {
      finish();
      continue;
    }
    // Prefer a whole Latin word when it fits on an empty line; fall back to grapheme wrapping.
    if (
      /[A-Za-z0-9]/.test(glyph.text) &&
      (i === 0 || !/[A-Za-z0-9]/.test(styled[i - 1].text))
    ) {
      let word = "",
        j = i;
      while (j < styled.length && /^[A-Za-z0-9_'’-]+$/.test(styled[j].text))
        word += styled[j++].text;
      const wordWidth = measureMindmapText(
        word,
        fontSize,
        Boolean(glyph.style.bold),
        Boolean(glyph.style.italic),
        options.metrics
      );
      if (x > 0 && wordWidth <= maxWidth && x + wordWidth > maxWidth) finish();
    }
    const glyphWidth = measureMindmapText(
      glyph.text,
      fontSize,
      Boolean(glyph.style.bold),
      Boolean(glyph.style.italic),
      options.metrics
    );
    if (x > 0 && x + glyphWidth > maxWidth) finish();
    const last = runs[runs.length - 1];
    if (
      last &&
      last.line === line &&
      last.end === glyph.start &&
      JSON.stringify(last.style) === JSON.stringify(glyph.style)
    ) {
      last.text += glyph.text;
      last.end = glyph.end;
      last.width += glyphWidth;
    } else
      runs.push({
        text: glyph.text,
        start: glyph.start,
        end: glyph.end,
        line,
        x,
        y: line * lineHeight,
        width: glyphWidth,
        style: glyph.style,
      });
    current += glyph.text;
    x += glyphWidth;
  }
  finish();
  return {
    lines,
    lineHeight,
    width,
    height: Math.max(1, lines.length) * lineHeight,
    runs,
  };
}
/** Extract supported inline formatting from HTML without retaining markup or executing it. */
export function parseMindmapHtmlText(html: string): {
  label: string;
  labelStyleRanges: MindmapLabelStyleRange[];
} {
  const safe = html.replace(
    /<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ""
  );
  const decode = (text: string) =>
    text.replace(
      /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (_, value: string) => {
        if (value[0] === "#") {
          const number =
            value[1].toLowerCase() === "x"
              ? parseInt(value.slice(2), 16)
              : parseInt(value.slice(1), 10);
          return Number.isFinite(number) && number >= 0 && number <= 0x10ffff
            ? String.fromCodePoint(number)
            : "";
        }
        return (
          (
            {
              amp: "&",
              lt: "<",
              gt: ">",
              quot: '"',
              apos: "'",
              nbsp: " ",
            } as Record<string, string>
          )[value.toLowerCase()] || ""
        );
      }
    );
  let label = "";
  const ranges: MindmapLabelStyleRange[] = [];
  const stack: { tag: string; style: MindmapLabelStyle }[] = [];
  const current = () =>
    Object.assign({}, ...stack.map((item) => item.style)) as MindmapLabelStyle;
  const token = /<[^>]*>|[^<]+/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(safe))) {
    const value = match[0];
    if (value[0] !== "<") {
      const text = decode(value),
        start = label.length;
      label += text;
      const style = current();
      if (Object.keys(style).length)
        ranges.push({ ...style, start, end: label.length });
      continue;
    }
    const tag = /^<\/?\s*([\w-]+)/.exec(value)?.[1]?.toLowerCase();
    if (!tag) continue;
    if (/^<\//.test(value)) {
      for (let i = stack.length - 1; i >= 0; i--)
        if (stack[i].tag === tag) {
          stack.splice(i);
          break;
        }
      if (["p", "div", "li"].includes(tag) && label && !label.endsWith("\n"))
        label += "\n";
      continue;
    }
    if (tag === "br") {
      label += "\n";
      continue;
    }
    if (["p", "div", "li"].includes(tag) && label && !label.endsWith("\n"))
      label += "\n";
    const style: MindmapLabelStyle = {};
    if (["b", "strong"].includes(tag)) style.bold = true;
    if (["i", "em"].includes(tag)) style.italic = true;
    if (tag === "u") style.underline = true;
    if (["s", "strike", "del"].includes(tag)) style.strikethrough = true;
    const css = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(value)?.[1] || "";
    for (const declaration of css.split(";")) {
      const at = declaration.indexOf(":");
      if (at < 0) continue;
      const property = declaration.slice(0, at).trim().toLowerCase(),
        setting = declaration.slice(at + 1).trim(),
        formatSetting = setting.toLowerCase().replace(/\s*!important\s*$/, "").trim();
      if (property === "color" && setting && !/[<>;]/.test(setting))
        style.color = setting;
      if (property === "font-weight") {
        if (formatSetting === "bold") style.bold = true;
        else if (formatSetting === "normal") style.bold = false;
        else if (Number(formatSetting) > 0)
          style.bold = Number(formatSetting) >= 600;
      }
      if (property === "font-style") {
        if (formatSetting === "italic") style.italic = true;
        else if (formatSetting === "normal") style.italic = false;
      }
      if (
        property === "text-decoration" ||
        property === "text-decoration-line"
      ) {
        style.underline = formatSetting.includes("underline");
        style.strikethrough = formatSetting.includes("line-through");
      }
    }
    if (!["img", "hr", "input", "meta", "link"].includes(tag))
      stack.push({ tag, style });
  }
  label = label.replace(/\n$/, "");
  return {
    label,
    labelStyleRanges: normalizeMindmapLabelStyleRanges(label, ranges),
  };
}

/** Bounded cache is shared by sizing, Canvas, SVG and editing overlay. */
export function resolveMindmapTextLayout(
  node: Parameters<typeof buildMindmapTextLayout>[0],
  fontSize: number,
  options: Parameters<typeof buildMindmapTextLayout>[2] = {}
): MindmapTextLayout {
  if (options.metrics && options.metrics !== configuredMetrics)
    return buildMindmapTextLayout(node, fontSize, options);
  const key = JSON.stringify([
    getMindmapTextMetricsRevision(),
    fontSize,
    options.maxWidth,
    node.label,
    node.fontWeight,
    node.fontStyle,
    node.color,
    node.textDecoration,
    node.labelStyleRanges,
  ]);
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const layout = buildMindmapTextLayout(node, fontSize, options);
  if (layoutCache.size >= 4096)
    layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, layout);
  return layout;
}

/** Reconciles controlled-input changes while retaining styles outside the edited span. */
export function reconcileMindmapTextChange(
  before: string,
  after: string,
  ranges: readonly MindmapLabelStyleRange[],
  typingStyle: MindmapLabelStyle = {}
) {
  let start = 0;
  const maximum = Math.min(before.length, after.length);
  while (start < maximum && before[start] === after[start]) start++;
  start = snapMindmapTextOffset(before, start);
  let oldEnd = before.length,
    newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  oldEnd = snapMindmapTextOffset(before, oldEnd, "after");
  newEnd = snapMindmapTextOffset(after, newEnd, "after");
  return replaceMindmapText(
    before,
    ranges,
    start,
    oldEnd,
    after.slice(start, newEnd),
    typingStyle
  );
}

/** Multiple mounted editors can share the same pure metrics service safely. */
const metricsRegistrations: { metrics: MindmapTextMetrics }[] = [];
export function registerMindmapTextMetrics(
  metrics: MindmapTextMetrics
): () => void {
  const registration = { metrics };
  metricsRegistrations.push(registration);
  configureMindmapTextMetrics(metrics);
  return () => {
    const index = metricsRegistrations.indexOf(registration);
    if (index < 0) return;
    const wasActive = index === metricsRegistrations.length - 1;
    metricsRegistrations.splice(index, 1);
    if (wasActive)
      configureMindmapTextMetrics(metricsRegistrations.at(-1)?.metrics);
  };
}
