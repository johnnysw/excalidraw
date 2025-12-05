/**
 * RichTextNode 模块入口
 *
 * 提供创建、编辑、删除 RichTextNode 的完整功能
 */

// 类型导出
export type {
  TextSegment,
  TextLine,
  ParsedImage,
  ParsedRichText,
  BaseLayoutTextItem,
  LayoutSegmentsOptions,
  RichTextNodeConfig,
  ImageInfoWithPosition,
} from "./types";

// 解析器
export { parseRichTextHtml } from "./parser";

// 布局
export {
  getSharedMeasureContext,
  createMeasureTextFn,
  layoutTextSegments,
} from "./layout";

// 工具函数
export {
  generatePrefixedId,
  generateRichTextNodeId,
  lightenColor,
  darkenColor,
  getImageSize,
  urlToDataURL,
  LOADING_PLACEHOLDER,
} from "./utils";

// 元素创建
export {
  createRichTextNodeElementsAsync,
  isRichTextNodeElement,
  isRichTextNodeBackground,
  getRichTextNodeConfig,
  getRichTextNodeElements,
  deleteRichTextNode,
} from "./createElement";

// UI 组件
export { RichTextEditor } from "./RichTextEditor";
export type { RichTextEditorProps } from "./RichTextEditor";
export { RichTextEditorOverlay } from "./RichTextEditorOverlay";
export type { RichTextEditorOverlayProps } from "./RichTextEditorOverlay";

// Hooks
export { useRichTextTool } from "./useRichTextTool";
export type { RichTextEditorState, UseRichTextToolOptions } from "./useRichTextTool";
