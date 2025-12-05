/**
 * RichTextNode 相关类型定义
 */

/**
 * 文本片段样式信息
 */
export interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string;
  bgColor?: string;
  fontSize?: number;
}

/**
 * 一行文本（包含多个样式片段）
 */
export interface TextLine {
  segments: TextSegment[];
  imageAfter?: ParsedImage;
}

/**
 * 解析出的图片信息
 */
export interface ParsedImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

/**
 * 解析后的富文本结构
 */
export interface ParsedRichText {
  plainText: string;
  lines: TextLine[];
  images: ParsedImage[];
}

/**
 * 基础布局文本项
 */
export interface BaseLayoutTextItem {
  text: string;
  color?: string;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  lineIndex: number;
  offsetX: number;
}

/**
 * 布局配置选项
 */
export interface LayoutSegmentsOptions {
  startLineIndex: number;
  startOffsetX?: number;
  maxWidth: number;
  measureText: (text: string, bold?: boolean) => number;
}

/**
 * RichTextNode 创建配置
 */
export interface RichTextNodeConfig {
  /** 节点中心 X 坐标 */
  x: number;
  /** 节点中心 Y 坐标 */
  y: number;
  /** 节点唯一标识（可选，不传则自动生成） */
  nodeId?: string;
  /** HTML 内容 */
  html: string;
  /** 最大宽度（像素） */
  maxWidth?: number;
  /** 字号（像素） */
  fontSize?: number;
  /** 默认文字颜色 */
  defaultColor?: string;
  /** 内边距（像素） */
  padding?: number;
}

/**
 * 图片信息（带位置）
 */
export interface ImageInfoWithPosition {
  src: string;
  width: number;
  height: number;
  fileId: string;
}
