/**
 * 文本布局模块
 * 计算文本在画布上的布局位置
 */

import type {
  TextSegment,
  BaseLayoutTextItem,
  LayoutSegmentsOptions,
} from "./types";

// 共享的测量 canvas
let sharedMeasureCanvas: HTMLCanvasElement | null = null;
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

/**
 * 获取共享的测量上下文
 */
export function getSharedMeasureContext(): CanvasRenderingContext2D | null {
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement("canvas");
    sharedMeasureCtx = sharedMeasureCanvas.getContext("2d");
  }
  return sharedMeasureCtx;
}

/**
 * 创建文本测量函数
 */
export function createMeasureTextFn(
  fontSize: number,
  fontFamily: string = "Virgil, Segoe UI Emoji, sans-serif"
): (text: string, bold?: boolean) => number {
  const ctx = getSharedMeasureContext();

  return (text: string, _bold?: boolean): number => {
    if (!ctx) {
      // 降级：按字符数估算
      return text.length * fontSize * 0.6;
    }
    ctx.font = `${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
  };
}

/**
 * 通用的文本布局函数：将 TextSegment 列表按 maxWidth 自动换行，生成基础布局信息
 *
 * 核心原则：保持 HTML 的行内特性
 * - span 等行内元素不应该整体换行
 * - 只有当一个字符放不下时才换行
 * - 每个 segment 按字符逐个放置
 */
export function layoutTextSegments(
  segments: TextSegment[],
  options: LayoutSegmentsOptions
): { items: BaseLayoutTextItem[]; linesUsed: number } {
  const { startLineIndex, startOffsetX = 0, maxWidth, measureText } = options;

  const items: BaseLayoutTextItem[] = [];
  let lineIndex = startLineIndex;
  let offsetX = startOffsetX;
  const baseOffsetX = startOffsetX;

  for (const seg of segments) {
    if (!seg.text) continue;

    let currentPartStart = 0;
    let currentPartWidth = 0;
    const chars = [...seg.text];

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      const charWidth = measureText(char, seg.bold);

      if (offsetX + currentPartWidth + charWidth > baseOffsetX + maxWidth) {
        // 当前行放不下这个字符了，先输出已累积的部分
        if (currentPartStart < i) {
          const partText = chars.slice(currentPartStart, i).join("");
          items.push({
            text: partText,
            color: seg.color,
            bgColor: seg.bgColor,
            bold: seg.bold,
            italic: seg.italic,
            underline: seg.underline,
            strike: seg.strike,
            lineIndex,
            offsetX,
          });
          offsetX += currentPartWidth;
        }

        // 换行
        lineIndex++;
        offsetX = baseOffsetX;
        currentPartStart = i;
        currentPartWidth = charWidth;
      } else {
        currentPartWidth += charWidth;
      }
    }

    // 输出剩余部分
    if (currentPartStart < chars.length) {
      const partText = chars.slice(currentPartStart).join("");
      items.push({
        text: partText,
        color: seg.color,
        bgColor: seg.bgColor,
        bold: seg.bold,
        italic: seg.italic,
        underline: seg.underline,
        strike: seg.strike,
        lineIndex,
        offsetX,
      });
      offsetX += currentPartWidth;
    }
  }

  const linesUsed = lineIndex - startLineIndex + 1;
  return { items, linesUsed };
}
