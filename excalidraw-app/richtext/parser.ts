/**
 * HTML 解析模块
 * 将 HTML 字符串解析为结构化的富文本数据
 */

import type { TextSegment, TextLine, ParsedImage, ParsedRichText } from "./types";

/**
 * 从 DOM 元素的 style 属性中提取样式信息
 */
function extractStyleFromElement(element: Element): Partial<TextSegment> {
  const style: Partial<TextSegment> = {};
  const tagName = element.tagName.toLowerCase();

  // 检查标签名
  if (tagName === "strong" || tagName === "b") {
    style.bold = true;
  }
  if (tagName === "em" || tagName === "i") {
    style.italic = true;
  }
  if (tagName === "u") {
    style.underline = true;
  }
  if (tagName === "s" || tagName === "del" || tagName === "strike") {
    style.strike = true;
  }

  // 检查 style 属性
  if (element instanceof HTMLElement) {
    const computedStyle = element.style;

    // 解析 className（支持 Tailwind 类名）
    const classList = element.classList;
    if (classList.contains("font-bold")) {
      style.bold = true;
    }
    if (classList.contains("italic")) {
      style.italic = true;
    }
    if (classList.contains("underline")) {
      style.underline = true;
    }
    if (classList.contains("line-through")) {
      style.strike = true;
    }

    // 颜色
    if (computedStyle.color) {
      style.color = computedStyle.color;
    }

    // 背景色
    if (computedStyle.backgroundColor) {
      style.bgColor = computedStyle.backgroundColor;
    }

    // 字体大小
    if (computedStyle.fontSize) {
      const size = parseInt(computedStyle.fontSize, 10);
      if (!isNaN(size)) {
        style.fontSize = size;
      }
    }

    // font-weight
    if (
      computedStyle.fontWeight === "bold" ||
      parseInt(computedStyle.fontWeight, 10) >= 600
    ) {
      style.bold = true;
    }

    // font-style
    if (computedStyle.fontStyle === "italic") {
      style.italic = true;
    }

    // text-decoration
    if (computedStyle.textDecoration?.includes("underline")) {
      style.underline = true;
    }
    if (computedStyle.textDecoration?.includes("line-through")) {
      style.strike = true;
    }
  }

  return style;
}

/**
 * 合并两个样式对象
 */
function mergeStyles(
  base: Partial<TextSegment>,
  override: Partial<TextSegment>
): Partial<TextSegment> {
  return {
    ...base,
    ...override,
    // 布尔值使用 OR 合并
    bold: base.bold || override.bold,
    italic: base.italic || override.italic,
    underline: base.underline || override.underline,
    strike: base.strike || override.strike,
  };
}

/**
 * 获取列表项前缀
 * @param element - li 元素
 * @param index - 在父列表中的索引（0-based）
 */
function getListItemPrefix(element: Element, index: number): string {
  const parent = element.parentElement;
  if (!parent) return "";

  const parentTag = parent.tagName.toLowerCase();
  if (parentTag === "ul") {
    return "• ";
  } else if (parentTag === "ol") {
    return `${index + 1}. `;
  }
  return "";
}

/**
 * 递归遍历 DOM 节点，提取文本片段和图片
 */
function traverseNode(
  node: Node,
  currentStyle: Partial<TextSegment>,
  segments: TextSegment[],
  images: ParsedImage[],
  listItemIndex: number = 0
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    // 文本节点
    const text = node.textContent || "";
    if (text) {
      segments.push({
        text,
        ...currentStyle,
      });
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // 处理图片
    if (tagName === "img") {
      const img = element as HTMLImageElement;
      const src = img.getAttribute("src");
      if (src) {
        images.push({
          src,
          width: img.width || undefined,
          height: img.height || undefined,
          alt: img.alt || undefined,
        });
      }
      return;
    }

    // 处理换行
    if (tagName === "br") {
      segments.push({ text: "\n" });
      return;
    }

    // 处理列表项 - 添加前缀
    if (tagName === "li") {
      const prefix = getListItemPrefix(element, listItemIndex);
      if (prefix) {
        segments.push({ text: prefix, ...currentStyle });
      }
    }

    // 提取当前元素的样式
    const elementStyle = extractStyleFromElement(element);
    const mergedStyle = mergeStyles(currentStyle, elementStyle);

    // 递归处理子节点
    let childListItemIndex = 0;
    for (const child of Array.from(node.childNodes)) {
      const childElement = child as Element;
      if (childElement.tagName?.toLowerCase() === "li") {
        traverseNode(child, mergedStyle, segments, images, childListItemIndex);
        childListItemIndex++;
      } else {
        traverseNode(child, mergedStyle, segments, images, 0);
      }
    }

    // 块级元素后添加换行
    if (
      ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"].includes(
        tagName
      )
    ) {
      // 检查最后一个 segment 是否已经是换行
      const lastSegment = segments[segments.length - 1];
      if (lastSegment && lastSegment.text !== "\n") {
        segments.push({ text: "\n" });
      }
    }
  }
}

/**
 * 将连续的相同样式片段合并
 */
function mergeConsecutiveSegments(segments: TextSegment[]): TextSegment[] {
  if (segments.length === 0) return [];

  const result: TextSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    // 检查样式是否相同
    const sameStyle =
      current.bold === seg.bold &&
      current.italic === seg.italic &&
      current.underline === seg.underline &&
      current.strike === seg.strike &&
      current.color === seg.color &&
      current.bgColor === seg.bgColor &&
      current.fontSize === seg.fontSize;

    if (
      sameStyle &&
      !current.text.endsWith("\n") &&
      !seg.text.startsWith("\n")
    ) {
      // 合并
      current.text += seg.text;
    } else {
      result.push(current);
      current = { ...seg };
    }
  }
  result.push(current);

  return result;
}

/**
 * 将片段按换行符分割成行
 */
function segmentsToLines(segments: TextSegment[]): TextLine[] {
  const lines: TextLine[] = [];
  let currentLine: TextSegment[] = [];

  for (const seg of segments) {
    if (seg.text === "\n") {
      // 换行，结束当前行
      if (currentLine.length > 0) {
        lines.push({ segments: currentLine });
        currentLine = [];
      } else {
        // 空行
        lines.push({ segments: [{ text: "" }] });
      }
    } else if (seg.text.includes("\n")) {
      // 文本中包含换行符，需要拆分
      const parts = seg.text.split("\n");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          currentLine.push({ ...seg, text: parts[i] });
        }
        if (i < parts.length - 1) {
          // 不是最后一部分，结束当前行
          if (currentLine.length > 0) {
            lines.push({ segments: currentLine });
            currentLine = [];
          } else {
            lines.push({ segments: [{ text: "" }] });
          }
        }
      }
    } else {
      currentLine.push(seg);
    }
  }

  // 处理最后一行
  if (currentLine.length > 0) {
    lines.push({ segments: currentLine });
  }

  return lines;
}

/**
 * 解析 HTML 字符串，提取富文本结构
 * @param html - HTML 字符串
 * @returns 解析后的富文本结构
 */
export function parseRichTextHtml(html: string): ParsedRichText {
  // 处理空输入
  if (!html || typeof html !== "string") {
    return {
      plainText: "",
      lines: [],
      images: [],
    };
  }

  // 使用 DOMParser 解析 HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const segments: TextSegment[] = [];
  const images: ParsedImage[] = [];

  // 遍历 body 下的所有节点
  traverseNode(doc.body, {}, segments, images);

  // 合并连续的相同样式片段
  const mergedSegments = mergeConsecutiveSegments(segments);

  // 按换行分割成行
  const lines = segmentsToLines(mergedSegments);

  // 提取纯文本
  const plainText = mergedSegments
    .map((seg) => seg.text)
    .join("")
    .replace(/\n+/g, "\n")
    .trim();

  return {
    plainText,
    lines,
    images,
  };
}
