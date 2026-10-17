// -----------------------------------------------------------------------------
// ExcalidrawImageElement & related helpers
// -----------------------------------------------------------------------------

import { MIME_TYPES, SVG_NS } from "@excalidraw/common";

import type {
  AppClassProperties,
  DataURL,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";

import { isInitializedImageElement } from "./typeChecks";

import type {
  ExcalidrawElement,
  FileId,
  InitializedExcalidrawImageElement,
} from "./types";

export interface ImageResourceReader {
  /** Account/workspace/document identity, including reopen generations. */
  scope: string;
  assertCurrent(): void;
  read(source: string, fileId: string): Promise<Response>;
}

let createImageResourceReader: () => ImageResourceReader | undefined = () => undefined;
export const configureImageResourceReader = (factory?: () => ImageResourceReader | undefined) => {
  createImageResourceReader = factory ?? (() => undefined);
};
export const captureImageResourceReader = () => createImageResourceReader();

const loadImage = (source: string) => {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const finish = () => { clearTimeout(timer); image.onload = image.onerror = null; };
    const timer = setTimeout(() => {
      finish(); image.src = ""; reject(new Error("图片加载超时"));
    }, 15_000);
    image.onload = () => {
      finish();
      resolve(image);
    };
    image.onerror = () => {
      finish();
      reject(new Error("图片加载失败"));
    };
    image.src = source;
  });
};

export const readImageResourceBlob = async (response: Response, assertCurrent: () => void) => {
  const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
  const maxBytes = 64 * 1024 * 1024;
  if (!mime.startsWith("image/") || Number(response.headers.get("content-length")) > maxBytes || !response.body) {
    await response.body?.cancel(); throw new Error("图片响应无效");
  }
  const stream = response.body.getReader();
  let size = 0;
  let timedOut = false;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { timedOut = true; void stream.cancel().catch(() => undefined); }, 15_000);
  try {
    while (true) {
      const part = await stream.read();
      assertCurrent();
      if (timedOut) throw new Error("图片读取超时");
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("图片超过 64 MiB");
      chunks.push(part.value);
    }
    if (!size) throw new Error("图片响应为空");
    return new Blob(chunks, { type: mime });
  } finally { clearTimeout(timer); await stream.cancel().catch(() => undefined); stream.releaseLock(); }
};

/** Runtime-only recovery. Never replace a scene's durable source with a blob URL. */
export const loadHTMLImageElement = async (
  dataURL: DataURL,
  fileId?: string,
  reader = createImageResourceReader(),
): Promise<HTMLImageElement> => {
  reader?.assertCurrent();
  try {
    const image = await loadImage(dataURL);
    reader?.assertCurrent();
    return image;
  } catch (error) {
    reader?.assertCurrent();
    if (!fileId || !reader || /^(?:data:|blob:)/i.test(dataURL)) throw error;
    const response = await reader.read(dataURL, fileId);
    reader.assertCurrent();
    if (!response.ok) { await response.body?.cancel(); throw new Error(`图片读取失败（${response.status}）`); }
    const blob = await readImageResourceBlob(response, reader.assertCurrent);
    reader.assertCurrent();
    const objectURL = URL.createObjectURL(blob);
    try {
      const image = await loadImage(objectURL);
      if (image.decode) await image.decode();
      reader.assertCurrent();
      return image;
    } finally { URL.revokeObjectURL(objectURL); }
  }
};

// Failed Promises must not remain in imageCache. A short failure cooldown avoids
// render -> cache-miss -> fetch -> render loops; source/session changes retry immediately.
const imageFailures = new WeakMap<AppClassProperties["imageCache"], Map<FileId, { source: string; scope?: string; time: number }>>();

/** NOTE: updates cache even if already populated with given image. Thus,
 * you should filter out the images upstream if you want to optimize this. */
export const updateImageCache = async ({
  fileIds,
  files,
  imageCache,
}: {
  fileIds: FileId[];
  files: BinaryFiles;
  imageCache: AppClassProperties["imageCache"];
}) => {
  const updatedFiles = new Map<FileId, true>();
  const erroredFiles = new Map<FileId, true>();
  const reader = createImageResourceReader();
  const failures = imageFailures.get(imageCache) ?? new Map<FileId, { source: string; scope?: string; time: number }>();
  imageFailures.set(imageCache, failures);

  await Promise.all(
    fileIds.reduce((promises, fileId) => {
      const fileData = files[fileId as string];
      if (fileData && !updatedFiles.has(fileId)) {
        const failed = failures.get(fileId);
        if (failed?.source === fileData.dataURL && failed.scope === reader?.scope && Date.now() - failed.time < 30_000) return promises;
        updatedFiles.set(fileId, true);
        return promises.concat(
          (async () => {
            let data: { image: Promise<HTMLImageElement>; mimeType: Exclude<typeof fileData.mimeType, typeof MIME_TYPES.binary> } | undefined;
            try {
              if (fileData.mimeType === MIME_TYPES.binary) {
                throw new Error("Only images can be added to ImageCache");
              }

              const imagePromise = loadHTMLImageElement(fileData.dataURL, fileId, reader);
              data = {
                image: imagePromise,
                mimeType: fileData.mimeType,
              } as const;
              // store the promise immediately to indicate there's an in-progress
              // initialization
              imageCache.set(fileId, data);

              const image = await imagePromise;
              // A later scene load can replace an in-flight entry with the same ID.
              if (imageCache.get(fileId) !== data) { updatedFiles.delete(fileId); return; }
              failures.delete(fileId);
              imageCache.set(fileId, { ...data, image });
            } catch (error: any) {
              if (data && imageCache.get(fileId) !== data) { updatedFiles.delete(fileId); return; }
              if (data) imageCache.delete(fileId);
              try { reader?.assertCurrent(); }
              catch { updatedFiles.delete(fileId); return; }
              failures.set(fileId, { source: fileData.dataURL, scope: reader?.scope, time: Date.now() });
              erroredFiles.set(fileId, true);
            }
          })(),
        );
      }
      return promises;
    }, [] as Promise<any>[]),
  );

  return {
    imageCache,
    /** includes errored files because they cache was updated nonetheless */
    updatedFiles,
    /** files that failed when creating HTMLImageElement */
    erroredFiles,
  };
};

export const getInitializedImageElements = (
  elements: readonly ExcalidrawElement[],
) =>
  elements.filter((element) =>
    isInitializedImageElement(element),
  ) as InitializedExcalidrawImageElement[];

export const isHTMLSVGElement = (node: Node | null): node is SVGElement => {
  // lower-casing due to XML/HTML convention differences
  // https://johnresig.com/blog/nodename-case-sensitivity
  return node?.nodeName.toLowerCase() === "svg";
};

export const normalizeSVG = (SVGString: string) => {
  const doc = new DOMParser().parseFromString(SVGString, MIME_TYPES.svg);
  const svg = doc.querySelector("svg");
  const errorNode = doc.querySelector("parsererror");
  if (errorNode || !isHTMLSVGElement(svg)) {
    throw new Error("Invalid SVG");
  } else {
    if (!svg.hasAttribute("xmlns")) {
      svg.setAttribute("xmlns", SVG_NS);
    }

    let width = svg.getAttribute("width");
    let height = svg.getAttribute("height");

    // Do not use % or auto values for width/height
    // to avoid scaling issues when rendering at different sizes/zoom levels
    if (width?.includes("%") || width === "auto") {
      width = null;
    }
    if (height?.includes("%") || height === "auto") {
      height = null;
    }

    const viewBox = svg.getAttribute("viewBox");

    if (!width || !height) {
      width = width || "50";
      height = height || "50";

      if (viewBox) {
        const match = viewBox.match(
          /\d+ +\d+ +(\d+(?:\.\d+)?) +(\d+(?:\.\d+)?)/,
        );
        if (match) {
          [, width, height] = match;
        }
      }

      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
    }

    // Make sure viewBox is set
    if (!viewBox) {
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    return svg.outerHTML;
  }
};
