import React from "react";
import {
  createCoursewareMindmapElement,
  getCoursewareMindmap,
} from "@excalidraw/element/coursewareMindmap";
import {
  createMindmapTemplateObject,
  MindmapExchangeCodec,
  MINDMAP_EXCHANGE_MIME,
} from "@excalidraw/mindmap";
import { Excalidraw } from "../index";
import { API } from "./helpers/api";
import { Keyboard } from "./helpers/ui";
import { act, fireEvent, render, screen, unmountComponent } from "./test-utils";
const { h } = window;
const setup = async (historicalWidth = false) => {
  const initialMindmap = createMindmapTemplateObject(0, 0);
  if (historicalWidth)
    for (const node of Object.values(initialMindmap.nodes)) {
      delete node.widthMode;
      delete node.textMaxWidth;
    }
  const tree = createCoursewareMindmapElement({
    mindmap: initialMindmap,
    x: 200,
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
  act(() =>
    h.app.mindmap.select(tree.id, getCoursewareMindmap(tree)!.order[1]),
  );
  const current = () =>
    getCoursewareMindmap(h.elements.find((e) => e.id === tree.id))!;
  return { tree, current };
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
describe("courseware mindmap workspace and real input", () => {
  it("receives real IME composition in the input capture and leaves structure shortcuts inactive", async () => {
    const { current } = await setup();
    const capture = document.querySelector<HTMLTextAreaElement>(
      "[data-mindmap-input-capture]",
    )!;
    fireEvent.compositionStart(capture);
    fireEvent.input(capture, { target: { value: "中文输入" } });
    fireEvent.keyDown(capture, {
      key: "Enter",
      isComposing: true,
      keyCode: 229,
    });
    fireEvent.keyDown(capture, { key: "Tab", isComposing: true, keyCode: 229 });
    expect(current().order).toHaveLength(4);
    expect(h.app.mindmap.getSnapshot().editing).toBeNull();
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.compositionEnd(capture, { data: "中文输入" });
    expect(screen.getByRole("textbox", { name: "编辑脑图主题" })).toHaveValue(
      "中文输入",
    );
    fireEvent.keyDown(screen.getByRole("textbox", { name: "编辑脑图主题" }), {
      key: "Enter",
    });
    expect(h.app.mindmap.node!.label).toBe("中文输入");
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("does not steal focus from the outline, previews text and commits on Enter once", async () => {
    const { current } = await setup();
    const id = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.notify({ workspacePanel: "outline" }));
    const inputs = screen.getAllByRole("textbox", {
      name: "大纲主题 分支主题",
    });
    const input = inputs[0];
    act(() => input.focus());
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "大纲预览主题\n第二行" } });
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(current().nodes[id].label).toBe("分支主题");
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(document.activeElement).toBe(input);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(current().nodes[id].label).toBe("大纲预览主题\n第二行");
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(current().nodes[id].label).toBe("分支主题");
  });
  it("cancels outline drafts with Escape without persisting text or width changes", async () => {
    const { current } = await setup();
    const before = JSON.stringify(current());
    act(() => h.app.mindmap.notify({ workspacePanel: "outline" }));
    const input = screen.getAllByRole("textbox", {
      name: "大纲主题 分支主题",
    })[0];
    act(() => input.focus());
    fireEvent.change(input, { target: { value: "不应保存的草稿" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(JSON.stringify(current())).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
  });
  it("cancels a width gesture and commits its completed replacement only once", async () => {
    const { current } = await setup();
    const id = h.app.mindmap.node!.id,
      before = JSON.stringify(current());
    const handle = screen.getByRole("button", { name: "调整文字右侧宽度" });
    fireEvent.pointerDown(handle, {
      pointerId: 60,
      clientX: 450,
      clientY: 240,
    });
    fireEvent.pointerMove(window, {
      pointerId: 60,
      clientX: 550,
      clientY: 240,
    });
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(JSON.stringify(current())).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.pointerCancel(window, { pointerId: 60 });
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(JSON.stringify(current())).toBe(before);
    fireEvent.pointerDown(handle, {
      pointerId: 61,
      clientX: 450,
      clientY: 240,
    });
    fireEvent.pointerMove(window, {
      pointerId: 61,
      clientX: 490,
      clientY: 240,
    });
    fireEvent.pointerUp(window, { pointerId: 61 });
    expect(current().nodes[id].widthMode).toBe("fixed");
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(JSON.stringify(current())).toBe(before);
  });
  it("does not convert an untouched historical width input into a fixed-width layout", async () => {
    const { current } = await setup(true);
    act(() => h.app.mindmap.notify({ workspacePanel: "content" }));
    const width = screen.getByRole("spinbutton", { name: "节点文字宽度" });
    const before = JSON.stringify(current());
    act(() => width.focus());
    act(() => width.blur());
    expect(JSON.stringify(current())).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    act(() => width.focus());
    fireEvent.change(width, { target: { value: "320" } });
    act(() => width.blur());
    expect(JSON.stringify(current())).toBe(before);
    expect(API.getUndoStack()).toHaveLength(0);
    act(() => width.focus());
    fireEvent.change(width, { target: { value: "180.5" } });
    act(() => width.blur());
    expect(h.app.mindmap.node).toMatchObject({
      widthMode: "fixed",
      textMaxWidth: 180.5,
    });
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(JSON.stringify(current())).toBe(before);
  });
  it("merges only edited professional fields and rejects removed or conflicting targets", async () => {
    const { current } = await setup();
    const nodeIds = [h.app.mindmap.node!.id];
    act(() => {
      h.app.mindmap.command({
        type: "boundary",
        value: { id: "transaction-boundary", nodeIds, title: "原始外框" },
      });
      h.app.mindmap.notify({ workspacePanel: "objects" });
    });
    fireEvent.click(screen.getByRole("button", { name: "外框 · 原始外框" }));
    const initialHistory = API.getUndoStack().length;
    const before = JSON.stringify(current());
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(JSON.stringify(current())).toBe(before);
    expect(API.getUndoStack()).toHaveLength(initialHistory);
    fireEvent.click(screen.getByRole("button", { name: "外框 · 原始外框" }));
    fireEvent.change(screen.getByRole("textbox", { name: "结构标注文字" }), {
      target: { value: "本地标题" },
    });
    act(() =>
      h.app.mindmap.command({
        type: "boundary",
        value: { ...current().boundaries![0], fill: "#ffeedd" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(current().boundaries![0]).toMatchObject({
      title: "本地标题",
      fill: "#ffeedd",
    });
    fireEvent.click(screen.getByRole("button", { name: "外框 · 本地标题" }));
    fireEvent.change(screen.getByRole("textbox", { name: "结构标注文字" }), {
      target: { value: "冲突标题" },
    });
    act(() =>
      h.app.mindmap.command({
        type: "boundary",
        value: { ...current().boundaries![0], title: "远端标题" },
      }),
    );
    const conflictHistory = API.getUndoStack().length;
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(current().boundaries![0].title).toBe("远端标题");
    expect(API.getUndoStack()).toHaveLength(conflictHistory);
    fireEvent.click(screen.getByRole("button", { name: "外框 · 远端标题" }));
    fireEvent.change(screen.getByRole("textbox", { name: "结构标注文字" }), {
      target: { value: "不应复活" },
    });
    act(() =>
      h.app.mindmap.command({
        type: "remove-professional",
        id: "transaction-boundary",
      }),
    );
    const removedHistory = API.getUndoStack().length;
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));
    expect(current().boundaries).toEqual([]);
    expect(API.getUndoStack()).toHaveLength(removedHistory);
  });
  it("accepts formatted JSON and rejects malformed typed clipboard without native insertion", async () => {
    const { current } = await setup();
    const payload = MindmapExchangeCodec.serialize(current(), {}, [
        current().order[2],
      ]),
      pretty = JSON.stringify(JSON.parse(payload), null, 2);
    const event = {
      clipboardData: {
        files: [],
        getData: (type: string) => (type === "text/plain" ? pretty : ""),
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () =>
      expect(await h.app.mindmap.clipboard.paste(event)).toBe(true),
    );
    expect(current().order).toHaveLength(5);
    const before = JSON.stringify(h.elements);
    const bad = {
      clipboardData: {
        files: [],
        getData: (type: string) =>
          type === MINDMAP_EXCHANGE_MIME ? "{invalid}" : "",
      },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent;
    await act(async () =>
      expect(await h.app.mindmap.clipboard.paste(bad)).toBe(true),
    );
    expect(JSON.stringify(h.elements)).toBe(before);
    expect(h.state.errorMessage).toContain("脑图剪贴板内容无效");
  });
  it("keeps underline and strikethrough together in selected rich text and commits color in the same edit", async () => {
    const { current } = await setup();
    const id = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", {
      name: "编辑脑图主题",
    }) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 2);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole("button", { name: "选区下划线" }));
    fireEvent.click(screen.getByRole("button", { name: "选区删除线" }));
    fireEvent.change(
      screen.getByLabelText("选区文字颜色", { selector: "input" }),
      { target: { value: "#16a34a" } },
    );
    expect(current().nodes[id].labelStyleRanges).toBeUndefined();
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(current().nodes[id].labelStyleRanges).toContainEqual(
      expect.objectContaining({
        start: 0,
        end: 2,
        underline: true,
        strikethrough: true,
        color: "#16a34a",
      }),
    );
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("keeps outline pending creation and first edit in one transaction and cancels the next Tab draft", async () => {
    const { current } = await setup();
    const parent = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.notify({ workspacePanel: "outline" }));
    const input = screen.getAllByRole("textbox", {
      name: "大纲主题 分支主题",
    })[0];
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "Tab" });
    const created = h.app.mindmap.node!.id;
    expect(current().nodes[created]).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(0);
    const focused = document.activeElement as HTMLTextAreaElement;
    expect(focused.getAttribute("aria-label")).toBe("大纲主题 分支主题");
    fireEvent.change(focused, { target: { value: "连续录入的节点" } });
    fireEvent.keyDown(focused, { key: "Tab" });
    expect(current().nodes[created]).toMatchObject({
      label: "连续录入的节点",
      parentId: parent,
    });
    expect(API.getUndoStack()).toHaveLength(1);
    const pending = h.app.mindmap.node!.id;
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(current().nodes[pending]).toBeUndefined();
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(current().nodes[created]).toBeUndefined();
  });
  it("previews outline insertion and cancelling a drag never saves the structure", async () => {
    const { current } = await setup();
    act(() => h.app.mindmap.notify({ workspacePanel: "outline" }));
    const before = current();
    const rows = screen.getAllByRole("treeitem");
    const source = rows[1],
      target = rows[3];
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 80,
      left: 0,
      top: 80,
      right: 200,
      bottom: 112,
      width: 200,
      height: 32,
      toJSON() {
        return {};
      },
    });
    const dataTransfer = { setData: vi.fn(), dropEffect: "move" };
    fireEvent.dragStart(source, { dataTransfer });
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    Object.assign(dragOver, { dataTransfer, clientX: 50, clientY: 111 });
    fireEvent(target, dragOver);
    expect(target).toHaveClass("is-drop-after");
    expect(h.app.mindmap.getSnapshot().preview).toBeTruthy();
    expect(current().order).toEqual(before.order);
    expect(API.getUndoStack()).toHaveLength(0);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.app.mindmap.getSnapshot().preview).toBeNull();
    expect(current().order).toEqual(before.order);
    fireEvent.dragStart(source, { dataTransfer });
    const dragOverAgain = new Event("dragover", {
      bubbles: true,
      cancelable: true,
    });
    Object.assign(dragOverAgain, { dataTransfer, clientX: 50, clientY: 111 });
    fireEvent(target, dragOverAgain);
    fireEvent.drop(target, { dataTransfer, clientX: 50, clientY: 111 });
    expect(current().order.indexOf(before.order[1])).toBeGreaterThan(
      current().order.indexOf(before.order[3]),
    );
    expect(API.getUndoStack()).toHaveLength(1);
    Keyboard.undo();
    expect(current().order).toEqual(before.order);
  });
  it("toggles inherited root bold off and restores it through draft undo", async () => {
    const { tree, current } = await setup();
    act(() => {
      h.app.mindmap.select(tree.id, current().rootId);
      h.app.mindmap.startEditing();
    });
    const editor = screen.getByRole("textbox", { name: "编辑脑图主题" });
    const bold = screen.getByRole("button", { name: "选区粗体" });
    expect(bold).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "false");
    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect(bold).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(bold);
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(current().nodes[current().rootId].labelStyleRanges).toContainEqual(
      expect.objectContaining({ bold: false }),
    );
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("inherits the new caret position instead of spreading the last selected format", async () => {
    const { current } = await setup();
    const id = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", {
      name: "编辑脑图主题",
    }) as HTMLTextAreaElement;
    editor.setSelectionRange(0, 2);
    fireEvent.select(editor);
    fireEvent.click(screen.getByRole("button", { name: "选区粗体" }));
    fireEvent.change(
      screen.getByLabelText("选区文字颜色", { selector: "input" }),
      {
        target: { value: "#16a34a" },
      },
    );
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.select(editor);
    expect(screen.getByRole("button", { name: "选区粗体" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.change(editor, { target: { value: `${editor.value}甲` } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(current().nodes[id].labelStyleRanges).toEqual([
      expect.objectContaining({
        start: 0,
        end: 2,
        bold: true,
        color: "#16a34a",
      }),
    ]);
    expect(API.getUndoStack()).toHaveLength(1);
  });
  it("undoes a caret-only format in the draft before accepting later input", async () => {
    const { current } = await setup();
    const id = h.app.mindmap.node!.id;
    act(() => h.app.mindmap.startEditing());
    const editor = screen.getByRole("textbox", {
      name: "编辑脑图主题",
    }) as HTMLTextAreaElement;
    editor.setSelectionRange(editor.value.length, editor.value.length);
    fireEvent.select(editor);
    const bold = screen.getByRole("button", { name: "选区粗体" });
    fireEvent.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
    expect(bold).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(editor, { target: { value: `${editor.value}甲` } });
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(current().nodes[id].labelStyleRanges ?? []).toEqual([]);
    expect(API.getUndoStack()).toHaveLength(1);
  });
});
