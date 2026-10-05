import React from "react";
import { sceneCoordsToViewportCoords, SVG_NS } from "@excalidraw/common";
import {
  coursewareMindmapLocalToScene,
  createCoursewareMindmapElement,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";
import { drawCoursewareMindmap } from "@excalidraw/element/coursewareMindmapCanvas";
import { createCoursewareMindmapSvgNode } from "@excalidraw/element/coursewareMindmapSvg";
import { createMindmapTemplateObject } from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import * as filesystem from "../data/filesystem";
import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import {
  act,
  configure,
  fireEvent,
  render,
  screen,
  unmountComponent,
  within,
  waitFor,
} from "./test-utils";

const { h } = window;
const mountNode = async (child = false, layoutScale = 1) => {
  const model = { ...createMindmapTemplateObject(0, 0), layoutScale };
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 100,
    y: 120,
  });
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree] }}
    />,
  );
  const nodeId = child ? model.order[1] : model.rootId;
  act(() => h.app.mindmap.select(tree.id, nodeId));
  return { tree, model, nodeId };
};
const open = (name: string) =>
  fireEvent.click(
    within(screen.getByRole("toolbar", { name: "脑图节点工具" })).getByRole(
      "button",
      { name },
    ),
  );
const clickNode = (elementId: string, nodeId: string, shiftKey = false) => {
  const element = h.elements.find(
    (item) => item.id === elementId,
  ) as ExcalidrawRectangleElement;
  const bounds = getCoursewareMindmapGeometry(element)!.nodes[nodeId];
  const scene = coursewareMindmapLocalToScene(element, {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  });
  const point = sceneCoordsToViewportCoords(
    { sceneX: scene.x, sceneY: scene.y },
    h.state,
  );
  const pointer = {
    clientX: point.x,
    clientY: point.y,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    shiftKey,
  };
  fireEvent.pointerDown(document.querySelector("canvas.interactive")!, pointer);
  fireEvent.pointerUp(window, pointer);
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
    },
  );
  const CanvasMockPath = Path2D;
  vi.stubGlobal(
    "Path2D",
    class extends CanvasMockPath {
      roundRect(...args: Parameters<Path2D["roundRect"]>) {
        this.rect(args[0], args[1], args[2], args[3]);
      }
    },
  );
});
afterEach(() => {
  unmountComponent();
  configure({ asyncUtilTimeout: 1000 });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mindmap node style panels", () => {
  it.each(["root", "child"] as const)(
    "keeps the toolbar and color target selected after Shift deselects the %s",
    async (removed) => {
      const { tree, model } = await mountNode();
      const childId = model.order[1];
      const removedId = removed === "root" ? model.rootId : childId;
      const selectedId = removed === "root" ? childId : model.rootId;
      act(() => h.app.mindmap.clear());
      clickNode(tree.id, model.rootId);
      clickNode(tree.id, childId, true);
      expect(h.app.mindmap.getSnapshot().selectedNodeIds).toEqual([
        model.rootId,
        childId,
      ]);
      clickNode(tree.id, removedId, true);
      expect(h.app.mindmap.getSnapshot().selectedNodeIds).toEqual([selectedId]);
      expect(h.app.mindmap.node?.id).toBe(selectedId);
      if (removed === "root") {
        expect(
          screen.queryByRole("button", { name: "节点填充颜色" }),
        ).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByRole("button", { name: "节点填充颜色" }),
        ).toBeInTheDocument();
      }

      open("节点文字颜色");
      fireEvent.click(
        screen.getByRole("option", { name: "文字颜色 #646a73" }),
      );
      const updated = h.app.mindmap.model!;
      expect(updated.nodes[selectedId].color).toBe("#646a73");
      expect(updated.nodes[removedId].color).toBe(model.nodes[removedId].color);
      expect(API.getUndoStack()).toHaveLength(1);
      Keyboard.undo();
      expect(h.app.mindmap.model!.nodes[selectedId].color).toBe(
        model.nodes[selectedId].color,
      );
      expect(API.getUndoStack()).toHaveLength(0);
    },
  );

  it("applies one color change to every Shift-selected node and undoes it once", async () => {
    const { tree, model } = await mountNode();
    const childId = model.order[1];
    act(() => h.app.mindmap.clear());
    clickNode(tree.id, model.rootId);
    clickNode(tree.id, childId, true);
    expect(h.app.mindmap.node?.id).toBe(childId);
    open("节点文字颜色");
    fireEvent.click(
      screen.getByRole("option", { name: "文字颜色 #646a73" }),
    );
    expect(h.app.mindmap.model!.nodes[model.rootId].color).toBe("#646a73");
    expect(h.app.mindmap.model!.nodes[childId].color).toBe("#646a73");
    expect(h.app.mindmap.getSnapshot().selectedNodeIds).toEqual([
      model.rootId,
      childId,
    ]);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(h.app.mindmap.model!.nodes[model.rootId].color).toBe(
      model.nodes[model.rootId].color,
    );
    expect(h.app.mindmap.model!.nodes[childId].color).toBe(
      model.nodes[childId].color,
    );
    expect(API.getUndoStack()).toHaveLength(0);
  });

  it("previews an opacity gesture, commits once, and cancels an unfinished gesture", async () => {
    await mountNode();
    open("节点填充颜色");
    const slider = screen.getByRole("slider", { name: "节点不透明度" });
    fireEvent.change(slider, { target: { value: "65" } });
    fireEvent.change(slider, { target: { value: "35" } });
    expect(h.app.mindmap.node?.opacity ?? 1).toBe(1);
    expect(
      getCoursewareMindmap(h.app.mindmap.getSnapshot().preview!)!.nodes[
        h.app.mindmap.node!.id
      ].opacity,
    ).toBe(0.35);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.pointerUp(slider);
    expect(h.app.mindmap.node?.opacity).toBe(0.35);
    expect(API.getUndoStack()).toHaveLength(1);
    fireEvent.change(slider, { target: { value: "90" } });
    fireEvent.keyDown(slider, { key: "Escape" });
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(h.app.mindmap.node?.opacity).toBe(0.35);
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(h.app.mindmap.node?.opacity ?? 1).toBe(1);
  });

  it("keeps fill choices open and commits custom color only on completion", async () => {
    await mountNode();
    open("节点填充颜色");
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "节点填充" })).getByRole(
        "option",
        { name: "#f76965" },
      ),
    );
    expect(h.app.mindmap.node?.fill).toBe("#f76965");
    expect(
      screen.getByRole("listbox", { name: "节点填充" }),
    ).toBeInTheDocument();
    const custom = screen.getByLabelText("节点填充自定义颜色");
    fireEvent.change(custom, { target: { value: "#123456" } });
    expect(h.app.mindmap.node?.fill).toBe("#f76965");
    fireEvent.blur(custom);
    expect(h.app.mindmap.node?.fill).toBe("#123456");
    expect(API.getUndoStack()).toHaveLength(2);
  });

  it("commits custom color on menu switch and cancels it on Escape without a blur", async () => {
    await mountNode();
    open("节点填充颜色");
    fireEvent.change(screen.getByLabelText("节点填充自定义颜色"), {
      target: { value: "#123456" },
    });
    open("节点描边");
    expect(h.app.mindmap.node?.fill).toBe("#123456");
    expect(API.getUndoStack()).toHaveLength(1);
    open("节点填充颜色");
    fireEvent.change(screen.getByLabelText("节点填充自定义颜色"), {
      target: { value: "#abcdef" },
    });
    fireEvent.keyDown(screen.getByLabelText("节点填充自定义颜色"), {
      key: "Escape",
    });
    open("节点描边");
    expect(h.app.mindmap.node?.fill).toBe("#123456");
    expect(API.getUndoStack()).toHaveLength(1);
  });

  it("commits custom color before a canvas click clears the node selection", async () => {
    const { tree, nodeId } = await mountNode();
    open("节点填充颜色");
    fireEvent.change(screen.getByLabelText("节点填充自定义颜色"), {
      target: { value: "#112233" },
    });
    fireEvent.pointerDown(document.querySelector("canvas.interactive")!, {
      clientX: 900,
      clientY: 700,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(document.querySelector("canvas.interactive")!, {
      clientX: 900,
      clientY: 700,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(h.app.mindmap.getSnapshot().selection).toBeNull();
    expect(
      getCoursewareMindmap(
        h.elements.find((element) => element.id === tree.id)!,
      )!.nodes[nodeId].fill,
    ).toBe("#112233");
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(
      getCoursewareMindmap(
        h.elements.find((element) => element.id === tree.id)!,
      )!.nodes[nodeId].fill,
    ).not.toBe("#112233");
  });

  it("uses whiteboard stroke presets in logical units on a scaled map", async () => {
    await mountNode(false, 2);
    open("节点描边");
    const widths = screen.getByRole("radiogroup", { name: "节点描边粗细" });
    expect(
      within(widths)
        .getAllByRole("radio")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["1 像素", "2 像素", "4 像素", "8 像素"]);
    fireEvent.click(within(widths).getByRole("radio", { name: "8 像素" }));
    expect(h.app.mindmap.node?.strokeWidth).toBe(16);
    fireEvent.click(screen.getByRole("radio", { name: "点状虚线" }));
    expect(h.app.mindmap.node?.lineStyle).toBe("dot");
    expect(
      within(
        screen.getByRole("listbox", { name: "节点描边颜色" }),
      ).getAllByRole("option"),
    ).toHaveLength(12);
  });

  it("offers both text and background colors for a child without a fill trigger", async () => {
    await mountNode(true);
    expect(
      screen.queryByRole("button", { name: "节点填充颜色" }),
    ).not.toBeInTheDocument();
    open("节点文字颜色");
    expect(
      within(screen.getByRole("listbox", { name: "文字颜色" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(9);
    expect(
      within(screen.getByRole("listbox", { name: "背景颜色" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(18);
    fireEvent.click(screen.getByRole("option", { name: "背景颜色 #f5d90a" }));
    fireEvent.click(screen.getByRole("option", { name: "文字颜色 #646a73" }));
    expect(h.app.mindmap.node).toMatchObject({
      fill: "#f5d90a",
      color: "#646a73",
    });
  });

  it("paints a text child's chosen background in Canvas and SVG, with one undoable change", async () => {
    const { tree, model, nodeId } = await mountNode(true);
    const initialColor = h.app.mindmap.node?.color;
    act(() => h.app.mindmap.clear());
    clickNode(tree.id, nodeId);
    open("节点文字颜色");
    fireEvent.click(screen.getByRole("option", { name: "背景颜色 #62d256" }));
    expect(h.app.mindmap.node).toMatchObject({ fill: "#62d256" });
    expect(h.app.mindmap.node?.color).toBe(initialColor);
    expect(h.app.mindmap.node?.shape).toBe(model.nodes[nodeId].shape);
    expect(
      screen.getByRole("option", { name: "背景颜色 #62d256" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(API.getUndoStack()).toHaveLength(1);

    const selectedBackground = () => {
      const element = h.elements.find(
        (item) => item.id === tree.id,
      ) as ExcalidrawRectangleElement;
      const svg = createCoursewareMindmapSvgNode(
        element,
        document.createElementNS(SVG_NS, "svg"),
      );
      return svg.querySelector(`[data-mindmap-node="${nodeId}"] rect`);
    };
    expect(selectedBackground()?.getAttribute("fill")).toBe("#62d256");
    expect(selectedBackground()?.getAttribute("stroke") ?? "none").toBe("none");
    const ctx = document.createElement("canvas").getContext("2d")!;
    const fills: (typeof ctx.fillStyle)[] = [];
    vi.spyOn(ctx, "fill").mockImplementation(() => fills.push(ctx.fillStyle));
    drawCoursewareMindmap(
      h.elements.find((item) => item.id === tree.id) as ExcalidrawRectangleElement,
      ctx,
    );
    expect(fills).toContain("#62d256");

    Keyboard.undo();
    expect(
      getCoursewareMindmap(h.elements.find((item) => item.id === tree.id)!)!
        .nodes[nodeId].fill,
    ).toBe(model.nodes[nodeId].fill);
    expect(selectedBackground()).toBeNull();
    expect(API.getUndoStack()).toHaveLength(0);
    Keyboard.redo();
    expect(selectedBackground()?.getAttribute("fill")).toBe("#62d256");
    expect(API.getUndoStack()).toHaveLength(1);
  });

  it("matches format order and uses direct alignment buttons", async () => {
    await mountNode();
    open("文字格式");
    expect(
      within(screen.getByRole("group", { name: "节点文本样式" }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["粗体", "删除线", "斜体", "下划线"]);
    fireEvent.click(screen.getByRole("button", { name: "删除线" }));
    fireEvent.click(screen.getByRole("radio", { name: "左对齐" }));
    expect(h.app.mindmap.node).toMatchObject({
      textDecoration: "line-through",
      align: "left",
    });
  });

  it("has three content entries and resets decoration search after closing", async () => {
    await mountNode();
    open("添加内容");
    expect(
      within(screen.getByRole("menu", { name: "添加内容" }))
        .getAllByRole("menuitem")
        .map((button) => button.textContent),
    ).toEqual(["添加描述Shift + Enter", "添加图标或贴纸", "添加图片"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "添加图标或贴纸" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "搜索节点图标和贴纸" }),
      { target: { value: " 星 " } },
    );
    expect(screen.getByRole("radio", { name: "星标" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "旗帜" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "星标" }));
    expect(h.app.mindmap.node?.icon).toBe("lucide:star");
    open("添加内容");
    open("添加内容");
    expect(screen.getByRole("menu", { name: "添加内容" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "添加图标或贴纸" }));
    expect(
      screen.getByRole("searchbox", { name: "搜索节点图标和贴纸" }),
    ).toHaveValue("");
    expect(screen.getByRole("radio", { name: "旗帜" })).toBeInTheDocument();
  });
  it("closes content before editing a description", async () => {
    await mountNode();
    open("添加内容");
    fireEvent.click(screen.getByRole("menuitem", { name: /^添加描述/ }));
    expect(
      screen.queryByRole("menu", { name: "添加内容" }),
    ).not.toBeInTheDocument();
    expect(h.app.mindmap.getSnapshot().editing).toBe("summary");
  });

  it("closes content before the image picker and delivers its result to the same node", async () => {
    await mountNode();
    const image = new File(["image"], "node.png", { type: "image/png" });
    const picker = vi.spyOn(filesystem, "fileOpen").mockResolvedValue(image);
    const upload = vi
      .spyOn(h.app.mindmap.clipboard, "addImage")
      .mockResolvedValue(undefined);
    open("添加内容");
    fireEvent.click(screen.getByRole("menuitem", { name: "添加图片" }));
    expect(
      screen.queryByRole("menu", { name: "添加内容" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(upload).toHaveBeenCalledWith(image));
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it("reports image upload failures after the content menu closes", async () => {
    await mountNode();
    vi.spyOn(filesystem, "fileOpen").mockRejectedValue(
      new Error("picker failed"),
    );
    open("添加内容");
    fireEvent.click(screen.getByRole("menuitem", { name: "添加图片" }));
    await waitFor(() =>
      expect(h.state.errorMessage).toBe("图片无法读取，请重试"),
    );
  });
});
