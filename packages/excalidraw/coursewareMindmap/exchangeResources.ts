import {
  collectMindmapResourceIds,
  type MindmapObject,
  type MindmapResource,
} from "@excalidraw/mindmap";
import { getDataURL } from "../data/blob";
import type { BinaryFiles } from "../types";

type MindmapImageFetcher = (source: string, fileId: string) => Promise<Response>;
let createImageFetcher: () => MindmapImageFetcher = () => (source) => fetch(source);

export const configureCoursewareMindmapImageFetcher = (
  factory: () => MindmapImageFetcher,
) => {
  createImageFetcher = factory;
};

export const prepareMindmapExchangeResources = async (
  models: readonly MindmapObject[],
  files: BinaryFiles,
): Promise<Record<string, MindmapResource>> => {
  const ids = [...new Set(models.flatMap(collectMindmapResourceIds))];
  const imageFetcher = createImageFetcher();
  const resources: Record<string, MindmapResource> = {};
  for (let index = 0; index < ids.length; index += 4) {
    await Promise.all(
      ids.slice(index, index + 4).map(async (id) => {
        const file = files[id];
        if (!file?.dataURL) throw new Error("脑图图片资源缺失，请重新加载后重试");
        let dataURL = file.dataURL;
        let mimeType: string = file.mimeType;
        if (!dataURL.startsWith("data:")) {
          const response = await imageFetcher(dataURL, id);
          if (!response.ok) throw new Error("脑图图片读取失败，请稍后重试");
          const blob = await response.blob();
          mimeType = blob.type || mimeType;
          if (!mimeType.startsWith("image/"))
            throw new Error("脑图图片资源无效，未导出任何内容");
          dataURL = await getDataURL(
            blob.type ? blob : new Blob([blob], { type: mimeType }),
          );
        }
        if (!dataURL.startsWith("data:image/"))
          throw new Error("脑图图片资源无效，未导出任何内容");
        resources[id] = { id, dataURL, mimeType };
      }),
    );
  }
  return resources;
};
