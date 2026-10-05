import React from "react";
import {
  getElementAbsoluteCoords,
  getTransformHandles,
} from "@excalidraw/element";
import {
  createCoursewareMindmapElement,
  createCoursewareMindmapElementFromExchange,
  getCoursewareMindmap,
  getCoursewareMindmapForExchange,
  getCoursewareMindmapGeometry,
  coursewareMindmapLocalToScene,
} from "@excalidraw/element/coursewareMindmap";
import {
  createMindmapTemplateObject,
  MindmapExchangeCodec,
  resolveMindmapObjectGeometry,
  transformRectanglePoint,
} from "@excalidraw/mindmap";
import { pointFrom, pointRotateRads } from "@excalidraw/math";
import type { Radians } from "@excalidraw/math";
import { Excalidraw } from "../index";
import { actionChangeOpacity } from "../actions/actionProperties";
import { actionToggleElementLock } from "../actions/actionElementLock";
import { API } from "./helpers/api";
import { Keyboard, Pointer } from "./helpers/ui";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;
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

it("preserves native whole-map rotation, movement, opacity and locking in exchange", async () => {
  const original = createCoursewareMindmapElement({
    mindmap: createMindmapTemplateObject(0, 0),
    x: 100,
    y: 100,
  });
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [original] }}
    />,
  );
  const element = () => API.getElement(original);
  API.setSelectedElements([element()]);
  const map = h.app.scene.getNonDeletedElementsMap();
  const [, , , , cx, cy] = getElementAbsoluteCoords(element(), map, true);
  const handle = getTransformHandles(
    element(),
    h.state.zoom,
    map,
    "mouse",
    undefined,
    "bottom-left",
  ).rotation!;
  const start = pointFrom(handle[0] + handle[2] / 2, handle[1] + handle[3] / 2);
  const end = pointRotateRads(
    start,
    pointFrom(cx, cy),
    (Math.PI / 6) as Radians,
  );
  const viewport = ([x, y]: readonly number[]) =>
    [
      (x + h.state.scrollX) * h.state.zoom.value + h.state.offsetLeft,
      (y + h.state.scrollY) * h.state.zoom.value + h.state.offsetTop,
    ] as const;
  const mouse = new Pointer("mouse");
  mouse.downAt(...viewport(start));
  mouse.moveTo(...viewport(end));
  mouse.upAt();
  expect(element().angle).toBeCloseTo(Math.PI / 6);
  Keyboard.keyPress("ArrowRight");
  expect(element().x).not.toBe(original.x);
  act(() => h.app.actionManager.executeAction(actionChangeOpacity, "ui", 50));
  expect(element().opacity).toBe(50);
  act(() => h.app.actionManager.executeAction(actionToggleElementLock, "ui"));
  expect(element().locked).toBe(true);
  const actual = element();
  act(() =>
    h.app.mindmap.select(actual.id, getCoursewareMindmap(actual)!.rootId),
  );
  const clipboard = new Map<string, string>();
  const event = {
    clipboardData: {
      setData: (type: string, data: string) => clipboard.set(type, data),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  expect(h.app.mindmap.clipboard.copy(event)).toBe(true);
  const copied = MindmapExchangeCodec.parse(
    clipboard.get("text/plain")!,
  ).object;
  const exported = MindmapExchangeCodec.parse(
    MindmapExchangeCodec.serialize(h.app.mindmap.exchangeModel!),
  ).object;
  const rebuilt = createCoursewareMindmapElementFromExchange({
    mindmap: copied,
  });
  expect(copied.rotation).toBeCloseTo(30);
  expect(exported.rotation).toBeCloseTo(30);
  expect(rebuilt.angle).toBeCloseTo(actual.angle);
  expect(rebuilt.opacity).toBe(actual.opacity);
  expect(rebuilt.x).toBeCloseTo(actual.x);
  expect(rebuilt.y).toBeCloseTo(actual.y);
  expect(rebuilt.locked).toBe(actual.locked);
  expect(h.app.mindmap.model!.rotation).toBe(0);
});

it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "keeps every node world position through scaled and rotated exchange with flips %s/%s",
  (flipX, flipY) => {
    const model = createMindmapTemplateObject(80, 60);
    model.flipX = flipX;
    model.flipY = flipY;
    const initial = createCoursewareMindmapElement({
      mindmap: model,
      x: -150,
      y: 270,
    });
    const actual = {
      ...initial,
      width: initial.width * 1.8,
      height: initial.height * 1.8,
      angle: (-Math.PI / 3) as Radians,
    };
    const before = JSON.stringify(actual);
    const exported = getCoursewareMindmapForExchange(actual)!;
    const decoded = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(exported),
    ).object;
    const native = createCoursewareMindmapElementFromExchange({
      mindmap: decoded,
    });
    const source = getCoursewareMindmapGeometry(actual)!;
    const destination = resolveMindmapObjectGeometry(decoded, { padding: 0 });
    for (const id of source.visibleIds) {
      const node = source.nodes[id],
        next = destination.nodes[id];
      const expected = coursewareMindmapLocalToScene(actual, {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      });
      const shared = transformRectanglePoint(decoded, {
        x: decoded.x + next.x + next.width / 2,
        y: decoded.y + next.y + next.height / 2,
      });
      const restored = coursewareMindmapLocalToScene(native, {
        x: next.x + next.width / 2,
        y: next.y + next.height / 2,
      });
      expect(
        Math.hypot(expected.x - shared.x, expected.y - shared.y),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.hypot(expected.x - restored.x, expected.y - restored.y),
      ).toBeLessThanOrEqual(1);
    }
    expect(JSON.stringify(actual)).toBe(before);
    expect(native.angle).toBeCloseTo(actual.angle);
    expect(decoded.layoutScale).toBeCloseTo(1.8);
  },
);
