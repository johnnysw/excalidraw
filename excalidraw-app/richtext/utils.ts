/**
 * RichTextNode 工具函数
 */

import { nanoid } from "nanoid";

/**
 * 生成带前缀的唯一 ID
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${nanoid(8)}`;
}

/**
 * 生成 RichTextNode 的 nodeId
 */
export function generateRichTextNodeId(): string {
  return generatePrefixedId("richtext");
}

/**
 * 将 HEX 颜色与白色混合，生成浅色版本
 */
export function lightenColor(hex: string, amount: number): string {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const newR = Math.round(r + (255 - r) * amount);
  const newG = Math.round(g + (255 - g) * amount);
  const newB = Math.round(b + (255 - b) * amount);

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * 将 HEX 颜色与黑色混合，生成深色版本
 */
export function darkenColor(hex: string, amount: number): string {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const newR = Math.round(r * (1 - amount));
  const newG = Math.round(g * (1 - amount));
  const newB = Math.round(b * (1 - amount));

  return `#${newR.toString(16).padStart(2, "0")}${newG.toString(16).padStart(2, "0")}${newB.toString(16).padStart(2, "0")}`;
}

/**
 * 获取图片尺寸，并根据最大宽高约束进行缩放
 */
export async function getImageSize(
  url: string,
  maxWidth: number = 320,
  maxHeight: number = 240
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth || img.width || 300;
      let height = img.naturalHeight || img.height || 180;
      const widthRatio = maxWidth / width;
      const heightRatio = maxHeight / height;
      const scale = Math.min(1, widthRatio, heightRatio);
      if (scale !== 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      resolve({ width, height });
    };
    img.onerror = () => {
      resolve({ width: 300, height: 180 });
    };
    img.src = url;
  });
}

/**
 * 将 URL 转换为 base64 dataURL
 */
export async function urlToDataURL(
  url: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(url, { cache: "no-store", signal });

  if (!response.ok) {
    throw new Error(
      `[urlToDataURL] Failed to fetch ${url}: ${response.status} ${response.statusText}`
    );
  }

  const blob = await response.blob();

  if (!blob.size) {
    throw new Error(
      `[urlToDataURL] Empty blob for ${url} (maybe served as 304 / from cache)`
    );
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(
        reader.error || new Error("[urlToDataURL] Failed to read blob as dataURL")
      );
    reader.readAsDataURL(blob);
  });
}

/**
 * Loading 占位符 - 一个极小的灰色 SVG
 */
export const LOADING_PLACEHOLDER =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCAxMDAgNjAiPjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iNjAiIGZpbGw9IiNlMGUwZTAiLz48dGV4dCB4PSI1MCIgeT0iMzUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5Mb2FkaW5nLi4uPC90ZXh0Pjwvc3ZnPg==";
