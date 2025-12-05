/**
 * RichTextNode 元素创建模块
 * 将富文本 HTML 转换为 Excalidraw 元素组
 */

import type {
  RichTextNodeCustomData,
  RichTextNodeBackgroundCustomData,
} from "@excalidraw/excalidraw/types";

import type {
  RichTextNodeConfig,
  BaseLayoutTextItem,
  ImageInfoWithPosition,
} from "./types";

import { parseRichTextHtml } from "./parser";
import { layoutTextSegments, createMeasureTextFn } from "./layout";
import {
  generatePrefixedId,
  generateRichTextNodeId,
  getImageSize,
  urlToDataURL,
  LOADING_PLACEHOLDER,
} from "./utils";

/**
 * 布局项类型定义
 */
interface LayoutTextItem extends BaseLayoutTextItem {
  type: "text";
}

interface LayoutImageItem {
  type: "image";
  imageInfo: ImageInfoWithPosition;
  lineIndex: number;
}

interface LayoutGapItem {
  type: "gap";
  lineIndex: number;
  gapHeight: number;
}

type LayoutItem = LayoutTextItem | LayoutImageItem | LayoutGapItem;

/**
 * 创建 RichTextNode 元素组（异步版本，支持图片）
 *
 * @param config - 节点配置
 * @returns Promise<{ elements: any[], files: Record<string, any> }>
 */
export async function createRichTextNodeElementsAsync(
  config: RichTextNodeConfig
): Promise<{
  elements: any[];
  files: Record<string, any>;
}> {
  const {
    x,
    y,
    nodeId = generateRichTextNodeId(),
    html,
    maxWidth = 400,
    fontSize = 16,
    defaultColor = "#1e1e1e",
    padding = 16,
  } = config;

  const groupId = generatePrefixedId("richtext-group");
  const elements: any[] = [];
  const files: Record<string, any> = {};
  const lineHeight = fontSize * 1.6;
  const contentWidth = maxWidth - padding * 2;
  const imageGap = 8;

  // 解析 HTML
  const parsed = parseRichTextHtml(html);

  // 预加载所有图片尺寸
  const imageInfosResult = await Promise.all(
    parsed.images.map(async (img) => {
      try {
        const { width, height } = await getImageSize(img.src, contentWidth);
        const fileId = generatePrefixedId("richtext-img");
        return { src: img.src, width, height, fileId } as ImageInfoWithPosition;
      } catch (e) {
        console.warn(
          "[createRichTextNodeElementsAsync] Failed to get image size:",
          img.src,
          e
        );
        return null;
      }
    })
  );
  const imageInfos = imageInfosResult.filter(
    (info): info is ImageInfoWithPosition => !!info
  );

  // 创建测量函数
  const measureText = createMeasureTextFn(fontSize);

  // 布局项
  const layoutItems: LayoutItem[] = [];
  let currentLineIndex = 0;

  // 布局文本行
  for (const line of parsed.lines) {
    const hasContent = line.segments.some((seg) => seg.text?.trim());
    if (!hasContent) continue;

    const { items, linesUsed } = layoutTextSegments(line.segments, {
      startLineIndex: currentLineIndex,
      maxWidth: contentWidth,
      measureText,
    });

    for (const item of items) {
      layoutItems.push({
        type: "text",
        ...item,
      });
    }
    currentLineIndex += linesUsed;
  }

  // 在文本后添加图片
  if (imageInfos.length > 0 && layoutItems.length > 0) {
    // 添加间隙
    layoutItems.push({
      type: "gap",
      lineIndex: currentLineIndex,
      gapHeight: imageGap,
    });
    currentLineIndex++;

    // 添加图片
    for (const imageInfo of imageInfos) {
      layoutItems.push({
        type: "image",
        imageInfo,
        lineIndex: currentLineIndex,
      });
      // 图片占用的行数（基于图片高度）
      const imageLines = Math.ceil(imageInfo.height / lineHeight);
      currentLineIndex += imageLines;

      // 图片间隙
      layoutItems.push({
        type: "gap",
        lineIndex: currentLineIndex,
        gapHeight: imageGap,
      });
      currentLineIndex++;
    }
  }

  // 计算每行高度
  const lineHeights: number[] = [];
  let maxLineIndex = 0;
  for (const item of layoutItems) {
    maxLineIndex = Math.max(maxLineIndex, item.lineIndex);
  }
  for (let i = 0; i <= maxLineIndex; i++) {
    lineHeights[i] = lineHeight;
  }

  // 处理特殊高度（gap 和 image）
  for (const item of layoutItems) {
    if (item.type === "gap") {
      lineHeights[item.lineIndex] = Math.max(
        lineHeights[item.lineIndex],
        item.gapHeight
      );
    } else if (item.type === "image") {
      const imageLines = Math.ceil(item.imageInfo.height / lineHeight);
      for (let i = 0; i < imageLines; i++) {
        if (item.lineIndex + i <= maxLineIndex) {
          lineHeights[item.lineIndex + i] = lineHeight;
        }
      }
    }
  }

  // 计算行 Y 偏移
  const lineYOffsets: number[] = [];
  let accumulatedY = 0;
  for (let i = 0; i <= maxLineIndex; i++) {
    lineYOffsets[i] = accumulatedY;
    accumulatedY += lineHeights[i];
  }

  // 计算总高度（包含图片）
  let totalHeight = accumulatedY;
  for (const item of layoutItems) {
    if (item.type === "image") {
      const imageBottom =
        (lineYOffsets[item.lineIndex] ?? 0) + item.imageInfo.height;
      totalHeight = Math.max(totalHeight, imageBottom);
    }
  }

  const cardWidth = maxWidth;
  const cardHeight = totalHeight + padding * 2;
  const cardX = x - cardWidth / 2;
  const cardY = y - cardHeight / 2;

  const now = Date.now();

  // 创建背景矩形（存储节点配置）
  const rectId = generatePrefixedId("richtext-bg");
  const rectSeed = Math.floor(Math.random() * 100000);

  const backgroundCustomData: RichTextNodeBackgroundCustomData = {
    type: "rich-text-node",
    nodeId,
    role: "background",
    html,
    fontSize,
    maxWidth,
    padding,
  };

  elements.push({
    id: rectId,
    type: "rectangle",
    x: cardX,
    y: cardY,
    width: cardWidth,
    height: cardHeight,
    angle: 0,
    strokeColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    opacity: 100,
    groupIds: [groupId],
    frameId: null,
    roundness: { type: 3 },
    seed: rectSeed,
    version: 1,
    versionNonce: rectSeed + 1,
    isDeleted: false,
    boundElements: null,
    updated: now,
    link: null,
    locked: false,
    customData: backgroundCustomData,
  });

  // 渲染每个布局项
  for (const item of layoutItems) {
    if (item.type === "text") {
      const baseY =
        cardY +
        padding +
        (lineYOffsets[item.lineIndex] ?? item.lineIndex * lineHeight);
      const textColor = item.bold
        ? item.color || "#000000"
        : item.color || defaultColor;
      const textWidth = measureText(item.text);
      const textX = cardX + padding + item.offsetX;

      const baseCustomData: RichTextNodeCustomData = {
        type: "rich-text-node",
        nodeId,
        role: "text",
      };

      // 背景色矩形
      if (item.bgColor) {
        const bgRectId = generatePrefixedId("richtext-text-bg");
        const bgRectSeed = Math.floor(Math.random() * 100000);

        const bgCustomData: RichTextNodeCustomData = {
          type: "rich-text-node",
          nodeId,
          role: "text-bg",
        };

        elements.push({
          id: bgRectId,
          type: "rectangle",
          x: textX,
          y: baseY,
          width: textWidth,
          height: lineHeight,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: item.bgColor,
          fillStyle: "solid",
          strokeWidth: 0,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [groupId],
          frameId: null,
          roundness: null,
          seed: bgRectSeed,
          version: 1,
          versionNonce: bgRectSeed + 1,
          isDeleted: false,
          boundElements: null,
          updated: now,
          link: null,
          locked: false,
          customData: bgCustomData,
        });
      }

      // 下划线
      if (item.underline) {
        const underlineId = generatePrefixedId("richtext-underline");
        const underlineSeed = Math.floor(Math.random() * 100000);
        const lineThickness = Math.max(1, Math.round(fontSize * 0.08));
        const underlineY =
          baseY + fontSize + Math.max(1, Math.round(lineThickness / 2));

        const underlineCustomData: RichTextNodeCustomData = {
          type: "rich-text-node",
          nodeId,
          role: "underline",
        };

        elements.push({
          id: underlineId,
          type: "rectangle",
          x: textX,
          y: underlineY,
          width: textWidth,
          height: lineThickness,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: textColor,
          fillStyle: "solid",
          strokeWidth: 0,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [groupId],
          frameId: null,
          roundness: null,
          seed: underlineSeed,
          version: 1,
          versionNonce: underlineSeed + 1,
          isDeleted: false,
          boundElements: null,
          updated: now,
          link: null,
          locked: false,
          customData: underlineCustomData,
        });
      }

      // 删除线
      if (item.strike) {
        const strikeId = generatePrefixedId("richtext-strike");
        const strikeSeed = Math.floor(Math.random() * 100000);
        const lineThickness = Math.max(1, Math.round(fontSize * 0.08));
        const strikeY = baseY + Math.round(fontSize * 0.5);

        const strikeCustomData: RichTextNodeCustomData = {
          type: "rich-text-node",
          nodeId,
          role: "strike",
        };

        elements.push({
          id: strikeId,
          type: "rectangle",
          x: textX,
          y: strikeY,
          width: textWidth,
          height: lineThickness,
          angle: 0,
          strokeColor: "transparent",
          backgroundColor: textColor,
          fillStyle: "solid",
          strokeWidth: 0,
          strokeStyle: "solid",
          roughness: 0,
          opacity: 100,
          groupIds: [groupId],
          frameId: null,
          roundness: null,
          seed: strikeSeed,
          version: 1,
          versionNonce: strikeSeed + 1,
          isDeleted: false,
          boundElements: null,
          updated: now,
          link: null,
          locked: false,
          customData: strikeCustomData,
        });
      }

      // 文本元素
      const textId = generatePrefixedId("richtext-text");
      const textSeed = Math.floor(Math.random() * 100000);

      elements.push({
        id: textId,
        type: "text",
        x: textX,
        y: baseY,
        width: textWidth,
        height: lineHeight,
        angle: 0,
        strokeColor: textColor,
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [groupId],
        frameId: null,
        roundness: null,
        seed: textSeed,
        version: 1,
        versionNonce: textSeed + 1,
        isDeleted: false,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        text: item.text,
        fontSize: fontSize,
        fontFamily: 1,
        textAlign: "left",
        verticalAlign: "top",
        baseline: Math.round(fontSize * 0.8),
        containerId: null,
        originalText: item.text,
        autoResize: true,
        lineHeight: 1.25,
        customData: baseCustomData,
      });
    } else if (item.type === "image") {
      const { imageInfo } = item;
      const imageY =
        cardY +
        padding +
        (lineYOffsets[item.lineIndex] ?? item.lineIndex * lineHeight);
      // 图片居中
      const imageX = cardX + padding + (contentWidth - imageInfo.width) / 2;

      const imageId = generatePrefixedId("richtext-image");
      const imageSeed = Math.floor(Math.random() * 100000);

      const imageCustomData: RichTextNodeCustomData = {
        type: "rich-text-node",
        nodeId,
        role: "image",
      };

      // 尝试加载图片为 base64
      let dataURL = LOADING_PLACEHOLDER;
      try {
        dataURL = await urlToDataURL(imageInfo.src);
      } catch (e) {
        console.warn(
          "[createRichTextNodeElementsAsync] Failed to load image:",
          imageInfo.src,
          e
        );
      }

      // 添加文件
      files[imageInfo.fileId] = {
        id: imageInfo.fileId,
        mimeType: "image/png",
        dataURL,
        created: now,
        lastRetrieved: now,
      };

      // 添加图片元素
      elements.push({
        id: imageId,
        type: "image",
        x: imageX,
        y: imageY,
        width: imageInfo.width,
        height: imageInfo.height,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 0,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [groupId],
        frameId: null,
        roundness: null,
        seed: imageSeed,
        version: 1,
        versionNonce: imageSeed + 1,
        isDeleted: false,
        boundElements: null,
        updated: now,
        link: null,
        locked: false,
        status: "saved",
        fileId: imageInfo.fileId,
        scale: [1, 1],
        customData: imageCustomData,
      });
    }
  }

  return { elements, files };
}

/**
 * 判断元素是否属于 RichTextNode
 */
export function isRichTextNodeElement(element: any): boolean {
  return element?.customData?.type === "rich-text-node";
}

/**
 * 判断元素是否为 RichTextNode 的背景元素
 */
export function isRichTextNodeBackground(element: any): boolean {
  return (
    element?.customData?.type === "rich-text-node" &&
    element?.customData?.role === "background"
  );
}

/**
 * 从背景元素获取 RichTextNode 配置
 */
export function getRichTextNodeConfig(
  backgroundElement: any
): RichTextNodeBackgroundCustomData | null {
  if (!isRichTextNodeBackground(backgroundElement)) {
    return null;
  }
  return backgroundElement.customData as RichTextNodeBackgroundCustomData;
}

/**
 * 获取 RichTextNode 的所有元素
 */
export function getRichTextNodeElements(
  elements: readonly any[],
  nodeId: string
): any[] {
  return elements.filter(
    (el) =>
      el.customData?.type === "rich-text-node" &&
      el.customData?.nodeId === nodeId
  );
}

/**
 * 删除 RichTextNode 的所有元素
 */
export function deleteRichTextNode(
  elements: readonly any[],
  nodeId: string
): any[] {
  return elements.map((el) => {
    if (
      el.customData?.type === "rich-text-node" &&
      el.customData?.nodeId === nodeId
    ) {
      return { ...el, isDeleted: true };
    }
    return el;
  });
}
