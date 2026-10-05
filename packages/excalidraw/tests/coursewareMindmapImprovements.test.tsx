import React from "react";
import {
  createCoursewareMindmapElement,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
  coursewareMindmapLocalToScene,
  isCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { resolveMindmapNodeBinding } from "@excalidraw/element/coursewareMindmapBinding";
import { newElementWith } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";
import {
  createMindmapTemplateObject,
  MindmapExchangeCodec,
} from "@excalidraw/mindmap";
import { Excalidraw } from "../index";
import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, fireEvent, render, screen, unmountComponent } from "./test-utils";
const { h } = window;
const live = (id: string) => h.elements.find((e) => e.id === id)!;
const model = (id: string) => getCoursewareMindmap(live(id))!;
const setup = async () => {
  const first = createCoursewareMindmapElement({
    mindmap: createMindmapTemplateObject(0, 0),
    x: 100,
    y: 100,
  });
  const second = createCoursewareMindmapElement({
    mindmap: createMindmapTemplateObject(0, 0),
    x: 700,
    y: 300,
  });
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [first, second] }}
    />,
  );
  act(() => h.app.mindmap.select(first.id, model(first.id).order[1]));
  return { first, second };
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
  vi.unstubAllGlobals();
});
describe("courseware shared mindmap improvement contracts", () => {
  it("promotes a native canvas box selection to the whole map without saving", async () => {
    const { first } = await setup();
    act(() => h.app.mindmap.clear());
    const before = JSON.stringify(h.elements);
    const element = live(first.id);
    if (!isCoursewareMindmapElement(element))
      throw new Error("Mindmap fixture missing");
    const geometry = getCoursewareMindmapGeometry(element)!;
    const points = Object.values(geometry.nodes).flatMap((box) => [
      coursewareMindmapLocalToScene(element, { x: box.x, y: box.y }),
      coursewareMindmapLocalToScene(element, {
        x: box.x + box.width,
        y: box.y + box.height,
      }),
    ]);
    const start = sceneCoordsToViewportCoords(
      {
        sceneX: Math.min(...points.map((p) => p.x)) - 20,
        sceneY: Math.min(...points.map((p) => p.y)) - 20,
      },
      h.state,
    );
    const end = sceneCoordsToViewportCoords(
      {
        sceneX: Math.max(...points.map((p) => p.x)) + 20,
        sceneY: Math.max(...points.map((p) => p.y)) + 20,
      },
      h.state,
    );
    const mouse = new Pointer("mouse");
    mouse.downAt(start.x, start.y);
    mouse.moveTo(end.x, end.y);
    mouse.up();
    expect(h.app.mindmap.getSnapshot().selection).toBeNull();
    expect(h.state.selectedElementIds[first.id]).toBe(true);
    expect(h.state.selectedElementIds).not.toHaveProperty("undefined");
    expect(JSON.stringify(h.elements)).toBe(before);
    expect(API.getUndoStack().every((entry) => entry.elements.isEmpty())).toBe(
      true,
    );
  });
  it.each([
    { text: "# 中心主题\n- 子内容", expected: ["中心主题"], child: "子内容" },
    {
      text: "- 第一主题\n- 第二主题",
      expected: ["第一主题", "第二主题"],
      child: null,
    },
  ])(
    "uses explicit Markdown roots when importing $text",
    async ({ text, expected, child }) => {
      const { first } = await setup();
      const targetId = model(first.id).order[1];
      const before = model(first.id);
      await act(async () => h.app.mindmap.importExchange(text, "markdown"));
      const next = model(first.id);
      const importedRoots = next.order.filter(
        (id) => !before.nodes[id] && next.nodes[id].parentId === targetId,
      );
      expect(importedRoots.map((id) => next.nodes[id].label)).toEqual(expected);
      if (child) {
        const descendants = next.order.filter(
          (id) => next.nodes[id].parentId === importedRoots[0],
        );
        expect(descendants.map((id) => next.nodes[id].label)).toEqual([child]);
      }
      expect(API.getUndoStack()).toHaveLength(1);
      Keyboard.undo();
      expect(model(first.id)).toEqual(before);
    },
  );
  it("cancels pending creation without saving an empty node or history", async () => {
    const { first } = await setup();
    const before = JSON.stringify(live(first.id));
    act(() => h.app.mindmap.add("child"));
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "编辑脑图主题" }), {
      key: "Escape",
    });
    expect(JSON.stringify(live(first.id))).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("commits Enter once and creates a following sibling only after the next Enter", async () => {
    const { first } = await setup();
    const original = model(first.id).order.length;
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", { name: "编辑脑图主题" });
    fireEvent.change(editor, { target: { value: "录入的新文字" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(model(first.id).order).toHaveLength(original);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.keyPress("Enter");
    expect(
      screen.getByRole("textbox", { name: "编辑脑图主题" }),
    ).toBeInTheDocument();
    expect(model(first.id).order).toHaveLength(original);
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("applies a style across maps in one undo without changing unselected nodes", async () => {
    const { first, second } = await setup();
    const a = model(first.id).order[1],
      b = model(second.id).order[1];
    const before = [model(first.id), model(second.id)];
    act(() => {
      h.app.mindmap.notify({
        selections: [
          { elementId: first.id, nodeId: a },
          { elementId: second.id, nodeId: b },
        ],
      });
      h.app.mindmap.patch({ color: "#16a34a" });
    });
    expect(model(first.id).nodes[a].color).toBe("#16a34a");
    expect(model(second.id).nodes[b].color).toBe("#16a34a");
    expect(model(first.id).nodes[before[0].rootId].color).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(model(first.id).nodes).toEqual(before[0].nodes);
    expect(model(second.id).nodes).toEqual(before[1].nodes);
  });
  it("deletes branches across two maps and restores models and external references with one undo", async () => {
    const { first, second } = await setup();
    const a = model(first.id).order[1],
      b = model(second.id).order[2];
    const bindingA = {
      elementId: first.id,
      fixedPoint: [1, 0.5] as [number, number],
      mode: "inside" as const,
      mindmapNodeId: a,
      mindmapNodePoint: [1, 0.5] as [number, number],
    };
    const bindingB = {
      ...bindingA,
      elementId: second.id,
      mindmapNodeId: b,
      fixedPoint: [0, 0.5] as [number, number],
      mindmapNodePoint: [0, 0.5] as [number, number],
    };
    const start = resolveMindmapNodeBinding(first, bindingA)!,
      end = resolveMindmapNodeBinding(second, bindingB)!;
    const arrow = API.createElement({
      type: "arrow",
      x: start[0],
      y: start[1],
      width: Math.abs(end[0] - start[0]),
      height: Math.abs(end[1] - start[1]),
      points: [
        pointFrom(0, 0),
        pointFrom(end[0] - start[0], end[1] - start[1]),
      ],
      startBinding: bindingA,
      endBinding: bindingB,
    });
    const fixture = [
      ...h.elements.map((element) =>
        [first.id, second.id].includes(element.id)
          ? newElementWith(element, {
              boundElements: [{ id: arrow.id, type: "arrow" }],
            })
          : element,
      ),
      arrow,
    ];
    unmountComponent();
    await render(
      <Excalidraw
        role="teacher"
        handleKeyboardGlobally
        UIOptions={{ toolbarLayout: "left" }}
        initialData={{ elements: fixture }}
      />,
    );
    act(() => h.app.mindmap.select(first.id, a));
    const before = [model(first.id), model(second.id)];
    const restoredArrow = live(arrow.id);
    const arrowBefore = {
      x: restoredArrow.x,
      y: restoredArrow.y,
      points: "points" in restoredArrow ? restoredArrow.points : [],
      startBinding:
        "startBinding" in restoredArrow ? restoredArrow.startBinding : null,
      endBinding:
        "endBinding" in restoredArrow ? restoredArrow.endBinding : null,
      isDeleted: restoredArrow.isDeleted,
    };
    act(() => {
      h.app.mindmap.notify({
        selections: [
          { elementId: first.id, nodeId: a },
          { elementId: second.id, nodeId: b },
        ],
      });
      h.app.mindmap.remove();
    });
    expect(model(first.id).nodes[a]).toBeUndefined();
    expect(model(second.id).nodes[b]).toBeUndefined();
    expect(live(arrow.id).isDeleted).toBe(true);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(model(first.id)).toEqual(before[0]);
    expect(model(second.id)).toEqual(before[1]);
    expect(live(arrow.id)).toMatchObject(arrowBefore);
    expect(live(first.id).boundElements).toContainEqual({
      id: arrow.id,
      type: "arrow",
    });
    expect(live(second.id).boundElements).toContainEqual({
      id: arrow.id,
      type: "arrow",
    });
  });
  it("keeps multi-map width drafts out of the scene and clears every preview on cancel", async () => {
    const { first, second } = await setup();
    const a = model(first.id).order[1],
      b = model(second.id).order[1];
    const before = JSON.stringify(h.elements);
    act(() => {
      h.app.mindmap.notify({
        selections: [
          { elementId: first.id, nodeId: a },
          { elementId: second.id, nodeId: b },
        ],
      });
      h.app.mindmap.previewPatch({ widthMode: "fixed", textMaxWidth: 100 });
    });
    expect(h.app.mindmap.getSnapshot().previews).toHaveLength(2);
    expect(JSON.stringify(h.elements)).toBe(before);
    act(() => h.app.mindmap.previewPatch(null));
    expect(h.app.mindmap.getSnapshot().previews).toEqual([]);
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("preserves professional references when copying a complete branch and remaps all IDs on paste", async () => {
    const { first } = await setup();
    const siblings = model(first.id).order.slice(1, 3);
    const root = model(first.id).rootId;
    act(() => {
      h.app.mindmap.select(first.id, root);
      h.app.mindmap.command({
        type: "summary",
        value: { id: "summary", nodeIds: siblings, label: "总结" },
      });
      h.app.mindmap.command({
        type: "boundary",
        value: { id: "boundary", nodeIds: siblings, title: "分组" },
      });
      h.app.mindmap.command({
        type: "relation",
        value: { id: "relation", sourceId: siblings[0], targetId: siblings[1] },
      });
    });
    const serialized = MindmapExchangeCodec.serialize(
      model(first.id),
      {},
      siblings,
    );
    await act(async () =>
      h.app.mindmap.importExchange(serialized, "json", "child", "branches"),
    );
    const after = model(first.id);
    expect(after.order).toHaveLength(6);
    expect(after.summaries).toHaveLength(2);
    expect(after.boundaries).toHaveLength(2);
    expect(after.relations).toHaveLength(2);
    expect(
      after.summaries![1].nodeIds.every((id) => !siblings.includes(id)),
    ).toBe(true);
    Keyboard.undo();
    expect(model(first.id).order).toHaveLength(4);
    expect(model(first.id).summaries).toHaveLength(1);
  });
  it("inserts portable branch clipboard as sibling immediately after the original", async () => {
    const { first, second } = await setup();
    const anchor = model(first.id).order[1];
    const other = model(second.id).order[1];
    const serialized = MindmapExchangeCodec.serialize(model(second.id), {}, [
      other,
    ]);
    await act(async () =>
      h.app.mindmap.importExchange(serialized, "json", "sibling"),
    );
    const current = model(first.id),
      pasted = h.app.mindmap.node!;
    expect(pasted.parentId).toBe(current.rootId);
    expect(current.order.indexOf(pasted.id)).toBe(
      current.order.indexOf(anchor) + 1,
    );
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("continues async import at its captured target when the user selects another map", async () => {
    const { first, second } = await setup();
    const target = model(first.id).order[1];
    const serialized = MindmapExchangeCodec.serialize(model(second.id), {}, [
      model(second.id).order[1],
    ]);
    let release!: () => void;
    const prepare = h.app.mindmap.host.prepareResources.bind(
      h.app.mindmap.host,
    );
    vi.spyOn(h.app.mindmap.host, "prepareResources").mockImplementation(
      (resources) =>
        new Promise((resolve, reject) => {
          release = () => {
            prepare(resources).then(resolve, reject);
          };
        }),
    );
    const pending = h.app.mindmap.importExchange(serialized, "json");
    act(() => h.app.mindmap.select(second.id, model(second.id).rootId));
    await act(async () => {
      release();
      await pending;
    });
    expect(model(first.id).order).toHaveLength(5);
    expect(model(second.id).order).toHaveLength(4);
    expect(
      Object.values(model(first.id).nodes).filter((n) => n.parentId === target),
    ).toHaveLength(1);
    expect(h.app.mindmap.element!.id).toBe(second.id);
  });
  it("formats a selected text range, commits one operation and cancels later draft formatting", async () => {
    const { first } = await setup();
    const node = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", {
      name: "编辑脑图主题",
    }) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 2);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole("button", { name: "选区粗体" }));
    expect(model(first.id).nodes[node].labelStyleRanges).toBeUndefined();
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(model(first.id).nodes[node].labelStyleRanges).toContainEqual(
      expect.objectContaining({ start: 0, end: 2, bold: true }),
    );
    expect(API.getUndoStack()).toHaveLength(1);
    const before = JSON.stringify(live(first.id));
    act(() => h.app.mindmap.startEditing());
    fireEvent.click(screen.getByRole("button", { name: "选区下划线" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "编辑脑图主题" }), {
      key: "Escape",
    });
    expect(JSON.stringify(live(first.id))).toBe(before);
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("keeps overlapping resource preparations isolated and reserves conflicting IDs", async () => {
    await setup();
    const first = {
      image: {
        id: "image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,first",
      },
    };
    const second = {
      image: {
        id: "image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,second",
      },
    };
    let releaseFirst!: () => void, releaseSecond!: () => void;
    let calls = 0;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          return new Promise<void>((resolve) => {
            if (calls++ === 0) releaseFirst = resolve;
            else releaseSecond = resolve;
          });
        }
      },
    );
    const a = h.app.mindmap.host.prepareResources(first),
      b = h.app.mindmap.host.prepareResources(second);
    releaseFirst();
    releaseSecond();
    const [mapA, mapB] = await Promise.all([a, b]);
    expect(mapA.image).not.toBe(mapB.image);
    const filesA = h.app.mindmap.host.takePreparedResources(mapA),
      filesB = h.app.mindmap.host.takePreparedResources(mapB);
    expect(filesA[0].dataURL).toBe(first.image.dataURL);
    expect(filesB[0].dataURL).toBe(second.image.dataURL);
    expect(filesA[0].id).toBe(mapA.image);
    expect(filesB[0].id).toBe(mapB.image);
    expect(h.app.mindmap.host.takePreparedResources(mapA)).toEqual([]);
  });
  it("cancels an unfinished image preparation when the editor closes", async () => {
    await setup();
    let release!: () => void;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
    );
    const pending = h.app.mindmap.host.prepareResources({
      image: {
        id: "image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,image",
      },
    });
    h.app.mindmap.host.dispose();
    release();
    await expect(pending).rejects.toThrow("编辑器已关闭");
    expect(h.app.files.image).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("reactivates imports after a StrictMode lifecycle without reviving old resource work", async () => {
    await setup();
    let release!: () => void;
    vi.stubGlobal(
      "Image",
      class {
        src = "";
        decode() {
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        }
      },
    );
    const host = h.app.mindmap.host;
    const pending = host.prepareResources({
      image: {
        id: "image",
        mimeType: "image/png",
        dataURL: "data:image/png;base64,image",
      },
    });
    host.dispose();
    h.app.mindmap.activate();
    release();
    await expect(pending).rejects.toThrow("编辑器已关闭");
    await expect(host.prepareResources({})).resolves.toEqual({});
    expect(h.app.files.image).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("does not commit an already prepared import after the editor generation changes", async () => {
    await setup();
    const host = h.app.mindmap.host;
    const mapping = await host.prepareResources({});
    expect(host.isPreparedResourcesCurrent(mapping)).toBe(true);
    host.dispose();
    host.activate();
    expect(host.isPreparedResourcesCurrent(mapping)).toBe(false);
    const fresh = await host.prepareResources({});
    expect(host.isPreparedResourcesCurrent(fresh)).toBe(true);
  });
});
