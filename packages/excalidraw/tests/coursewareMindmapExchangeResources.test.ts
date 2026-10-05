import {
  createMindmapTemplateObject,
  MindmapExchangeCodec,
} from "@excalidraw/mindmap";
import {
  configureCoursewareMindmapImageFetcher,
  prepareMindmapExchangeResources,
} from "../coursewareMindmap/exchangeResources";
import type { BinaryFiles } from "../types";

const fixture = (dataURL: string) => {
  const model = createMindmapTemplateObject();
  model.nodes[model.order[1]].collapsed = true;
  model.nodes[model.order[2]].imageAssetId = "image";
  const files = {
    image: { id: "image", dataURL, mimeType: "image/png" },
    unrelated: { id: "unrelated", dataURL: "https://example.com/unused.png", mimeType: "image/png" },
  } as unknown as BinaryFiles;
  return { model, files };
};

afterEach(() => {
  configureCoursewareMindmapImageFetcher(() => (source) => fetch(source));
  vi.unstubAllGlobals();
});

it("embeds saved remote images for offline codec roundtrips without changing host files", async () => {
  const { model, files } = fixture("https://example.com/image.png");
  const fetchImage = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  }));
  vi.stubGlobal("fetch", fetchImage);
  const resources = await prepareMindmapExchangeResources([model, model], files);
  expect(fetchImage).toHaveBeenCalledTimes(1);
  expect(Object.keys(resources)).toEqual(["image"]);
  expect(resources.image.dataURL).toMatch(/^data:image\/png;base64,/);
  expect(files.image.dataURL).toBe("https://example.com/image.png");
  const parsed = MindmapExchangeCodec.parse(MindmapExchangeCodec.serialize(model, resources));
  expect(parsed.resources).toEqual(resources);
  expect(parsed.warnings).toEqual([]);
});

it("keeps existing embedded images without network access and requires all referenced resources", async () => {
  const { model, files } = fixture("data:image/png;base64,AQID");
  const fetchImage = vi.fn();
  vi.stubGlobal("fetch", fetchImage);
  expect((await prepareMindmapExchangeResources([model], files)).image.dataURL).toBe(files.image.dataURL);
  expect(fetchImage).not.toHaveBeenCalled();
  await expect(prepareMindmapExchangeResources([model], {})).rejects.toThrow("资源缺失");
});

it("rejects failed requests and nonimage responses instead of exporting an unusable payload", async () => {
  const { model, files } = fixture("https://example.com/image.png");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  await expect(prepareMindmapExchangeResources([model], files)).rejects.toThrow("读取失败");
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["login required"], { type: "text/html" }),
  })));
  await expect(prepareMindmapExchangeResources([model], files)).rejects.toThrow("资源无效");
});

it("uses the host's authorized image reader when browser fetch cannot read saved images", async () => {
  const { model, files } = fixture("https://example.com/image.png");
  const browserFetch = vi.fn(() => Promise.reject(new Error("Failed to fetch")));
  vi.stubGlobal("fetch", browserFetch);
  const authorizedFetch = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
  } as Response));
  configureCoursewareMindmapImageFetcher(() => authorizedFetch);
  const resources = await prepareMindmapExchangeResources([model], files);
  expect(authorizedFetch).toHaveBeenCalledWith(files.image.dataURL, "image");
  expect(browserFetch).not.toHaveBeenCalled();
  expect(MindmapExchangeCodec.parse(MindmapExchangeCodec.serialize(model, resources)).warnings).toEqual([]);
});
