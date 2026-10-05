import React from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/common";
import {
  createCoursewareMindmapElement,
  coursewareMindmapLocalToScene,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
} from "@excalidraw/element/coursewareMindmap";
import { resolveMindmapNodeBinding } from "@excalidraw/element/coursewareMindmapBinding";
import {
  createMindmapTemplateObject,
  addMindmapNode,
} from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "@excalidraw/element/types";
import { newElementWith } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";
import { Excalidraw } from "../index";
import { startMindmapDrag } from "../coursewareMindmap/drag";
import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, unmountComponent } from "./test-utils";
const { h } = window;
const live = (id: string) =>
  h.elements.find((e) => e.id === id) as ExcalidrawRectangleElement;
const current = (id: string) => getCoursewareMindmap(live(id))!;
const point = (
  element: ExcalidrawRectangleElement,
  id: string,
  rx = 0.5,
  ry = 0.5,
) => {
  const b = getCoursewareMindmapGeometry(element)!.nodes[id];
  const w = coursewareMindmapLocalToScene(element, {
    x: b.x + b.width * rx,
    y: b.y + b.height * ry,
  });
  const p = sceneCoordsToViewportCoords({ sceneX: w.x, sceneY: w.y }, h.state);
  return { clientX: p.x, clientY: p.y, pointerId: 50, altKey: false };
};
const setup = async (folded = false) => {
  let model = createMindmapTemplateObject(0, 0);
  if (folded) {
    model = addMindmapNode(model, model.order[2], "child", "折叠子主题");
    model.nodes[model.order[2]] = {
      ...model.nodes[model.order[2]],
      collapsed: true,
    };
  }
  const tree = createCoursewareMindmapElement({
    mindmap: model,
    x: 160,
    y: 160,
  });
  await render(
    <Excalidraw
      role="teacher"
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left" }}
      initialData={{ elements: [tree] }}
    />,
  );
  const source = current(tree.id).order[1];
  act(() => h.app.mindmap.select(tree.id, source));
  return { tree: live(tree.id), source };
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("courseware semantic branch drag", () => {
  it("previews insertion after a sibling and submits one structural history operation", async () => {
    const { tree, source } = await setup();
    const target = current(tree.id).order[3],
      before = JSON.stringify(live(tree.id));
    act(() => {
      startMindmapDrag(h.app.mindmap, point(tree, source), tree, source);
      fireEvent.pointerMove(window, point(tree, target, 0.5, 0.95));
    });
    expect(h.app.mindmap.getSnapshot().dropIntent).toMatchObject({
      nodeId: target,
      position: "after",
    });
    expect(JSON.stringify(live(tree.id))).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    act(() => fireEvent.pointerUp(window, point(tree, target, 0.5, 0.95)));
    expect(current(tree.id).order.indexOf(source)).toBeGreaterThan(
      current(tree.id).order.indexOf(target),
    );
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(JSON.stringify(current(tree.id).order)).toBe(
      JSON.stringify(getCoursewareMindmap(tree)!.order),
    );
  });
  it("previews a whole moving branch in empty space and cancels without saving", async () => {
    const { tree, source } = await setup();
    const before = JSON.stringify(live(tree.id)),
      start = point(tree, source);
    act(() => {
      startMindmapDrag(h.app.mindmap, start, tree, source);
      fireEvent.pointerMove(window, {
        ...start,
        clientX: start.clientX + 800,
        clientY: start.clientY + 400,
      });
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(h.app.mindmap.getSnapshot().splitCandidate).toBe(true);
    act(() => fireEvent.keyDown(window, { key: "Escape" }));
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(JSON.stringify(live(tree.id))).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("rejects a drag into its own branch and pointercancel clears every draft", async () => {
    const { tree, source } = await setup();
    const before = JSON.stringify(live(tree.id)),
      start = point(tree, source);
    act(() => {
      startMindmapDrag(h.app.mindmap, start, tree, source);
      fireEvent.pointerMove(window, { ...start, clientX: start.clientX + 6 });
    });
    expect(h.app.mindmap.getSnapshot().dropIntent).toBeNull();
    expect(h.app.mindmap.getSnapshot().dropWarning).toBe("无法移动到当前主题");
    act(() => fireEvent.pointerCancel(window, start));
    expect(h.app.mindmap.getSnapshot().dropWarning).toBeNull();
    expect(JSON.stringify(live(tree.id))).toBe(before);
  });
  it("temporarily reveals folded descendants after 600ms and restores collapse when cancelled", async () => {
    const { tree, source } = await setup(true),
      target = current(tree.id).order[2],
      start = point(tree, source),
      drop = point(tree, target);
    vi.useFakeTimers();
    act(() => {
      startMindmapDrag(h.app.mindmap, start, tree, source);
      fireEvent.pointerMove(window, drop);
    });
    expect(current(tree.id).nodes[target].collapsed).toBe(true);
    act(() => vi.advanceTimersByTime(599));
    expect(
      getCoursewareMindmap(h.app.mindmap.getSnapshot().preview)!.nodes[target]
        .collapsed,
    ).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(
      getCoursewareMindmap(h.app.mindmap.getSnapshot().preview)!.nodes[target]
        .collapsed,
    ).toBe(false);
    act(() => fireEvent.pointerCancel(window, drop));
    expect(current(tree.id).nodes[target].collapsed).toBe(true);
    expect(API.getUndoStack()).toHaveLength(0);
  });
  it("uses Alt for manual movement and preserves root identity and geometry in the draft", async () => {
    const { tree, source } = await setup(),
      original = current(tree.id),
      start = { ...point(tree, source), altKey: true };
    act(() => {
      startMindmapDrag(h.app.mindmap, start, tree, source);
      fireEvent.pointerMove(window, {
        ...start,
        clientX: start.clientX + 35,
        clientY: start.clientY + 20,
      });
    });
    const draft = getCoursewareMindmap(h.app.mindmap.getSnapshot().preview)!;
    expect(draft.nodes[original.rootId]).toBe(original.nodes[original.rootId]);
    expect(draft.nodes[source].positionLocked).toBe(true);
    act(() => fireEvent.pointerUp(window, start));
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(current(tree.id).nodes).toEqual(original.nodes);
  });
  it("adds and removes native frame membership with the root move and undoes each atomically", async () => {
    const { tree } = await setup();
    const frame = API.createElement({
      type: "frame",
      x: 600,
      y: 200,
      width: 500,
      height: 400,
    });
    const rootId = current(tree.id).rootId;
    const binding = {
      elementId: tree.id,
      fixedPoint: [1, 0.5] as [number, number],
      mode: "inside" as const,
      mindmapNodeId: rootId,
      mindmapNodePoint: [1, 0.5] as [number, number],
    };
    const anchor = resolveMindmapNodeBinding(tree, binding)!;
    const arrow = API.createElement({
      type: "arrow",
      x: anchor[0],
      y: anchor[1],
      width: 200,
      height: 60,
      points: [pointFrom(0, 0), pointFrom(200, 60)],
      startBinding: binding,
    });
    const fixture = [
      ...h.elements.map((element) =>
        element.id === tree.id
          ? newElementWith(element, {
              boundElements: [{ id: arrow.id, type: "arrow" }],
            })
          : element,
      ),
      frame,
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
    const restoredArrow = h.elements.find(
      (element) => element.id === arrow.id,
    )!;
    const beforeArrow = {
      x: restoredArrow.x,
      y: restoredArrow.y,
      points: "points" in restoredArrow ? restoredArrow.points : [],
      startBinding:
        "startBinding" in restoredArrow ? restoredArrow.startBinding : null,
    };
    act(() => h.app.mindmap.select(tree.id, rootId));
    const start = point(live(tree.id), rootId);
    const inside = { ...start, clientX: 720, clientY: 360 };
    act(() => {
      startMindmapDrag(h.app.mindmap, start, live(tree.id), rootId);
      fireEvent.pointerMove(window, inside);
    });
    expect(live(tree.id).frameId).toBeNull();
    expect(h.elements.find((element) => element.id === arrow.id)).toMatchObject(
      beforeArrow,
    );
    expect(API.getUndoStack()).toHaveLength(0);
    act(() => fireEvent.pointerUp(window, inside));
    expect(live(tree.id).frameId).toBe(frame.id);
    expect(h.elements.find((element) => element.id === arrow.id)!.x).not.toBe(
      beforeArrow.x,
    );
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(live(tree.id).frameId).toBeNull();
    expect(live(tree.id).x).toBe(tree.x);
    expect(h.elements.find((element) => element.id === arrow.id)).toMatchObject(
      beforeArrow,
    );
    Keyboard.redo();
    expect(live(tree.id).frameId).toBe(frame.id);
    const secondStart = point(live(tree.id), rootId),
      outside = { ...secondStart, clientX: 240, clientY: 200 };
    act(() => {
      startMindmapDrag(h.app.mindmap, secondStart, live(tree.id), rootId);
      fireEvent.pointerMove(window, outside);
    });
    expect(live(tree.id).frameId).toBe(frame.id);
    act(() => fireEvent.pointerUp(window, outside));
    expect(live(tree.id).frameId).toBeNull();
    expect(API.getUndoStack()).toHaveLength(2);
    Keyboard.undo();
    expect(live(tree.id).frameId).toBe(frame.id);
  });
});
