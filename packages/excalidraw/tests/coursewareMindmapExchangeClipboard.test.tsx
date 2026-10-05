import React from "react";
import {
  createCoursewareMindmapElement,
  getCoursewareMindmap,
} from "@excalidraw/element/coursewareMindmap";
import {
  createMindmapTemplateObject,
  MindmapExchangeCodec,
} from "@excalidraw/mindmap";
import type { FileId } from "@excalidraw/element/types";
import type { BinaryFiles } from "../types";
import { Excalidraw } from "../index";
import * as clipboard from "../clipboard";
import { act, render, unmountComponent, waitFor } from "./test-utils";
import { API } from "./helpers/api";

const { h } = window;
const dataURL = "data:image/png;base64,aW1hZ2U=";
const remoteURL = "https://example.com/mindmap.png";
const response = (ok = true) =>
  ({
    ok,
    blob: async () => new Blob(["image"], { type: "image/png" }),
  }) as Response;
const setup = async (url = remoteURL) => {
  const model = createMindmapTemplateObject(0, 0);
  const child = model.order[1];
  model.nodes[child] = {
    ...model.nodes[child],
    imageAssetId: "image" as FileId,
    imageWidth: 80,
    imageHeight: 40,
  };
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 100,
    y: 100,
  });
  const files = {
    image: {
      id: "image",
      mimeType: "image/png",
      dataURL: url,
      created: 1,
      lastRetrieved: 1,
    },
  } as unknown as BinaryFiles;
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree], files }}
    />,
  );
  act(() => h.app.mindmap.select(tree.id, child));
  return { tree, model, child };
};
const event = () =>
  ({
    preventDefault: vi.fn(),
    clipboardData: { setData: vi.fn() },
  }) as unknown as ClipboardEvent;
beforeEach(() => {
  unmountComponent();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  unmountComponent();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("writes prepared image bytes synchronously through both native clipboard formats", async () => {
  await setup(dataURL);
  const input = event();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  act(() => h.app.mindmap.clipboard.copy(input));
  expect(input.preventDefault).toHaveBeenCalledTimes(1);
  expect(input.clipboardData!.setData).toHaveBeenCalledTimes(2);
  const serialized = vi.mocked(input.clipboardData!.setData).mock.calls[0][1];
  expect(MindmapExchangeCodec.parse(serialized).resources.image.dataURL).toBe(
    dataURL,
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it("prepares remote images before the system copy and never writes the expired native event", async () => {
  await setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  const write = vi
    .spyOn(clipboard, "copyTextToSystemClipboard")
    .mockResolvedValue(undefined);
  const input = event();
  act(() => h.app.mindmap.clipboard.copy(input));
  expect(input.preventDefault).toHaveBeenCalledTimes(1);
  expect(input.clipboardData!.setData).not.toHaveBeenCalled();
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  expect(
    MindmapExchangeCodec.parse(write.mock.calls[0][0]!).resources.image.dataURL,
  ).toMatch(/^data:image\/png;base64,/);
  expect(input.clipboardData!.setData).not.toHaveBeenCalled();
});

it.each(["fetch", "write"])(
  "preserves the original branch when remote cut %s fails",
  async (failure) => {
    const { tree, child } = await setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response(failure !== "fetch")),
    );
    vi.spyOn(clipboard, "copyTextToSystemClipboard").mockRejectedValue(
      new Error("permission denied"),
    );
    const input = event();
    act(() => h.app.mindmap.clipboard.copy(input, true));
    await waitFor(() =>
      expect(h.state.errorMessage).toContain("无法写入剪贴板"),
    );
    expect(
      getCoursewareMindmap(h.elements.find((e) => e.id === tree.id))!.nodes[
        child
      ],
    ).toBeDefined();
    expect(API.getUndoStack()).toHaveLength(0);
    expect(input.clipboardData!.setData).not.toHaveBeenCalled();
  },
);

it.each(["changed", "selection", "locked", "closed"])(
  "keeps the current branch when remote cut target is %s before preparation finishes",
  async (change) => {
    const { tree, child, model } = await setup();
    let release!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            release = resolve;
          }),
      ),
    );
    const write = vi
      .spyOn(clipboard, "copyTextToSystemClipboard")
      .mockResolvedValue(undefined);
    act(() => h.app.mindmap.clipboard.copy(event(), true));
    act(() => {
      if (change === "changed") h.app.mindmap.patch({ color: "#16a34a" });
      if (change === "selection") h.app.mindmap.select(tree.id, model.order[2]);
      if (change === "locked")
        h.app.scene.mutateElement(h.elements.find((e) => e.id === tree.id)!, {
          locked: true,
        });
      if (change === "closed") h.app.mindmap.host.dispose();
    });
    release(response());
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      getCoursewareMindmap(h.elements.find((e) => e.id === tree.id))!.nodes[
        child
      ],
    ).toBeDefined();
  },
);

it("cuts the captured branch only after remote bytes and system clipboard both succeed", async () => {
  const { tree, child } = await setup();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
  const write = vi
    .spyOn(clipboard, "copyTextToSystemClipboard")
    .mockResolvedValue(undefined);
  act(() => h.app.mindmap.clipboard.copy(event(), true));
  await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(
      getCoursewareMindmap(h.elements.find((e) => e.id === tree.id))!.nodes[
        child
      ],
    ).toBeUndefined(),
  );
  expect(API.getUndoStack()).toHaveLength(1);
});
