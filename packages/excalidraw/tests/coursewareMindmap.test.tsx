import React from "react";

import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { newElementWith } from "@excalidraw/element";
import {
  coursewareMindmapLocalToScene,
  createCoursewareMindmapElement,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
  updateCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import { resolveMindmapNodeBinding } from "@excalidraw/element/coursewareMindmapBinding";
import { pointFrom } from "@excalidraw/math";
import {
  addMindmapNode,
  createMindmapTemplateObject,
} from "@excalidraw/mindmap";

import type {
  ExcalidrawArrowElement,
  ExcalidrawElement,
  ExcalidrawRectangleElement,
  FixedPointBinding,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { COURSEWARE_MINDMAP_TOOL } from "../coursewareMindmap/config";

import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import {
  act,
  configure,
  fireEvent,
  render,
  screen,
  unmountComponent,
} from "./test-utils";

const { h } = window;
const mouse = new Pointer("mouse");

const liveTree = (id: string) =>
  h.elements.find((element) => element.id === id) as ExcalidrawRectangleElement;
const liveArrow = (id: string) =>
  h.elements.find((element) => element.id === id) as ExcalidrawArrowElement;
const arrowGeometry = (arrow: ExcalidrawArrowElement) => ({
  x: arrow.x,
  y: arrow.y,
  points: arrow.points.map(([x, y]) => [x, y]),
  startBinding: arrow.startBinding,
  endBinding: arrow.endBinding,
  isDeleted: arrow.isDeleted,
});

const fixture = () => {
  let model = createMindmapTemplateObject(0, 0);
  const branch = model.order[1];
  const sibling = model.order[2];
  model = addMindmapNode(model, branch, "child", "有外部箭头的子主题");
  const child = model.order[model.order.length - 1];
  model = addMindmapNode(model, child, "child", "要一起删除的孙主题");
  const grandchild = model.order[model.order.length - 1];
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 100,
    y: 120,
  });
  const arrowTo = (nodeId: string) => {
    const binding: FixedPointBinding = {
      elementId: tree.id,
      fixedPoint: [0.5, 0.5],
      mode: "inside",
      mindmapNodeId: nodeId,
      mindmapNodePoint: [1, 0.5],
    };
    const anchor = resolveMindmapNodeBinding(tree, binding)!;
    return API.createElement({
      type: "arrow",
      x: anchor[0],
      y: anchor[1],
      width: 140,
      height: 70,
      points: [pointFrom(0, 0), pointFrom(140, 70)],
      startBinding: binding,
    }) as ExcalidrawArrowElement;
  };
  const childArrow = arrowTo(child);
  const siblingArrow = arrowTo(sibling);
  const boundTree = newElementWith(tree, {
    boundElements: [childArrow, siblingArrow].map(({ id }) => ({
      id,
      type: "arrow" as const,
    })),
  });
  return {
    tree: boundTree,
    model,
    branch,
    child,
    grandchild,
    sibling,
    childArrow,
    siblingArrow,
  };
};

const mount = async (
  elements: readonly ExcalidrawElement[],
  role: "teacher" | "member" = "teacher"
) => {
  await render(
    <Excalidraw
      role={role}
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements }}
    />
  );
  expect(h.app.mindmap.enabled).toBe(role === "teacher");
  expect(API.getUndoStack()).toHaveLength(0);
};

beforeEach(() => {
  unmountComponent();
  configure({ asyncUtilTimeout: 5000 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  unmountComponent();
  configure({ asyncUtilTimeout: 1000 });
  vi.unstubAllGlobals();
});

describe("courseware mindmap App integration", () => {
  it("adds a child through the node UI and undoes the semantic edit once", async () => {
    const { tree, model, branch } = fixture();
    await mount([tree]);
    act(() => h.app.mindmap.select(tree.id, branch));
    fireEvent.click(screen.getByRole("button", { name: "新增子主题" }));
    const added = h.app.mindmap.getSnapshot().selection!.nodeId;
    const current = getCoursewareMindmap(liveTree(tree.id))!;
    expect(current.order).toHaveLength(model.order.length);
    expect(current.nodes[added]).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(0);
    const editor = screen.getByRole("textbox", { name: "编辑脑图主题" });
    expect(editor).toHaveValue("分支主题");
    fireEvent.change(editor, { target: { value: "新增的主题" } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(getCoursewareMindmap(liveTree(tree.id))!.nodes[added]).toMatchObject({ parentId: branch, label: "新增的主题" });
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[added]
    ).toBeUndefined();
    expect(getCoursewareMindmap(liveTree(tree.id))!.order).toEqual(model.order);
    expect(
      h.elements.filter(
        (element) => element.type === "text" && !element.isDeleted
      )
    ).toHaveLength(0);
  });

  it("deletes a subtree and its external arrow, then restores tree and both arrow bindings in one undo", async () => {
    const { tree, model, child, grandchild, childArrow, siblingArrow } =
      fixture();
    await mount([tree, childArrow, siblingArrow]);
    const beforeChild = arrowGeometry(liveArrow(childArrow.id));
    const beforeSibling = arrowGeometry(liveArrow(siblingArrow.id));
    act(() => h.app.mindmap.select(tree.id, child));
    Keyboard.keyPress("Delete");
    const removedModel = getCoursewareMindmap(liveTree(tree.id))!;
    expect(removedModel.nodes[child]).toBeUndefined();
    expect(removedModel.nodes[grandchild]).toBeUndefined();
    expect(liveArrow(childArrow.id).isDeleted).toBe(true);
    expect(liveArrow(siblingArrow.id).isDeleted).toBe(false);
    expect(liveArrow(siblingArrow.id).startBinding?.mindmapNodeId).toBe(
      siblingArrow.startBinding!.mindmapNodeId
    );
    Keyboard.undo();
    expect(getCoursewareMindmap(liveTree(tree.id))!.nodes).toEqual(model.nodes);
    expect(getCoursewareMindmap(liveTree(tree.id))!.order).toEqual(model.order);
    expect(arrowGeometry(liveArrow(childArrow.id))).toEqual(beforeChild);
    expect(arrowGeometry(liveArrow(siblingArrow.id))).toEqual(beforeSibling);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("captures a layout change and its external arrow geometry in the same undo entry", async () => {
    const { tree, model, childArrow, siblingArrow } = fixture();
    await mount([tree, childArrow, siblingArrow]);
    const beforeChild = arrowGeometry(liveArrow(childArrow.id));
    const beforeSibling = arrowGeometry(liveArrow(siblingArrow.id));
    act(() => {
      h.app.mindmap.select(tree.id, model.rootId);
      h.app.mindmap.setLayout({
        family: "timeline",
        direction: "vertical",
        branchStyle: "right-angle",
      });
    });
    expect(getCoursewareMindmap(liveTree(tree.id))!.layoutFamily).toBe(
      "timeline"
    );
    expect(arrowGeometry(liveArrow(childArrow.id))).not.toEqual(beforeChild);
    expect(arrowGeometry(liveArrow(siblingArrow.id))).not.toEqual(
      beforeSibling
    );
    Keyboard.undo();
    expect(getCoursewareMindmap(liveTree(tree.id))!.nodes).toEqual(model.nodes);
    expect(arrowGeometry(liveArrow(childArrow.id))).toEqual(beforeChild);
    expect(arrowGeometry(liveArrow(siblingArrow.id))).toEqual(beforeSibling);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("cancels a layout preview without changing the scene or adding history", async () => {
    const { tree, model, childArrow } = fixture();
    await mount([tree, childArrow]);
    const before = JSON.stringify(h.elements);
    act(() => {
      h.app.mindmap.select(tree.id, model.rootId);
      h.app.mindmap.setLayout(
        { family: "tree", direction: "left", branchStyle: "round-angle" },
        true
      );
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(
      getCoursewareMindmap(h.app.mindmap.getSnapshot().preview!)!.layoutFamily
    ).toBe("tree");
    Keyboard.keyPress("Escape");
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(JSON.stringify(h.elements)).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("double-clicks a semantic node into its editor without creating native text", async () => {
    const { tree, branch } = fixture();
    await mount([tree]);
    const current = liveTree(tree.id);
    const node = getCoursewareMindmapGeometry(current)!.nodes[branch];
    const scenePoint = coursewareMindmapLocalToScene(current, {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    });
    const point = sceneCoordsToViewportCoords(
      { sceneX: scenePoint.x, sceneY: scenePoint.y },
      h.state
    );
    mouse.doubleClickAt(point.x, point.y);
    expect(h.app.mindmap.getSnapshot()).toMatchObject({
      selection: { elementId: tree.id, nodeId: branch },
      editing: "label",
    });
    expect(screen.getByRole("textbox", { name: "编辑脑图主题" })).toHaveValue(
      getCoursewareMindmap(current)!.nodes[branch].label
    );
    expect(
      h.elements.filter((element) => element.type === "text")
    ).toHaveLength(0);
    expect(h.state.editingTextElement).toBeNull();
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("cancels placement after pointerdown without a scene element or history entry", async () => {
    await mount([]);
    act(() =>
      h.app.setActiveTool({
        type: "custom",
        customType: COURSEWARE_MINDMAP_TOOL,
      })
    );
    mouse.moveTo(240, 180);
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    mouse.downAt(240, 180);
    fireEvent.pointerCancel(window, {
      pointerId: 1,
      clientX: 240,
      clientY: 180,
      button: 0,
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(0);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("keeps IME Enter and Tab inside the editor without adding or committing a node", async () => {
    const { tree, model, branch } = fixture();
    await mount([tree]);
    act(() => h.app.mindmap.select(tree.id, branch));
    fireEvent.keyDown(document, { key: "Tab", isComposing: true });
    fireEvent.keyDown(document, { key: "Enter", isComposing: true });
    expect(h.app.mindmap.getSnapshot().editing).toBeNull();
    expect(getCoursewareMindmap(liveTree(tree.id))!.order).toEqual(model.order);
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", { name: "编辑脑图主题" });
    fireEvent.compositionStart(editor);
    fireEvent.change(editor, { target: { value: "拼音组合中" } });
    fireEvent.keyDown(editor, { key: "Enter", isComposing: true });
    fireEvent.keyDown(editor, { key: "Tab", isComposing: true });
    expect(h.app.mindmap.getSnapshot().editing).toBe("label");
    expect(getCoursewareMindmap(liveTree(tree.id))!.nodes[branch].label).toBe(
      model.nodes[branch].label
    );
    expect(getCoursewareMindmap(liveTree(tree.id))!.order).toEqual(model.order);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.compositionEnd(editor);
    fireEvent.keyDown(editor, { key: "Escape" });
  });

  it("remembers the creation layout preference when reopening its menu", async () => {
    await mount([]);
    fireEvent.click(screen.getByTestId("toolbar-mindmap"));
    fireEvent.click(screen.getByRole("button", { name: "时间线·纵向" }));
    expect(h.state.coursewareMindmap).toMatchObject({
      family: "timeline",
      direction: "vertical",
    });
    act(() => h.app.setActiveTool({ type: "selection" }));
    fireEvent.click(screen.getByTestId("toolbar-mindmap"));
    expect(screen.getByRole("button", { name: "时间线·纵向" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(h.elements).toHaveLength(0);
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it.each(["locked", "view", "presentation", "member"] as const)(
    "blocks semantic edits in %s mode",
    async (mode) => {
      const { tree, model, branch } = fixture();
      const frame =
        mode === "presentation"
          ? API.createElement({
              type: "frame",
              x: 0,
              y: 0,
              width: 1000,
              height: 800,
            })
          : null;
      await mount(
        [
          ...(frame ? [frame] : []),
          mode === "locked" ? newElementWith(tree, { locked: true }) : tree,
        ],
        mode === "member" ? "member" : "teacher"
      );
      if (mode === "view") API.setAppState({ viewModeEnabled: true });
      if (mode === "presentation") {
        API.setAppState({ presentationMode: true });
        expect(h.state.presentationMode).toBe(true);
      }
      const before = JSON.stringify(liveTree(tree.id));
      act(() => {
        h.app.mindmap.select(tree.id, branch);
        h.app.mindmap.add("child");
        h.app.mindmap.patch({ label: "不应保存" });
        h.app.mindmap.remove();
        h.app.mindmap.toggleCollapse();
        h.app.mindmap.setLayout({
          family: "tree",
          direction: "left",
          branchStyle: "right-angle",
        });
        h.app.mindmap.startEditing();
      });
      expect(JSON.stringify(liveTree(tree.id))).toBe(before);
      expect(getCoursewareMindmap(liveTree(tree.id))!.nodes).toEqual(
        model.nodes
      );
      expect(h.app.mindmap.getSnapshot().editing).toBeNull();
      expect(API.getUndoStack()).toHaveLength(0);
    }
  );

  it("assigns a placed semantic tree to the frame under its root", async () => {
    const frame = API.createElement({
      type: "frame",
      x: 40,
      y: 40,
      width: 800,
      height: 600,
    });
    await mount([frame]);
    act(() =>
      h.app.setActiveTool({
        type: "custom",
        customType: COURSEWARE_MINDMAP_TOOL,
      })
    );
    mouse.downAt(240, 180);
    mouse.upAt(240, 180);
    const tree = h.elements.find((element) => getCoursewareMindmap(element));
    expect(tree).toBeTruthy();
    expect(tree!.frameId).toBe(frame.id);
    expect(API.getUndoStack()).toHaveLength(1);
  });

  it("previews image resize without saving and commits it once on pointerup", async () => {
    const { tree, model, child } = fixture();
    const imageModel = {
      ...model,
      nodes: {
        ...model.nodes,
        [child]: {
          ...model.nodes[child],
          imageAssetId: "embedded-image",
          imageWidth: 120,
          imageHeight: 80,
        },
      },
    };
    const imageTree = updateCoursewareMindmapElement(tree, imageModel);
    await mount([imageTree]);
    act(() => h.app.mindmap.select(tree.id, child));
    fireEvent.click(screen.getByRole("button", { name: "移动节点图片" }));
    const original = getCoursewareMindmap(liveTree(tree.id))!.nodes[child];
    const before = JSON.stringify(liveTree(tree.id));
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "缩放节点图片 se" }),
      { pointerId: 7, clientX: 700, clientY: 300, button: 0 }
    );
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 740,
      clientY: 330,
      button: 0,
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(JSON.stringify(liveTree(tree.id))).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.pointerUp(window, {
      pointerId: 7,
      clientX: 740,
      clientY: 330,
      button: 0,
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[child].imageWidth
    ).toBeGreaterThan(original.imageWidth!);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[child].imageWidth
    ).toBe(original.imageWidth);
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[child].imageHeight
    ).toBe(original.imageHeight);
  });

  it("opens the phone picker outside More Tools, places once and remembers its layout", async () => {
    await render(
      <Excalidraw
        role="teacher"
        handleKeyboardGlobally
        UIOptions={{ toolbarLayout: "left", formFactor: "phone" }}
      />
    );
    act(() => {
      h.app.refreshEditorInterface();
      h.app.refresh();
    });
    expect(h.app.editorInterface.formFactor).toBe("phone");
    const more = document.querySelector<HTMLButtonElement>(
      ".App-toolbar__extra-tools-trigger--mobile"
    )!;
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("toolbar-mindmap"));
    expect(screen.queryByTestId("toolbar-mindmap")).toBeNull();
    expect(screen.getByRole("button", { name: "思维导图·右" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "树状图·左" }));
    expect(screen.queryByRole("button", { name: "思维导图·右" })).toBeNull();
    expect(h.state.activeTool.customType).toBe(COURSEWARE_MINDMAP_TOOL);
    mouse.downAt(240, 180);
    mouse.upAt(240, 180);
    const trees = h.elements.filter((element) => getCoursewareMindmap(element));
    expect(trees).toHaveLength(1);
    expect(API.getUndoStack()).toHaveLength(1);
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId("toolbar-mindmap"));
    expect(screen.getByRole("button", { name: "树状图·左" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    Keyboard.keyPress("Escape");
    expect(screen.queryByRole("button", { name: "树状图·左" })).toBeNull();
    expect(
      h.elements.filter((element) => getCoursewareMindmap(element))
    ).toHaveLength(1);
  });

  it.each(["member", "disabled-rectangle", "top-toolbar"])(
    "does not expose the phone creation entry for %s",
    async (scope) => {
      await render(
        <Excalidraw
          role={scope === "member" ? "member" : "teacher"}
          UIOptions={{
            toolbarLayout: scope === "top-toolbar" ? "top" : "left",
            formFactor: "phone",
            tools: { rectangle: scope !== "disabled-rectangle" },
          }}
        />
      );
      act(() => {
        h.app.refreshEditorInterface();
        h.app.refresh();
      });
      fireEvent.click(
        document.querySelector<HTMLButtonElement>(
          ".App-toolbar__extra-tools-trigger--mobile"
        )!
      );
      expect(screen.queryByTestId("toolbar-mindmap")).toBeNull();
    }
  );

  it("reveals a hidden search result in readonly mode without saving expansion", async () => {
    const { tree, model, branch, child } = fixture();
    const collapsed = {
      ...model,
      nodes: {
        ...model.nodes,
        [branch]: { ...model.nodes[branch], collapsed: true },
      },
    };
    const collapsedTree = updateCoursewareMindmapElement(tree, collapsed);
    await mount([collapsedTree]);
    API.setAppState({ viewModeEnabled: true });
    const scroll = vi
      .spyOn(h.app, "scrollToContent")
      .mockImplementation(() => {});
    act(() => {
      h.app.mindmap.select(tree.id, model.rootId);
      h.app.mindmap.notify({ searchOpen: true });
    });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索主题、描述和标签" }),
      { target: { value: "有外部箭头" } }
    );
    fireEvent.click(screen.getByRole("button", { name: "有外部箭头的子主题" }));
    const preview = h.app.mindmap.getSnapshot().preview!;
    expect(getCoursewareMindmap(preview)!.nodes[branch].collapsed).toBe(false);
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[branch].collapsed
    ).toBe(true);
    const box = getCoursewareMindmapGeometry(preview)!.nodes[child];
    const center = coursewareMindmapLocalToScene(preview, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({
        x: center.x,
        y: center.y,
        width: 0,
        height: 0,
      }),
      expect.objectContaining({ fitToViewport: false })
    );
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "关闭脑图搜索" }));
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    scroll.mockRestore();
  });

  it("copies a folded image branch with new node IDs and undoes paste atomically", async () => {
    const { tree, model, branch, child } = fixture();
    const imageModel = {
      ...model,
      nodes: {
        ...model.nodes,
        [branch]: { ...model.nodes[branch], collapsed: true },
        [child]: { ...model.nodes[child], imageAssetId: "branch-image" },
      },
    };
    await mount([updateCoursewareMindmapElement(tree, imageModel)]);
    act(() => {
      h.app.addFiles([
        {
          id: "branch-image",
          dataURL: "data:image/png;base64,AA==",
          mimeType: "image/png",
          created: 1,
        } as any,
      ]);
      h.app.mindmap.select(tree.id, branch);
    });
    const data = new Map<string, string>();
    const event = {
      preventDefault: vi.fn(),
      clipboardData: {
        setData: (key: string, value: string) => data.set(key, value),
        getData: (key: string) => data.get(key) ?? "",
        files: [],
      },
    } as unknown as ClipboardEvent;
    act(() => {
      expect(h.app.mindmap.clipboard.copy(event)).toBe(true);
    });
    const copied = JSON.parse(data.get("text/plain")!);
    expect(copied.resources["branch-image"]).toBeTruthy();
    await act(async () => {
      expect(await h.app.mindmap.clipboard.paste(event)).toBe(true);
    });
    const result = getCoursewareMindmap(liveTree(tree.id))!;
    const addedIds = result.order.filter((id) => !imageModel.nodes[id]);
    expect(addedIds.length).toBe(3);
    expect(
      addedIds.some((id) => result.nodes[id].imageAssetId === "branch-image")
    ).toBe(true);
    expect(addedIds.every((id) => !imageModel.nodes[id])).toBe(true);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(getCoursewareMindmap(liveTree(tree.id))!.order).toEqual(
      imageModel.order
    );
    expect(h.app.files["branch-image"]).toBeTruthy();
  });

  it("previews a manual node drag with shared untouched nodes, commits once and restores on undo", async () => {
    const { tree, branch } = fixture();
    await mount([tree]);
    const original = getCoursewareMindmap(liveTree(tree.id))!;
    const box = getCoursewareMindmapGeometry(liveTree(tree.id))!.nodes[branch];
    const world = coursewareMindmapLocalToScene(liveTree(tree.id), {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    const point = sceneCoordsToViewportCoords(
      { sceneX: world.x, sceneY: world.y },
      h.state
    );
    const pointer = {
      pointerId: 42,
      pointerType: "mouse",
      button: 0,
      shiftKey: false,
      altKey: true,
    };
    fireEvent.pointerDown(document.querySelector("canvas.interactive")!, {
      ...pointer,
      clientX: point.x,
      clientY: point.y,
    });
    fireEvent.pointerMove(window, {
      ...pointer,
      clientX: point.x + 500,
      clientY: point.y + 320,
    });
    const draft = h.app.mindmap.getSnapshot().preview!;
    expect(draft).toBeTruthy();
    expect(getCoursewareMindmap(draft)!.nodes[original.rootId]).toBe(
      original.nodes[original.rootId]
    );
    expect(getCoursewareMindmap(liveTree(tree.id))).toBe(original);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.pointerUp(window, {
      ...pointer,
      clientX: point.x + 500,
      clientY: point.y + 320,
    });
    expect(
      getCoursewareMindmap(liveTree(tree.id))!.nodes[branch].positionLocked
    ).toBe(true);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(getCoursewareMindmap(liveTree(tree.id))!.nodes).toEqual(
      original.nodes
    );
  });
});
