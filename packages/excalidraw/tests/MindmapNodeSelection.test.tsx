import React from "react";

import {
  createMindmapTemplateObject,
  shapePathData,
} from "@excalidraw/mindmap";
import {
  coursewareMindmapLocalToScene,
  createCoursewareMindmapElement,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";

import type { MindmapNodeShape } from "@excalidraw/mindmap";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, render, screen, unmountComponent } from "./test-utils";

import type { Zoom } from "../types";

const { h } = window;
const mount = async (
  shape: MindmapNodeShape = "rounded-rectangle",
  transformed = false,
  layoutScale = 1,
  fill?: string,
) => {
  const model = { ...createMindmapTemplateObject(0, 0), layoutScale };
  model.nodes[model.rootId] = {
    ...model.nodes[model.rootId],
    shape,
    ...(fill ? { fill } : {}),
  };
  if (transformed) {
    model.rotation = 25;
    model.flipX = true;
    model.flipY = true;
  }
  const original = createCoursewareMindmapElement({
    mindmap: model,
    x: 250,
    y: 200,
  });
  const tree = transformed
    ? {
        ...original,
        width: original.width * 1.4,
        height: original.height * 1.2,
      }
    : original;
  await render(
    <Excalidraw
      role="teacher"
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree] }}
    />,
  );
  const before = JSON.stringify(h.elements);
  act(() => h.app.mindmap.select(tree.id, model.rootId));
  return { tree, model, before, controller: h.app.mindmap };
};
const selected = (id: string) =>
  document.querySelector<HTMLDivElement>(
    `.Courseware-mindmap-selection[data-node-id="${id}"]`,
  )!;
const outline = (id: string) =>
  selected(id).querySelector(".Courseware-mindmap-selection-outline")!
    .lastElementChild!;

beforeEach(() => {
  unmountComponent();
  const CanvasMockPath = Path2D;
  vi.stubGlobal(
    "Path2D",
    class extends CanvasMockPath {
      roundRect(...args: Parameters<Path2D["roundRect"]>) {
        this.rect(args[0], args[1], args[2], args[3]);
      }
    },
  );
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

it("outlines the rounded root outside its own stroke and keeps node controls", async () => {
  const { model, before } = await mount();
  const ring = outline(model.rootId);
  const cutout = selected(model.rootId).querySelector(
    "mask",
  )!.lastElementChild!;
  expect(ring.tagName).toBe("rect");
  expect(ring.getAttribute("rx")).toBe("12");
  expect(ring.getAttribute("fill")).toBe("none");
  expect(ring.getAttribute("stroke")).toBe("var(--color-primary)");
  expect(Number(ring.getAttribute("stroke-width"))).toBe(
    Number(cutout.getAttribute("stroke-width")) + 4,
  );
  expect(Number(cutout.getAttribute("stroke-width"))).toBeGreaterThan(6);
  expect(
    screen.getByRole("button", { name: "新增子主题" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "折叠分支" })).toBeInTheDocument();
  expect(JSON.stringify(h.elements)).toBe(before);
  expect(API.getUndoStack()).toHaveLength(0);
});

it.each(["ellipse", "circle"] as const)(
  "follows the %s silhouette without a blue rectangle",
  async (shape) => {
    const { tree, model } = await mount(shape);
    const geometry = getCoursewareMindmapGeometry(tree)!.nodes[model.rootId];
    const ring = outline(model.rootId);
    expect(ring.tagName).toBe("ellipse");
    expect(Number(ring.getAttribute("rx"))).toBe(
      shape === "circle"
        ? Math.min(geometry.width, geometry.height) / 2
        : geometry.width / 2,
    );
    expect(selected(model.rootId).querySelector("rect[stroke]")).toBeNull();
  },
);

it("gives pure text a clear rounded selection frame", async () => {
  const { model } = await mount("text");
  const ring = outline(model.rootId);
  expect(ring.tagName).toBe("rect");
  expect(ring.getAttribute("rx")).toBe("4");
  expect(ring.getAttribute("stroke-width")).toBe("10");
  expect(ring.getAttribute("mask")).toMatch(/^url\(#mindmap-selection-/);
});

it("matches a filled text node's corner radius after layout and outer scaling", async () => {
  const { model, before } = await mount("text", true, 2.5, "#ffffff");
  const ring = outline(model.rootId);
  expect(ring.tagName).toBe("rect");
  expect(ring.getAttribute("rx")).toBe("10");
  expect(ring.getAttribute("ry")).toBe("10");
  expect(ring.getAttribute("stroke-width")).toBe("10");
  expect(JSON.stringify(h.elements)).toBe(before);
  expect(API.getUndoStack()).toHaveLength(0);
});

it.each([undefined, "#62d256"])(
  "uses the text child's own background while editing (%s), without inheriting the root fill",
  async (fill) => {
    const { model, tree, controller } = await mount();
    const childId = model.order[1];
    act(() => {
      controller.select(tree.id, childId);
      if (fill) {
        controller.patch({ fill });
      }
    });
    const beforeEditing = JSON.stringify(h.elements);
    const undoCount = API.getUndoStack().length;
    // JSDOM cannot parse CSS gradients. Inspect the background assigned to
    // the actual editor, preserving the browser's style setter behavior.
    const background = vi.spyOn(
      CSSStyleDeclaration.prototype,
      "background",
      "set",
    );
    act(() => controller.startEditing());
    expect(screen.getByRole("textbox", { name: "编辑脑图主题" })).toHaveValue(
      model.nodes[childId].label,
    );
    const editorFill = fill ?? "transparent";
    expect(background).toHaveBeenCalledWith(
      `linear-gradient(${editorFill}, ${editorFill}), #ffffff`,
    );
    expect(background).not.toHaveBeenCalledWith(
      `linear-gradient(${model.nodes[model.rootId].fill}, ${model.nodes[model.rootId].fill}), #ffffff`,
    );
    expect(JSON.stringify(h.elements)).toBe(beforeEditing);
    expect(API.getUndoStack()).toHaveLength(undoCount);
  },
);

it("uses the shared silhouette for shaped nodes", async () => {
  const { tree, model } = await mount("diamond");
  const geometry = getCoursewareMindmapGeometry(tree)!.nodes[model.rootId];
  expect(outline(model.rootId).tagName).toBe("path");
  expect(outline(model.rootId).getAttribute("d")).toBe(
    shapePathData("diamond", geometry.width, geometry.height),
  );
});

it("inherits zoom, rotation and flips from the unchanged node position", async () => {
  const { tree, model } = await mount("ellipse", true);
  act(() => API.setAppState({ zoom: { value: 1.5 } as Zoom }));
  const geometry = getCoursewareMindmapGeometry(tree)!;
  const node = geometry.nodes[model.rootId];
  const point = coursewareMindmapLocalToScene(tree, node);
  const wrapper = selected(model.rootId);
  expect(wrapper.style.transform).toBe(`rotate(${tree.angle}rad) scale(-1,-1)`);
  expect(wrapper.style.transformOrigin).toBe("0 0");
  expect(parseFloat(wrapper.style.left)).toBeCloseTo(
    (point.x + h.state.scrollX) * 1.5,
  );
  expect(parseFloat(wrapper.style.width)).toBeCloseTo(
    (node.width * tree.width * 1.5) / geometry.bounds.width,
  );
  const svg = wrapper.querySelector("svg")!;
  expect(svg.getAttribute("viewBox")).toBe(`0 0 ${node.width} ${node.height}`);
  expect(svg.getAttribute("aria-hidden")).toBe("true");
  expect(outline(model.rootId).getAttribute("vector-effect")).toBe(
    "non-scaling-stroke",
  );
});

it("outlines every selected node and follows previews without saving them", async () => {
  const { model, before, controller } = await mount();
  const childId = model.order[1];
  act(() => controller.notify({ selectedNodeIds: [model.rootId, childId] }));
  expect(
    document.querySelectorAll(".Courseware-mindmap-selection"),
  ).toHaveLength(2);
  expect(outline(childId).tagName).toBe("rect");
  act(() => controller.previewPatch({ shape: "ellipse" }));
  expect(outline(model.rootId).tagName).toBe("ellipse");
  expect(outline(childId).tagName).toBe("ellipse");
  act(() => controller.previewPatch(null));
  expect(outline(model.rootId).tagName).toBe("rect");
  expect(JSON.stringify(h.elements)).toBe(before);
  expect(API.getUndoStack()).toHaveLength(0);
});
