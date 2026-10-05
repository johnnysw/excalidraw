import { arrayToMap, SVG_NS } from "@excalidraw/common";
import { pointFrom, type Radians } from "@excalidraw/math";
import {
  addMindmapNode,
  createMindmapObject,
  createMindmapTemplateObject,
  layoutMindmap,
  MINDMAP_LAYOUT_PRESETS,
  toggleMindmapNode,
  withMindmapLayout,
} from "@excalidraw/mindmap";

import {
  createCoursewareMindmapElement,
  updateCoursewareMindmapElement,
} from "../src/coursewareMindmap";
import { exportToSvg } from "../../excalidraw/scene/export";
import { drawCoursewareMindmap } from "../src/coursewareMindmapCanvas";
import { getCoursewareMindmapGeometry } from "../src/coursewareMindmapGeometry";
import { getCoursewareMindmapRenderData } from "../src/coursewareMindmapRenderData";
import { createCoursewareMindmapSvgNode } from "../src/coursewareMindmapSvg";
import {
  coursewareMindmapLocalToScene,
  coursewareMindmapSceneToLocal,
  distanceToCoursewareMindmap,
  hitCoursewareMindmapNode,
} from "../src/coursewareMindmapTransform";
import {
  getCoursewareMindmap,
  getDuplicatedMindmapNodeId,
  isCoursewareMindmapElement,
} from "../src/coursewareMindmapType";
import { isPointInElement, shouldTestInside } from "../src/collision";
import { distanceToElement } from "../src/distance";
import { duplicateElement } from "../src/duplicate";
import { getReferencedFileIds } from "../src/fileReferences";
import { resizeSingleElement, transformElements } from "../src/resizeElements";
import { Scene } from "../src/Scene";
import { getTransformHandles } from "../src/transformHandles";
import {
  isFlowchartNodeElement,
  isTextBindableContainer,
} from "../src/typeChecks";

import type {
  WhiteboardMindmapNode,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { CoursewareMindmapElement } from "../src/coursewareMindmapType";
import type { Zoom } from "../../excalidraw/types";

const changeNode = (
  model: WhiteboardMindmapObject,
  id: string,
  patch: Partial<WhiteboardMindmapNode>,
) => ({
  ...model,
  nodes: { ...model.nodes, [id]: { ...model.nodes[id], ...patch } },
});

const center = (
  element: CoursewareMindmapElement,
  id = element.customData.mindmap.rootId,
) => {
  const node = getCoursewareMindmapGeometry(element)!.nodes[id];
  return coursewareMindmapLocalToScene(element, {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  });
};

const expectPoint = (
  actual: { x: number; y: number },
  expected: { x: number; y: number },
) => {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
};

const svgRoot = () => document.createElementNS(SVG_NS, "svg");

const shapedNode = (shape: WhiteboardMindmapNode["shape"]) => {
  let model = createMindmapObject(140, 80);
  model = changeNode(model, model.rootId, { shape, width: 200, height: 100 });
  return createCoursewareMindmapElement({ mindmap: model, x: 10, y: 20 });
};

// jest-canvas-mock predates Path2D.roundRect. Keep its real path recording and
// capture the rounding arguments while exercising the actual Canvas renderer.
let roundedPaths: ReturnType<typeof vi.fn>;
beforeEach(() => {
  roundedPaths = vi.fn();
  const CanvasMockPath = Path2D;
  vi.stubGlobal(
    "Path2D",
    class extends CanvasMockPath {
      roundRect(...args: Parameters<Path2D["roundRect"]>) {
        roundedPaths(...args);
        this.rect(args[0], args[1], args[2], args[3]);
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("courseware semantic mindmap", () => {
  it("uses a native rectangle without treating independent brain references as semantic trees", () => {
    const element = createCoursewareMindmapElement({
      mindmap: createMindmapTemplateObject(0, 0),
      id: "tree",
    });
    expect(element.type).toBe("rectangle");
    expect(element.customData.mindmap.id).toBe("tree");
    expect(isCoursewareMindmapElement(element)).toBe(true);
    expect(getCoursewareMindmap(element)).toBe(element.customData.mindmap);
    expect(isTextBindableContainer(element)).toBe(false);
    expect(isFlowchartNodeElement(element)).toBe(false);
    expect(shouldTestInside(element)).toBe(true);
    const oldBrain = {
      type: "image",
      customData: { type: "mindmap", mindMapId: "old-brain" },
    } as const;
    expect(isCoursewareMindmapElement(oldBrain)).toBe(false);
    expect(getCoursewareMindmap(oldBrain)).toBeNull();
    expect(
      getCoursewareMindmap({
        type: "rectangle",
        customData: { coursewareObjectType: "mindmap", mindmap: {} },
      }),
    ).toBeNull();
  });

  it.each(MINDMAP_LAYOUT_PRESETS)(
    "maps $family/$direction geometry into native dimensions",
    ({ family, direction }) => {
      const model = createMindmapTemplateObject(430, 280, family, direction);
      const element = createCoursewareMindmapElement({ mindmap: model });
      const geometry = getCoursewareMindmapGeometry(element)!;
      expect(element.width).toBeCloseTo(geometry.bounds.width);
      expect(element.height).toBeCloseTo(geometry.bounds.height);
      expect(geometry.visibleIds).toEqual(expect.arrayContaining(model.order));
      for (const node of Object.values(geometry.nodes)) {
        expectPoint(
          coursewareMindmapSceneToLocal(
            element,
            coursewareMindmapLocalToScene(element, node),
          ),
          node,
        );
      }
    },
  );

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])("inverts scaled/rotated coordinates with flips %s/%s", (flipX, flipY) => {
    const model = {
      ...createMindmapTemplateObject(510, 270),
      flipX,
      flipY,
      rotation: 47,
    };
    const original = createCoursewareMindmapElement({
      mindmap: model,
      x: -130,
      y: 90,
    });
    const element = {
      ...original,
      width: original.width * 1.7,
      height: original.height * 1.3,
    };
    const geometry = getCoursewareMindmapGeometry(element)!;
    expect(geometry.bounds.x).not.toBe(0);
    expect(geometry.bounds.y).not.toBe(0);
    for (const node of Object.values(geometry.nodes)) {
      const local = {
        x: node.x + node.width * 0.23,
        y: node.y + node.height * 0.64,
      };
      expectPoint(
        coursewareMindmapSceneToLocal(
          element,
          coursewareMindmapLocalToScene(element, local),
        ),
        local,
      );
    }
  });

  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])(
    "anchors the root through layout/tree edits at outer scale with flips %s/%s",
    (flipX, flipY) => {
      let model: WhiteboardMindmapObject = {
        ...createMindmapTemplateObject(410, 250),
        flipX,
        flipY,
      };
      const original = createCoursewareMindmapElement({
        mindmap: model,
        x: 200,
        y: 400,
      });
      const element = {
        ...original,
        width: original.width * 1.8,
        height: original.height * 1.8,
        angle: 0.8 as Radians,
      };
      const anchor = center(element);
      model = addMindmapNode(
        model,
        model.rootId,
        "child",
        "新分支，宽度会改变",
      );
      const edited = updateCoursewareMindmapElement(element, model);
      expectPoint(center(edited), anchor);
      const changed = updateCoursewareMindmapElement(
        edited,
        layoutMindmap(withMindmapLayout(model, "timeline", "vertical")),
      );
      expectPoint(center(changed), anchor);
      expect(
        changed.width / getCoursewareMindmapGeometry(changed)!.bounds.width,
      ).toBeCloseTo(1.8);
      expect(
        changed.height / getCoursewareMindmapGeometry(changed)!.bounds.height,
      ).toBeCloseTo(1.8);
      expect(element.customData.mindmap.order).toHaveLength(
        original.customData.mindmap.order.length,
      );
    },
  );

  it("hits descriptions and visible nodes while excluding folded descendants and empty enclosing space", () => {
    let model = createMindmapTemplateObject(0, 0);
    const branch = model.order[1];
    model = addMindmapNode(model, branch, "child", "隐形子节点");
    const child = model.order[model.order.length - 1];
    model = changeNode(model, branch, { summary: "节点说明，描述区域可点击" });
    const element = createCoursewareMindmapElement({ mindmap: model });
    const data = getCoursewareMindmapRenderData(element)!;
    const item = data.nodes.find((item) => item.node.id === branch)!;
    expect(item.content.summary).toBeTruthy();
    const summary = item.content.summary!;
    const point = coursewareMindmapLocalToScene(element, {
      x: item.bounds.x + summary.x + summary.width / 2,
      y: item.bounds.y + summary.y + summary.height / 2,
    });
    expect(hitCoursewareMindmapNode(element, point)).toBe(branch);
    const hidden = updateCoursewareMindmapElement(
      element,
      toggleMindmapNode(model, branch),
    );
    expect(getCoursewareMindmapGeometry(hidden)!.visibleIds).not.toContain(
      child,
    );
    expect(hitCoursewareMindmapNode(hidden, center(element, child))).not.toBe(
      child,
    );
    const geometry = getCoursewareMindmapGeometry(element)!;
    let emptyPoint: { x: number; y: number } | undefined;
    for (
      let x = geometry.bounds.x + 3;
      !emptyPoint && x < geometry.bounds.x + geometry.bounds.width;
      x += 15
    ) {
      for (
        let y = geometry.bounds.y + 3;
        y < geometry.bounds.y + geometry.bounds.height;
        y += 15
      ) {
        const point = coursewareMindmapLocalToScene(element, { x, y });
        if (!hitCoursewareMindmapNode(element, point)) {
          emptyPoint = point;
          break;
        }
      }
    }
    expect(emptyPoint).toBeTruthy();
    expect(
      isPointInElement(
        pointFrom(emptyPoint!.x, emptyPoint!.y),
        element,
        arrayToMap([element]),
      ),
    ).toBe(false);
    expect(
      distanceToElement(
        element,
        arrayToMap([element]),
        pointFrom(emptyPoint!.x, emptyPoint!.y),
      ),
    ).toBeGreaterThan(0);
  });

  it.each(["ellipse", "circle", "diamond", "triangle"] as const)(
    "excludes blank %s corners from selection and binding distance",
    (shape) => {
      const element = shapedNode(shape);
      const bounds =
        getCoursewareMindmapGeometry(element)!.nodes[
          element.customData.mindmap.rootId
        ];
      const point = coursewareMindmapLocalToScene(element, {
        x: bounds.x + 1,
        y: bounds.y + 1,
      });
      expect(hitCoursewareMindmapNode(element, point)).toBeNull();
      expect(distanceToCoursewareMindmap(element, point)).toBeGreaterThan(10);
      expect(hitCoursewareMindmapNode(element, center(element))).toBe(
        element.customData.mindmap.rootId,
      );
    },
  );

  it("duplicates all internal IDs independently while sharing native image assets", () => {
    let model = createMindmapTemplateObject(0, 0);
    model = changeNode(model, model.order[1], { imageAssetId: "asset" });
    const element = createCoursewareMindmapElement({ mindmap: model });
    const before = JSON.stringify(element);
    const copied = duplicateElement(null, new Map(), element, true);
    const copy = getCoursewareMindmap(copied)!;
    expect(copied.id).not.toBe(element.id);
    expect(copy.id).toBe(copied.id);
    for (const oldId of model.order) {
      const newId = getDuplicatedMindmapNodeId(copied, oldId)!;
      expect(newId).toBeTruthy();
      expect(newId).not.toBe(oldId);
      expect(copy.nodes[newId]).toBeTruthy();
      expect(copy.nodes[newId].parentId).toBe(
        model.nodes[oldId].parentId
          ? getDuplicatedMindmapNodeId(copied, model.nodes[oldId].parentId!)
          : null,
      );
    }
    expect(getReferencedFileIds(copied)).toEqual(["asset"]);
    expect(JSON.stringify(element)).toBe(before);
  });

  it("collects hidden-node file references for persistence and worker extraction", () => {
    let model = createMindmapTemplateObject(0, 0);
    const branch = model.order[1];
    model = addMindmapNode(model, branch, "child");
    const child = model.order[model.order.length - 1];
    model = changeNode(model, child, { imageAssetId: "hidden-asset" });
    model = toggleMindmapNode(model, branch);
    const element = createCoursewareMindmapElement({ mindmap: model });
    expect(getReferencedFileIds(element)).toEqual(["hidden-asset"]);
    expect(
      getReferencedFileIds({
        fileId: "outer",
        customData: {
          coursewareObjectType: "mindmap",
          mindmap: {
            nodes: {
              a: { imageAssetId: "outer" },
              b: null,
              c: { imageAssetId: 20 },
            },
          },
        },
      }),
    ).toEqual(["outer"]);
    expect(
      getReferencedFileIds({
        customData: { coursewareObjectType: "mindmap", mindmap: { nodes: [] } },
      }),
    ).toEqual([]);
    expect(getReferencedFileIds(null)).toEqual([]);
  });

  it("uses only corner/rotation handles and maintains aspect ratio during native resize", () => {
    const element = createCoursewareMindmapElement({
      mindmap: createMindmapTemplateObject(0, 0),
      x: 20,
      y: 30,
    });
    const map = arrayToMap([element]);
    const handles = getTransformHandles(element, { value: 1 } as Zoom, map);
    expect(Object.keys(handles).sort()).toEqual([
      "ne",
      "nw",
      "rotation",
      "se",
      "sw",
    ]);
    const before = { ...element };
    const scene = new Scene([element], { skipValidation: true });
    transformElements(
      map,
      "se",
      [element],
      scene,
      false,
      false,
      false,
      element.x + element.width * 2,
      element.y + element.height * 1.5,
      0,
      0,
    );
    expect(element.width / before.width).toBeCloseTo(
      element.height / before.height,
    );
    expect(element.customData.mindmap.layoutScale).toBe(1);
    const original = {
      ...element,
      customData: {
        ...element.customData,
        mindmap: { ...element.customData.mindmap },
      },
    };
    resizeSingleElement(
      -element.width,
      element.height,
      element,
      original,
      arrayToMap([original]),
      scene,
      "se",
    );
    expect(element.customData.mindmap.flipX).toBe(true);
    expect(element.customData.mindmap.flipY).toBe(false);
    expect(element.width).toBeGreaterThan(0);
  });

  it("exports aggregate transparency and retains nested image files", async () => {
    let model = createMindmapObject(0, 0);
    model = changeNode(model, model.rootId, {
      imageAssetId: "embedded",
      imageWidth: 60,
      imageHeight: 40,
      opacity: 0.7,
    });
    const original = createCoursewareMindmapElement({ mindmap: model });
    const element = { ...original, opacity: 35 };
    const svg = await exportToSvg(
      [element],
      {
        exportBackground: false,
        viewBackgroundColor: "#ffffff",
        exportWithDarkMode: true,
      },
      {
        embedded: {
          id: "embedded",
          dataURL: "data:image/png;base64,aA==",
          mimeType: "image/png",
          created: 1,
        },
      } as any,
      { skipInliningFonts: true },
    );
    const group = svg.querySelector(`[data-id="${element.id}"]`)!;
    expect(group.getAttribute("opacity")).toBe("0.35");
    expect(group.hasAttribute("fill-opacity")).toBe(false);
    expect(
      group.querySelector("[data-mindmap-node]")?.getAttribute("opacity"),
    ).toBe("0.7");
    expect(group.querySelector("image")?.getAttribute("href")).toBe(
      "data:image/png;base64,aA==",
    );
    expect(group.querySelector("image")?.getAttribute("filter")).toContain(
      "invert",
    );
  });

  it.each([1, 2.5])(
    "paints an explicitly chosen text-node background without an outline at layout scale %s",
    (layoutScale) => {
      let model: ReturnType<typeof createMindmapObject> = {
        ...createMindmapObject(0, 0),
        layoutScale,
      };
      model = changeNode(model, model.rootId, {
        shape: "text",
        fill: "#62d256",
        color: "#222222",
        stroke: "#ff0000",
        strokeWidth: 8,
        opacity: 0.4,
      });
      const element = createCoursewareMindmapElement({ mindmap: model });
      const bounds = getCoursewareMindmapGeometry(element)!.nodes[model.rootId];
      const ctx = document.createElement("canvas").getContext("2d")!;
      ctx.globalAlpha = 0.75;
      const paints: { color: typeof ctx.fillStyle; opacity: number }[] = [];
      const fill = vi.spyOn(ctx, "fill").mockImplementation(() => {
        paints.push({ color: ctx.fillStyle, opacity: ctx.globalAlpha });
      });
      const stroke = vi.spyOn(ctx, "stroke");
      drawCoursewareMindmap(element, ctx);
      expect(fill).toHaveBeenCalledTimes(1);
      expect(paints[0].color).toBe("#62d256");
      expect(paints[0].opacity).toBeCloseTo(0.3);
      expect(roundedPaths).toHaveBeenCalledWith(
        0,
        0,
        bounds.width,
        bounds.height,
        4 * layoutScale,
      );
      expect(stroke).not.toHaveBeenCalled();
      expect(ctx.globalAlpha).toBe(0.75);

      const svg = createCoursewareMindmapSvgNode(element, svgRoot());
      const group = svg.querySelector(`[data-mindmap-node="${model.rootId}"]`)!;
      const background = group.querySelector("rect")!;
      expect(group.firstElementChild).toBe(background);
      expect(group.getAttribute("opacity")).toBe("0.4");
      expect(background.getAttribute("fill")).toBe("#62d256");
      expect(background.getAttribute("width")).toBe(`${bounds.width}`);
      expect(background.getAttribute("height")).toBe(`${bounds.height}`);
      expect(background.getAttribute("rx")).toBe(`${4 * layoutScale}`);
      expect(background.getAttribute("stroke") ?? "none").toBe("none");
      expect(group.querySelector("text")!.getAttribute("fill")).toBe(
        "#222222",
      );
      expect(getCoursewareMindmap(element)!.nodes[model.rootId].shape).toBe(
        "text",
      );
    },
  );

  it("leaves default text nodes unpainted instead of inheriting the map fill", () => {
    const original = createMindmapTemplateObject(0, 0);
    const model = {
      ...original,
      fill: "#62d256",
      nodes: Object.fromEntries(
        Object.entries(original.nodes).map(([id, node]) => [
          id,
          { ...node, shape: "text" as const, fill: undefined },
        ]),
      ),
    };
    const element = createCoursewareMindmapElement({ mindmap: model });
    const ctx = document.createElement("canvas").getContext("2d")!;
    const fill = vi.spyOn(ctx, "fill");
    drawCoursewareMindmap(element, ctx);
    expect(fill).not.toHaveBeenCalled();
    expect(roundedPaths).not.toHaveBeenCalled();
    const svg = createCoursewareMindmapSvgNode(element, svgRoot());
    for (const group of svg.querySelectorAll("[data-mindmap-node]")) {
      expect(group.querySelector("rect, ellipse, path")).toBeNull();
      expect(group.querySelector("text")).toBeTruthy();
    }
  });

  it.each([
    ["#62d256", true],
    [undefined, false],
    ["transparent", false],
    ["rgba(255, 255, 255, 0)", false],
    ["#62d25600", false],
    ["rgba(98, 210, 86, 0.25)", true],
  ] as const)(
    "hits text-node padding only when its explicit background is visible (%s)",
    (fill, visible) => {
      let model = createMindmapObject(0, 0);
      model = changeNode(model, model.rootId, {
        shape: "text",
        width: 200,
        height: 100,
        strokeWidth: 0,
        fill,
      });
      const element = createCoursewareMindmapElement({ mindmap: model });
      const { bounds, content } =
        getCoursewareMindmapRenderData(element)!.nodes[0];
      expect(content.text.x).toBeGreaterThan(1);
      const padding = coursewareMindmapLocalToScene(element, {
        x: bounds.x + 1,
        y: bounds.y + bounds.height / 2,
      });
      expect(hitCoursewareMindmapNode(element, padding)).toBe(
        visible ? model.rootId : null,
      );
      if (visible) {
        const outsideRoundedCorner = coursewareMindmapLocalToScene(element, {
          x: bounds.x + 0.1,
          y: bounds.y + 0.1,
        });
        expect(
          hitCoursewareMindmapNode(element, outsideRoundedCorner),
        ).toBeNull();
      }
    },
  );

  it("retains normal shaped-node fill and stroke without adding a text background", () => {
    let model = createMindmapObject(0, 0);
    model = changeNode(model, model.rootId, {
      shape: "ellipse",
      fill: "#62d256",
      stroke: "#ff0000",
      strokeWidth: 4,
    });
    const element = createCoursewareMindmapElement({ mindmap: model });
    const ctx = document.createElement("canvas").getContext("2d")!;
    const colors: (typeof ctx.fillStyle)[] = [];
    vi.spyOn(ctx, "fill").mockImplementation(() => colors.push(ctx.fillStyle));
    const stroke = vi.spyOn(ctx, "stroke");
    drawCoursewareMindmap(element, ctx);
    expect(colors).toEqual(["#62d256"]);
    expect(stroke).toHaveBeenCalledTimes(1);
    expect(roundedPaths).not.toHaveBeenCalled();
    const svg = createCoursewareMindmapSvgNode(element, svgRoot());
    expect(svg.querySelector("rect")).toBeNull();
    expect(svg.querySelector("ellipse")!.getAttribute("fill")).toBe("#62d256");
    expect(svg.querySelector("ellipse")!.getAttribute("stroke")).toBe("#ff0000");
    expect(svg.querySelector("ellipse")!.getAttribute("stroke-width")).toBe("4");
  });

  it("renders multiline labels, node styles, descriptions and image files consistently in Canvas/SVG", () => {
    let model = createMindmapObject(340, 250, "第一行\n第二行");
    model = changeNode(model, model.rootId, {
      summary: "说明文字",
      imageAssetId: "image",
      imageWidth: 64,
      imageHeight: 48,
      fontStyle: "italic",
      textDecoration: "underline",
      color: "#ff0000",
      opacity: 0.4,
      shape: "ellipse",
    });
    model = { ...model, flipX: true };
    const element = createCoursewareMindmapElement({ mindmap: model });
    const root = svgRoot();
    const svg = createCoursewareMindmapSvgNode(
      element,
      root,
      {
        image: { dataURL: "data:image/png;base64,aA==", mimeType: "image/png" },
      },
      { imageFilter: "invert(100%)" },
    );
    expect(svg.querySelectorAll("[data-mindmap-node]")).toHaveLength(1);
    expect(
      svg.querySelector("[data-mindmap-node]")?.getAttribute("opacity"),
    ).toBe("0.4");
    expect(
      [...svg.querySelectorAll("text tspan")].map((item) => item.textContent),
    ).toEqual(expect.arrayContaining(["第一行", "第二行", "说明文字"]));
    expect(svg.querySelector("text")?.getAttribute("font-style")).toBe(
      "italic",
    );
    expect(svg.querySelector("text")?.getAttribute("text-decoration")).toBe(
      "underline",
    );
    expect(svg.querySelector("image")?.getAttribute("href")).toBe(
      "data:image/png;base64,aA==",
    );
    expect(svg.querySelector("image")?.getAttribute("filter")).toBe(
      "invert(100%)",
    );
    const image = document.createElement("canvas");
    const ctx = document.createElement("canvas").getContext("2d")!;
    const labels: string[] = [];
    const imageFilters: string[] = [];
    vi.spyOn(ctx, "fillText").mockImplementation((text) => {
      labels.push(String(text));
    });
    vi.spyOn(ctx, "drawImage").mockImplementation(() => {
      imageFilters.push(ctx.filter);
    });
    drawCoursewareMindmap(element, ctx, {
      imageCache: new Map([["image", { image, mimeType: "image/png" }]]),
      imageFilter: "invert(100%)",
    });
    expect(labels).toEqual(
      expect.arrayContaining(["第一行", "第二行", "说明文字"]),
    );
    expect(imageFilters).toEqual(["invert(100%)"]);
    expect(ctx.filter).toBe("none");
    const vectorSvg = createCoursewareMindmapSvgNode(
      element,
      root,
      {
        image: {
          dataURL: "data:image/svg+xml;base64,aA==",
          mimeType: "image/svg+xml",
        },
      },
      { imageFilter: "invert(100%)" },
    );
    expect(vectorSvg.querySelector("image")?.hasAttribute("filter")).toBe(
      false,
    );
  });
});
