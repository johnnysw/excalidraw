import React from "react";
import { createMindmapTemplateObject } from "@excalidraw/mindmap";
import {
  createCoursewareMindmapElement,
  getCoursewareMindmap,
} from "@excalidraw/element/coursewareMindmap";
import { Excalidraw } from "../index";
import {
  actionBringToFront,
  actionDuplicateSelection,
  actionFlipHorizontal,
  actionToggleElementLock,
} from "../actions";
import type { Action } from "../actions/types";
import * as clipboard from "../clipboard";
import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, screen, unmountComponent } from "./test-utils";

const { h } = window;
const setup = async (imageWidth?: number) => {
  const model = createMindmapTemplateObject(0, 0);
  if (imageWidth !== undefined) {
    model.nodes[model.rootId] = {
      ...model.nodes[model.rootId],
      imageAssetId: "test-image",
      imageWidth,
      imageHeight: 56,
    };
  }
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 100,
    y: 120,
  });
  const rectangle = API.createElement({ type: "rectangle", x: 800, y: 200 });
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree, rectangle] }}
    />,
  );
  act(() => h.app.mindmap.select(tree.id, model.rootId));
  return { tree, model, rectangle, controller: h.app.mindmap };
};
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps root more actions unique, hides invalid relations, and enables copied node style", async () => {
  const { controller, tree, model } = await setup();
  fireEvent.click(screen.getByRole("button", { name: "更多对象操作" }));
  expect(screen.queryByRole("menuitem", { name: /新增同级主题/ })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: /新增父主题/ })).toBeNull();
  expect(
    screen.getAllByRole("menuitem", { name: /复制整图为图片/ }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("menuitem", { name: /创建整图副本/ }),
  ).toHaveLength(1);
  expect(screen.getByRole("menuitem", { name: /粘贴节点样式/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("menuitem", { name: /复制节点样式/ }));
  act(() => controller.select(tree.id, model.order[1]));
  fireEvent.click(screen.getByRole("button", { name: "更多对象操作" }));
  expect(
    screen.getByRole("menuitem", { name: /粘贴节点样式/ }),
  ).not.toBeDisabled();
  expect(
    screen.getByRole("menuitem", { name: /复制分支为图片/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("menuitem", { name: /^复制整图为图片$/ }),
  ).toBeInTheDocument();
});

it("keeps node selection after layers and flips, selecting the actual duplicate or lock result", async () => {
  const { controller, tree, model } = await setup();
  const selection = controller.getSnapshot().selection;
  await act(async () => {
    await controller.wholeAction(actionBringToFront);
  });
  expect(h.elements.at(-1)?.id).toBe(tree.id);
  expect(controller.getSnapshot().selection).toEqual(selection);
  expect(h.state.selectedElementIds).toEqual({});
  await act(async () => {
    await controller.wholeAction(actionFlipHorizontal);
  });
  expect(controller.getSnapshot().selection).toEqual(selection);
  await act(async () => {
    await controller.wholeAction(actionDuplicateSelection);
  });
  expect(controller.getSnapshot().selection).toBeNull();
  const duplicateId = Object.keys(h.state.selectedElementIds)[0];
  expect(duplicateId).not.toBe(tree.id);
  const duplicate = h.elements.find((element) => element.id === duplicateId)!;
  expect(getCoursewareMindmap(duplicate)?.rootId).not.toBe(model.rootId);
  act(() => controller.select(tree.id, model.rootId));
  await act(async () => {
    await controller.wholeAction(actionToggleElementLock);
  });
  expect(controller.getSnapshot().selection).toBeNull();
  expect(h.elements.find((element) => element.id === tree.id)?.locked).toBe(
    true,
  );
});

it("previews continuous node adjustments without scene writes and commits once", async () => {
  const { controller, tree, model } = await setup();
  const original = controller.node!.opacity;
  act(() => controller.previewPatch({ opacity: 0.3 }));
  act(() => controller.previewPatch({ opacity: 0.45 }));
  expect(controller.node!.opacity).toBe(original);
  expect(
    getCoursewareMindmap(controller.getSnapshot().preview!)!.nodes[model.rootId]
      .opacity,
  ).toBe(0.45);
  expect(API.getUndoStack()).toHaveLength(0);
  act(() => controller.commitPreviewPatch());
  expect(controller.node!.opacity).toBe(0.45);
  expect(API.getUndoStack()).toHaveLength(1);
  act(() => controller.previewPatch({ opacity: 0.8 }));
  act(() => controller.previewPatch(null));
  act(() => controller.commitPreviewPatch());
  expect(controller.node!.opacity).toBe(0.45);
  Keyboard.undo();
  expect(
    getCoursewareMindmap(h.elements.find((element) => element.id === tree.id)!)!
      .nodes[model.rootId].opacity,
  ).toBe(original);
});

it("discards a cancelled preview patch before starting the next adjustment", async () => {
  const { controller } = await setup();
  const originalOpacity = controller.node!.opacity;
  const originalFontSize = controller.node!.fontSize ?? 14;
  act(() => controller.previewPatch({ opacity: 0.3 }));
  act(() => controller.notify({ preview: null }));
  act(() => controller.previewPatch({ fontSize: originalFontSize + 1 }));
  act(() => controller.commitPreviewPatch());
  expect(controller.node!.opacity).toBe(originalOpacity);
  expect(controller.node!.fontSize).toBe(originalFontSize + 1);
  expect(API.getUndoStack()).toHaveLength(1);
});

it("respects whole-map action predicates with the actual map selection", async () => {
  const { controller, tree } = await setup();
  const perform = vi.fn(actionBringToFront.perform);
  const predicate = vi.fn(
    (..._args: Parameters<NonNullable<Action["predicate"]>>) => false,
  );
  await act(async () => {
    await controller.wholeAction({ ...actionBringToFront, predicate, perform });
  });
  expect(predicate.mock.calls[0][1].selectedElementIds).toEqual({
    [tree.id]: true,
  });
  expect(perform).not.toHaveBeenCalled();
  expect(API.getUndoStack()).toHaveLength(0);
});

it("pastes branch clipboard as a child and ignores unrelated or empty clipboard", async () => {
  const { controller, tree, model } = await setup();
  const contents = new Map<string, string>();
  const event = {
    preventDefault: vi.fn(),
    clipboardData: {
      files: [],
      setData: (type: string, value: string) => contents.set(type, value),
      getData: (type: string) => contents.get(type) ?? "",
    },
  } as unknown as ClipboardEvent;
  const source = model.order[1];
  const target = model.order[2];
  act(() => {
    controller.select(tree.id, source);
    controller.clipboard.copy(event);
    controller.select(tree.id, target);
  });
  await act(async () => {
    expect(await controller.clipboard.paste(event)).toBe(true);
  });
  expect(controller.node!.parentId).toBe(target);
  expect(controller.node!.id).not.toBe(source);
  expect(API.getUndoStack()).toHaveLength(1);
  contents.clear();
  expect(await controller.clipboard.paste(event)).toBe(false);
  contents.set("text/plain", "ordinary text");
  expect(await controller.clipboard.paste(event)).toBe(false);
});

it("routes menu paste through the same App pipeline with an explicit menu origin", async () => {
  const { controller } = await setup();
  vi.spyOn(clipboard, "readSystemClipboard").mockResolvedValue({
    "text/plain": "a normal pasted object",
  });
  const paste = vi
    .spyOn(h.app, "pasteFromClipboard")
    .mockResolvedValue(undefined);
  await act(async () => {
    await controller.clipboard.pasteFromMenu();
  });
  expect(paste).toHaveBeenCalledTimes(1);
  expect(paste.mock.calls[0][0].fromMindmapMenu).toBe(true);
  expect(paste.mock.calls[0][0].clipboardData?.getData("text/plain")).toBe(
    "a normal pasted object",
  );
});

it("does not cut a node when system clipboard write fails", async () => {
  const { controller, tree } = await setup();
  vi.spyOn(clipboard, "copyTextToSystemClipboard").mockRejectedValue(
    new Error("permission denied"),
  );
  await act(async () => {
    controller.clipboard.copy(undefined, true);
    await Promise.resolve();
  });
  expect(h.elements.find((element) => element.id === tree.id)?.isDeleted).toBe(
    false,
  );
  expect(h.state.errorMessage).toContain("无法写入剪贴板");
});

it("pastes a whole map from the menu even with the pointer outside the canvas", async () => {
  const { controller, tree, model } = await setup();
  const serialized = clipboard.serializeAsClipboardJSON({
    elements: [tree],
    files: {},
  });
  vi.spyOn(clipboard, "readSystemClipboard").mockResolvedValue({
    "text/plain": serialized,
  });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => document.body),
  });
  await act(async () => {
    await controller.clipboard.pasteFromMenu();
  });
  const maps = h.elements.filter((element) => !!getCoursewareMindmap(element));
  expect(maps).toHaveLength(2);
  expect(controller.getSnapshot().selection).toBeNull();
  const pasted = maps.find((element) => element.id !== tree.id)!;
  expect(h.state.selectedElementIds[pasted.id]).toBe(true);
  expect(getCoursewareMindmap(pasted)?.rootId).not.toBe(model.rootId);
});

it.each([false, true])(
  "captures ordinary clipboard data synchronously before awaiting mindmap paste (menu: %s)",
  async (fromMindmapMenu) => {
    const { tree } = await setup();
    const serialized = clipboard.serializeAsClipboardJSON({
      elements: [tree],
      files: {},
    });
    const event = Object.assign(
      clipboard.createPasteEvent({ types: { "text/plain": serialized } }),
      { fromMindmapMenu },
    );
    let clipboardAvailable = true;
    vi.spyOn(event.clipboardData!, "getData").mockImplementation((type) =>
      clipboardAvailable && type === "text/plain" ? serialized : "",
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => document.querySelector("canvas")),
    });
    h.app.focusContainer();
    await act(async () => {
      queueMicrotask(() => {
        clipboardAvailable = false;
      });
      await h.app.pasteFromClipboard(event);
    });
    expect(
      h.elements.filter((element) => !!getCoursewareMindmap(element)),
    ).toHaveLength(2);
  },
);

it("opens one submenu at a time and supports keyboard entry and return", async () => {
  await setup();
  fireEvent.click(screen.getByRole("button", { name: "更多对象操作" }));
  const layers = screen.getByRole("menuitem", { name: "层级" });
  layers.focus();
  fireEvent.keyDown(layers, { key: "ArrowRight" });
  expect(screen.getByRole("menu", { name: "整图层级" })).toBeInTheDocument();
  const first = screen.getByRole("menuitem", { name: /置于顶层/ });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "ArrowLeft" });
  expect(screen.queryByRole("menu", { name: "整图层级" })).toBeNull();
  fireEvent.pointerEnter(layers);
  fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "节点设置" }));
  expect(screen.queryByRole("menu", { name: "整图层级" })).toBeNull();
  expect(screen.getByRole("menu", { name: "节点设置" })).toBeInTheDocument();
});

const openImageWidthInput = () => {
  fireEvent.click(screen.getByRole("button", { name: "更多对象操作" }));
  fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "节点设置" }));
  const input = screen.getByRole("spinbutton", { name: "节点图片宽度" });
  act(() => input.focus());
  return input;
};

it("commits image width before an outside canvas pointerdown dismisses the node menu", async () => {
  const { tree, model, controller } = await setup(96.5);
  const input = openImageWidthInput();
  fireEvent.change(input, { target: { value: "145.25" } });
  fireEvent.pointerDown(document.querySelector("canvas.interactive")!, {
    pointerId: 77,
    pointerType: "mouse",
    button: 0,
    clientX: 1000,
    clientY: 600,
  });
  const live = getCoursewareMindmap(
    h.elements.find((element) => element.id === tree.id)!,
  )!;
  expect(live.nodes[model.rootId].imageWidth).toBe(145.25);
  expect(live.nodes[model.rootId].imageHeight).toBeCloseTo(
    (145.25 * 56) / 96.5,
  );
  expect(API.getUndoStack()).toHaveLength(1);
  expect(controller.getSnapshot().selection).toBeNull();
});

it("restores the precise fractional image width on Escape without creating history", async () => {
  const { controller } = await setup(96.5);
  const input = openImageWidthInput();
  expect(input).toHaveValue(96.5);
  fireEvent.change(input, { target: { value: "180.75" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue(96.5);
  expect(controller.node!.imageWidth).toBe(96.5);
  expect(controller.node!.imageHeight).toBe(56);
  expect(API.getUndoStack()).toHaveLength(0);
});

it("commits image width once on Enter and preserves its exact value on dismissal", async () => {
  const { controller } = await setup(96.5);
  const input = openImageWidthInput();
  fireEvent.change(input, { target: { value: "145.25" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(controller.node!.imageWidth).toBe(145.25);
  expect(API.getUndoStack()).toHaveLength(1);
  fireEvent.pointerDown(document.body);
  expect(API.getUndoStack()).toHaveLength(1);
});

it("commits a focused image width when hovering another submenu removes the input", async () => {
  const { controller } = await setup(96.5);
  const input = openImageWidthInput();
  fireEvent.change(input, { target: { value: "145.25" } });
  fireEvent.pointerEnter(screen.getByRole("menuitem", { name: "层级" }));
  expect(screen.queryByRole("spinbutton", { name: "节点图片宽度" })).toBeNull();
  expect(controller.node!.imageWidth).toBe(145.25);
  expect(API.getUndoStack()).toHaveLength(1);
});
