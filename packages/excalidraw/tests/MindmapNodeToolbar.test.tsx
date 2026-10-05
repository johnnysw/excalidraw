import React from "react";
import {
  createMindmapTemplateObject,
  scaleMindmapForTransform,
} from "@excalidraw/mindmap";
import {
  createCoursewareMindmapElement,
  coursewareMindmapLocalToScene,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import { Excalidraw } from "../index";
import { API } from "./helpers/api";
import {
  act,
  fireEvent,
  render,
  screen,
  unmountComponent,
  waitFor,
} from "./test-utils";

const { h } = window;
const mount = async (scale = 1, y = 200) => {
  let model = createMindmapTemplateObject(0, 0);
  if (scale !== 1) {
    model = scaleMindmapForTransform(model, {
      x: model.x,
      y: model.y,
      width: model.width * scale,
      height: model.height * scale,
      rotation: model.rotation,
    });
  }
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 250,
    y,
  });
  await render(
    <Excalidraw
      role="teacher"
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree] }}
    />,
  );
  act(() => h.app.mindmap.select(tree.id, model.rootId));
  return { tree, model, controller: h.app.mindmap };
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

it("matches root control order and hides root-only controls on children", async () => {
  const { tree, model, controller } = await mount();
  const labels = () =>
    [
      ...screen
        .getByRole("toolbar", { name: "脑图节点工具" })
        .querySelectorAll("button"),
    ].map((b) => b.getAttribute("aria-label"));
  expect(labels()).toEqual([
    "脑图布局",
    "节点形状",
    "节点填充颜色",
    "节点描边",
    "节点文字颜色",
    "选择节点字号",
    "文字格式",
    "添加内容",
    "更多对象操作",
  ]);
  act(() => controller.select(tree.id, model.order[1]));
  expect(labels()).not.toContain("脑图布局");
  expect(labels()).not.toContain("节点填充颜色");
  expect(labels().some((label) => label?.includes("评论"))).toBe(false);
});

it.each([
  { y: 400, side: "top" },
  { y: 0, side: "bottom" },
])("opens panels away from a node at y=$y", async ({ y, side }) => {
  const viewportProperties = {
    clientWidth: Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientWidth",
    ),
    clientHeight: Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientHeight",
    ),
  };
  Object.defineProperties(document.documentElement, {
    clientWidth: { configurable: true, value: 1920 },
    clientHeight: { configurable: true, value: 1080 },
  });
  const originalRect = HTMLDivElement.prototype.getBoundingClientRect;
  const rectSpy = vi
    .spyOn(HTMLDivElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLDivElement) {
      if (this.classList.contains("Courseware-mindmap-toolbar")) {
        return new DOMRect(100, y > 0 ? y - 52 : 80, 420, 40);
      }
      if (this.classList.contains("Courseware-mindmap-popover")) {
        return new DOMRect(100, 100, 256, 172);
      }
      if (this.classList.contains("excalidraw")) {
        return new DOMRect(0, 0, 1920, 1080);
      }
      return originalRect.call(this);
    });
  try {
    const { controller } = await mount(1, y);
    const root = getCoursewareMindmapGeometry(controller.element!)!.nodes[
      controller.node!.id
    ];
    const world = coursewareMindmapLocalToScene(controller.element!, root);
    act(() => h.app.setState({ scrollY: y - world.y }));
    Object.defineProperties(document.querySelector(".excalidraw")!, {
      clientWidth: { configurable: true, value: 1920 },
      clientHeight: { configurable: true, value: 1080 },
    });
    const trigger = screen.getByRole("button", { name: "节点文字颜色" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(
      new DOMRect(300, y > 0 ? y - 52 : 80, 32, 32),
    );
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "节点文字颜色" });
    await waitFor(() => expect(panel).toHaveAttribute("data-side", side));
    fireEvent.click(screen.getByRole("option", { name: "文字颜色 #f76965" }));
    expect(controller.node!.color).toBe("#f76965");
    expect(API.getUndoStack()).toHaveLength(1);
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "节点形状" }));
    expect(screen.queryByRole("dialog", { name: "节点文字颜色" })).toBeNull();
    expect(screen.getByRole("radio", { name: "椭圆" })).toBeInTheDocument();
    expect(API.getUndoStack()).toHaveLength(1);
  } finally {
    unmountComponent();
    rectSpy.mockRestore();
    for (const [property, descriptor] of Object.entries(viewportProperties)) {
      if (descriptor) {
        Object.defineProperty(document.documentElement, property, descriptor);
      } else {
        Reflect.deleteProperty(document.documentElement, property);
      }
    }
  }
});

it("clamps font input, cancels Escape, and preserves the last committed value", async () => {
  const { controller } = await mount();
  const initial = controller.node!.fontSize;
  const input = () => screen.getByRole("textbox", { name: "节点字号" });
  fireEvent.focus(input());
  fireEvent.change(input(), { target: { value: "99" } });
  fireEvent.keyDown(input(), { key: "Escape" });
  expect(controller.node!.fontSize).toBe(initial);
  expect(API.getUndoStack()).toHaveLength(0);
  fireEvent.change(input(), { target: { value: "500" } });
  fireEvent.keyDown(input(), { key: "Enter" });
  expect(controller.node!.fontSize).toBe(256);
  expect(API.getUndoStack()).toHaveLength(1);
  fireEvent.change(input(), { target: { value: "1" } });
  fireEvent.blur(input());
  expect(controller.node!.fontSize).toBe(8);
  fireEvent.change(input(), { target: { value: "invalid" } });
  fireEvent.blur(input());
  expect(controller.node!.fontSize).toBe(8);
  expect(API.getUndoStack()).toHaveLength(2);
});

it("commits a font draft before a canvas pointerdown removes its input", async () => {
  const { tree, model, controller } = await mount();
  const input = screen.getByRole("textbox", { name: "节点字号" });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "24" } });
  const pointer = {
    clientX: 900,
    clientY: 700,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
  };
  fireEvent.pointerDown(document.querySelector("canvas.interactive")!, pointer);
  expect(controller.getSnapshot().selection).toBeNull();
  expect(
    getCoursewareMindmap(h.elements.find((element) => element.id === tree.id)!)!
      .nodes[model.rootId].fontSize,
  ).toBe(24);
  expect(API.getUndoStack()).toHaveLength(1);
  fireEvent.pointerUp(window, pointer);
});

it("commits the old node's font draft before selecting another node on pointerdown", async () => {
  const { tree, model, controller } = await mount();
  const childId = model.order[1];
  const child = getCoursewareMindmapGeometry(tree)!.nodes[childId];
  const world = coursewareMindmapLocalToScene(tree, {
    x: child.x + child.width / 2,
    y: child.y + child.height / 2,
  });
  const point = sceneCoordsToViewportCoords(
    { sceneX: world.x, sceneY: world.y },
    h.state,
  );
  const input = screen.getByRole("textbox", { name: "节点字号" });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "24" } });
  const pointer = {
    clientX: point.x,
    clientY: point.y,
    button: 0,
    pointerId: 2,
    pointerType: "mouse",
  };
  fireEvent.pointerDown(document.querySelector("canvas.interactive")!, pointer);
  expect(controller.getSnapshot().selection?.nodeId).toBe(childId);
  const saved = getCoursewareMindmap(
    h.elements.find((element) => element.id === tree.id)!,
  )!;
  expect(saved.nodes[model.rootId].fontSize).toBe(24);
  expect(saved.nodes[childId].fontSize).toBe(model.nodes[childId].fontSize);
  expect(API.getUndoStack()).toHaveLength(1);
  fireEvent.pointerUp(window, pointer);
  expect(API.getUndoStack()).toHaveLength(1);
});

it("does not commit an escaped font draft when the next pointerdown clears selection", async () => {
  const { tree, model, controller } = await mount();
  const initialFontSize = controller.node!.fontSize;
  const input = screen.getByRole("textbox", { name: "节点字号" });
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "99" } });
  fireEvent.keyDown(input, { key: "Escape" });
  const pointer = {
    clientX: 900,
    clientY: 700,
    button: 0,
    pointerId: 3,
    pointerType: "mouse",
  };
  fireEvent.pointerDown(document.querySelector("canvas.interactive")!, pointer);
  expect(controller.getSnapshot().selection).toBeNull();
  expect(
    getCoursewareMindmap(h.elements.find((element) => element.id === tree.id)!)!
      .nodes[model.rootId].fontSize,
  ).toBe(initialFontSize);
  expect(API.getUndoStack()).toHaveLength(0);
  fireEvent.pointerUp(window, pointer);
});

it("keeps popup triggers mounted, switches panels, and applies a scaled font preset once", async () => {
  const { controller } = await mount(2);
  fireEvent.click(screen.getByRole("button", { name: "节点形状" }));
  expect(screen.getByRole("radio", { name: "椭圆" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "选择节点字号" }));
  expect(screen.queryByRole("radio", { name: "椭圆" })).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "选择节点字号" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("option").map((e) => e.textContent)).toEqual([
    "12",
    "14",
    "18",
    "24",
    "36",
    "48",
    "72",
    "96",
  ]);
  fireEvent.click(screen.getByRole("option", { name: "字号 24" }));
  expect(controller.node!.fontSize).toBe(48);
  expect(screen.getByRole("textbox", { name: "节点字号" })).toHaveValue("24");
  expect(
    screen.queryByRole("listbox", { name: "节点字号" }),
  ).not.toBeInTheDocument();
  expect(API.getUndoStack()).toHaveLength(1);
});

it("hides toolbar when editing, locked or readonly and renders text formats while editing", async () => {
  const { controller } = await mount();
  act(() => {
    controller.patch({ fontStyle: "italic", textDecoration: "underline" });
    controller.startEditing();
  });
  expect(
    screen.queryByRole("toolbar", { name: "脑图节点工具" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "编辑脑图主题" })).toHaveStyle({
    fontStyle: "italic",
    textDecoration: "underline",
  });
  act(() => {
    controller.notify({ editing: null });
    h.app.setState({ viewModeEnabled: true });
  });
  expect(
    screen.queryByRole("toolbar", { name: "脑图节点工具" }),
  ).not.toBeInTheDocument();
});
