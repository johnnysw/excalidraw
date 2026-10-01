import React from "react";
import { vi } from "vitest";

import { KEYS } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw } from "../index";
import { actionZoomIn, actionZoomOut } from "../actions/actionCanvas";

import { Keyboard, Pointer } from "./helpers/ui";
import { API } from "./helpers/api";
import {
  act,
  fireEvent,
  render,
  mockBoundingClientRect,
  restoreOriginalGetBoundingClientRect,
  screen,
  unmountComponent,
  waitFor,
  within,
} from "./test-utils";

const { h } = window;

const renderCourseware = async (UIOptions: any = {}) => {
  const result = await render(
    <Excalidraw
      handleKeyboardGlobally
      UIOptions={{ toolbarLayout: "left", formFactor: "desktop", ...UIOptions }}
    />,
  );
  act(() => {
    h.app.refreshEditorInterface();
    h.app.refresh();
  });
  return result;
};

beforeEach(() => {
  unmountComponent();
  localStorage.clear();
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
  delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
  restoreOriginalGetBoundingClientRect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("courseware grouped toolbar", () => {
  it("renders the host action first and keeps its callback separate from tool activation", async () => {
    const onSave = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        renderToolbarStart={() => (
          <button aria-label="Save courseware" onClick={onSave}>
            Save
          </button>
        )}
      />,
    );
    const save = screen.getByRole("button", { name: "Save courseware" });
    const tools = document.querySelector(".Courseware-toolbar__tools");
    expect(tools?.firstElementChild).toBe(save);
    const setActiveTool = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(setActiveTool).not.toHaveBeenCalled();
    const lock = screen.getByTestId("toolbar-lock");
    lock.focus();
    fireEvent.keyDown(lock, { key: "Home" });
    expect(save).toHaveFocus();
  });

  it("renders each history and zoom action once on the right, with history before zoom", async () => {
    await renderCourseware();
    const footer = document.querySelector(".App-menu_bottom--courseware");
    const actions = footer?.querySelector(".Courseware-canvas-actions");
    const history = actions?.querySelector(".undo-redo-buttons");
    const navigation = actions?.querySelector(".Courseware-navigation-controls");
    const zoom = navigation?.querySelector(".zoom-actions");
    expect(footer?.querySelector(".layer-ui__wrapper__footer-left")).toBeNull();
    expect(actions?.parentElement).toHaveClass("layer-ui__wrapper__footer-right");
    expect(history?.nextElementSibling).toBe(navigation);
    expect(navigation?.lastElementChild).toBe(zoom);
    expect(navigation?.firstElementChild).toHaveClass("Courseware-selection-tools");
    expect(navigation?.children[1]).toHaveClass("Courseware-navigation-controls__separator");
    expect(screen.getAllByTestId("toolbar-group-selection")).toHaveLength(1);
    expect(screen.getAllByTestId("toolbar-hand")).toHaveLength(1);
    expect(navigation).toContainElement(screen.getByTestId("toolbar-group-selection"));
    expect(navigation).toContainElement(screen.getByTestId("toolbar-hand"));
    expect(document.querySelector(".Courseware-toolbar [data-testid='toolbar-group-selection']")).toBeNull();
    expect(document.querySelector(".Courseware-toolbar [data-testid='toolbar-hand']")).toBeNull();
    expect(actions?.nextElementSibling).toHaveClass("Courseware-footer__auxiliary");
    expect(footer?.querySelector(".Courseware-footer__auxiliary > .help-icon")).not.toBeNull();
    expect(footer?.querySelector("[data-testid='footer-presentation']")).toBeNull();
    expect(screen.getAllByTestId("button-undo")).toHaveLength(1);
    expect(screen.getAllByTestId("button-redo")).toHaveLength(1);
    expect(document.querySelectorAll(".zoom-in-button")).toHaveLength(1);
    expect(document.querySelectorAll(".zoom-out-button")).toHaveLength(1);
    expect(document.querySelectorAll(".reset-zoom-button")).toHaveLength(1);

    const zoomIn = vi.spyOn(actionZoomIn, "perform");
    const zoomOut = vi.spyOn(actionZoomOut, "perform");
    fireEvent.click(document.querySelector(".zoom-in-button")!);
    expect(zoomIn).toHaveBeenCalledTimes(1);
    expect(h.state.zoom.value).toBeGreaterThan(1);
    fireEvent.click(document.querySelector(".zoom-out-button")!);
    expect(zoomOut).toHaveBeenCalledTimes(1);
    expect(h.state.zoom.value).toBe(1);

    const rectangle = API.createElement({ type: "rectangle" });
    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    const undo = screen.getByTestId("button-undo");
    const redo = screen.getByTestId("button-redo");
    const undoHistory = vi.spyOn(h.history, "undo");
    const redoHistory = vi.spyOn(h.history, "redo");
    await waitFor(() => expect(undo).not.toBeDisabled());
    expect(redo).toBeDisabled();
    fireEvent.click(undo);
    expect(undoHistory).toHaveBeenCalledTimes(1);
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(0);
    expect(redo).not.toBeDisabled();
    fireEvent.click(redo);
    expect(redoHistory).toHaveBeenCalledTimes(1);
    expect(h.elements.filter((element) => !element.isDeleted)).toHaveLength(1);
    expect(redo).toBeDisabled();
  });

  it("keeps selection preference, API and shortcut highlights in the bottom controls", async () => {
    await renderCourseware();
    const selection = screen.getByTestId("toolbar-group-selection");
    const hand = screen.getByTestId("toolbar-hand");
    fireEvent.click(selection);
    fireEvent.click(await screen.findByTestId("toolbar-lasso"));
    expect(h.state.preferredSelectionTool).toEqual({ type: "lasso", initialized: true });
    expect(selection).toHaveAttribute("data-active-tool", "lasso");
    expect(selection).toHaveAttribute("aria-pressed", "true");

    act(() => h.app.setActiveTool({ type: "freedraw" }));
    expect(selection).toHaveAttribute("data-active-tool", "lasso");
    expect(selection).toHaveAttribute("aria-pressed", "false");
    act(() => h.app.setActiveTool({ type: "selection" }));
    expect(selection).toHaveAttribute("data-active-tool", "selection");
    expect(selection).toHaveAttribute("aria-pressed", "true");
    Keyboard.keyPress(KEYS["2"]);
    expect(hand).toBeChecked();
    expect(selection).toHaveAttribute("aria-pressed", "false");
    Keyboard.keyPress(KEYS.V);
    expect(h.state.activeTool.type).toBe(h.state.preferredSelectionTool.type);
    expect(selection).toHaveAttribute("aria-pressed", "true");
    expect(hand).not.toBeChecked();
  });

  it("shows the built-in tooltip for left toolbar controls", async () => {
    await renderCourseware();
    const shape = screen.getByTestId("toolbar-group-shape");
    fireEvent.pointerEnter(shape);
    expect(document.querySelector(".excalidraw-tooltip")).toHaveClass(
      "excalidraw-tooltip--visible",
    );
    fireEvent.pointerLeave(shape);
    expect(document.querySelector(".excalidraw-tooltip")).not.toHaveClass(
      "excalidraw-tooltip--visible",
    );
  });

  it("activates the first available selection tool when opening from another tool", async () => {
    await renderCourseware();
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    fireEvent.click(screen.getByTestId("toolbar-group-selection"));
    expect(h.state.activeTool.type).toBe("selection");
    expect(h.state.preferredSelectionTool).toEqual({
      type: "selection",
      initialized: true,
    });
  });

  it("runs the existing hand toggle once and keeps temporary Space panning", async () => {
    await renderCourseware();
    const toggle = vi.spyOn(h.app, "onHandToolToggle");
    const action = vi.spyOn(h.app.actionManager, "executeAction");
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    fireEvent.click(screen.getByTestId("toolbar-hand"));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool.type).toBe("hand");
    Keyboard.keyPress(KEYS.V);
    const previousTool = h.state.activeTool.type;
    const { scrollX, scrollY } = h.state;
    const mouse = new Pointer("mouse");
    Keyboard.keyDown(KEYS.SPACE);
    mouse.down(50, 50);
    mouse.up(60, 60);
    Keyboard.keyUp(KEYS.SPACE);
    expect(h.state.scrollX).not.toBe(scrollX);
    expect(h.state.scrollY).not.toBe(scrollY);
    expect(h.state.activeTool.type).toBe(previousTool);
  });

  it.each([
    { selection: false, lasso: true, hand: false },
    { selection: false, lasso: false, hand: true },
    { selection: false, lasso: false, hand: false },
  ])("filters bottom controls by their tool permissions %j", async (tools) => {
    await renderCourseware({ tools });
    expect(!!screen.queryByTestId("toolbar-group-selection")).toBe(tools.selection || tools.lasso);
    expect(!!screen.queryByTestId("toolbar-hand")).toBe(tools.hand);
    expect(!!document.querySelector(".Courseware-navigation-controls__separator"))
      .toBe(tools.selection || tools.lasso || tools.hand);
    if (tools.lasso) {
      fireEvent.click(screen.getByTestId("toolbar-group-selection"));
      expect(screen.queryByTestId("toolbar-selection")).toBeNull();
      const setActiveTool = vi.spyOn(h.app, "setActiveTool");
      fireEvent.click(await screen.findByTestId("toolbar-lasso"));
      expect(setActiveTool).toHaveBeenCalledTimes(1);
      expect(h.state.activeTool.type).toBe("lasso");
    }
  });

  it("opens selection above the footer and closes with focus restored", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("toolbar-group-selection");
    fireEvent.click(trigger);
    const selection = await screen.findByTestId("toolbar-selection");
    const lasso = screen.getByTestId("toolbar-lasso");
    const menu = selection.closest(".Courseware-selection-tools__popover");
    expect(menu).toHaveAttribute("data-side", "top");
    expect(menu?.closest(".App-menu_bottom--courseware")).toBeNull();
    await waitFor(() => expect(selection).toHaveFocus());
    fireEvent.keyDown(selection, { key: "ArrowRight" });
    expect(lasso).toHaveFocus();
    fireEvent.keyDown(lasso, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("toolbar-lasso")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    await screen.findByTestId("toolbar-lasso");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByTestId("toolbar-lasso")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it.each(["shape", "more", "presentation"] as const)(
    "keeps bottom selection mutually exclusive with the rail %s menu",
    async (menu) => {
      await renderCourseware();
      if (menu === "presentation") {
        API.setElements([API.createElement({ type: "frame" })]);
      }
      const selection = screen.getByTestId("toolbar-group-selection");
      const railTrigger = screen.getByTestId(
        menu === "shape" ? "toolbar-group-shape" : menu === "more" ? "toolbar-extra-tools-trigger" : "toolbar-presentation",
      );
      fireEvent.click(selection);
      await screen.findByTestId("toolbar-lasso");
      const selectionFocus = vi.spyOn(selection, "focus");
      // A real click first dismisses the old Radix layer on pointerdown, then
      // opens the target trigger. Its delayed focus restoration must not close it.
      fireEvent.pointerDown(railTrigger, { pointerType: "mouse", button: 0 });
      fireEvent.mouseDown(railTrigger, { button: 0 });
      railTrigger.focus();
      fireEvent.pointerUp(railTrigger, { pointerType: "mouse", button: 0 });
      fireEvent.mouseUp(railTrigger, { button: 0 });
      fireEvent.click(railTrigger);
      await screen.findByTestId(menu === "shape" ? "toolbar-rectangle" : menu === "more" ? "dropdown-menu" : "presentation-viewer");
      // Radix restores close focus after unmount; let that lifecycle finish
      // before asserting the target menu stayed open after a single click.
      await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      expect(screen.queryByTestId("toolbar-lasso")).toBeNull();
      expect(selectionFocus).not.toHaveBeenCalled();
      expect(railTrigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.pointerDown(selection, { pointerType: "mouse", button: 0 });
      fireEvent.mouseDown(selection, { button: 0 });
      selection.focus();
      fireEvent.pointerUp(selection, { pointerType: "mouse", button: 0 });
      fireEvent.mouseUp(selection, { button: 0 });
      fireEvent.click(selection);
      await screen.findByTestId("toolbar-lasso");
      expect(railTrigger).toHaveAttribute("aria-expanded", "false");
      expect(h.state.openPopup).toBe("coursewareSelection");
    },
  );

  it("places presentation between separators directly after the save action", async () => {
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        renderToolbarStart={() => <button>Save courseware</button>}
      />,
    );
    const save = screen.getByRole("button", { name: "Save courseware" });
    const presentation = screen.getByTestId("toolbar-presentation");
    const menuContainer = presentation.parentElement!;
    expect(save.nextElementSibling).toHaveClass("Courseware-toolbar__separator");
    expect(save.nextElementSibling?.nextElementSibling).toBe(menuContainer);
    expect(menuContainer.nextElementSibling).toHaveClass("Courseware-toolbar__separator");
    expect(menuContainer.nextElementSibling?.nextElementSibling)
      .toContainElement(screen.getByTestId("toolbar-lock"));
    expect(screen.getAllByTestId("toolbar-presentation")).toHaveLength(1);
    expect(screen.queryByTestId("footer-presentation")).toBeNull();
  });

  it("does not add an empty save section and disables presentation without playable frames", async () => {
    await renderCourseware();
    const presentation = screen.getByTestId("toolbar-presentation");
    const tools = document.querySelector(".Courseware-toolbar__tools");
    expect(tools?.firstElementChild).toBe(presentation.parentElement);
    expect(presentation).toBeDisabled();
    fireEvent.click(presentation);
    expect(screen.queryByTestId("presentation-viewer")).toBeNull();
    expect(h.state.presentationMode).toBe(false);
  });

  it.each(["viewer", "presenter"] as const)(
    "starts the %s view once using the shared presentation command",
    async (mode) => {
      await renderCourseware();
      const frame = API.createElement({ type: "frame", id: "presentation-frame" });
      API.setElements([frame]);
      const events: string[] = [];
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        configurable: true,
        value: vi.fn(() => {
          events.push("fullscreen");
          return Promise.resolve();
        }),
      });
      const container = h.app.excalidrawContainerRef.current!;
      const openPresenter = vi.fn((event: Event) => {
        expect((event as CustomEvent).detail.frameId).toBe(frame.id);
        events.push("open");
      });
      const startPresentation = vi.fn((event: Event) => {
        expect((event as CustomEvent).detail).toEqual({ mode, frameId: frame.id });
        events.push("start");
      });
      container.addEventListener("excalidraw:openPresenter", openPresenter);
      container.addEventListener("excalidraw:startPresentation", startPresentation);
      fireEvent.click(screen.getByTestId("toolbar-presentation"));
      const option = await screen.findByTestId(`presentation-${mode}`);
      expect(option.closest(".Courseware-toolbar__tools")).toBeNull();
      expect(option.closest(".excalidraw")).toBe(container);
      fireEvent.click(option);
      expect(startPresentation).toHaveBeenCalledTimes(1);
      expect(openPresenter).toHaveBeenCalledTimes(mode === "presenter" ? 1 : 0);
      expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(events).toEqual(
        mode === "presenter" ? ["open", "fullscreen", "start"] : ["fullscreen", "start"],
      );
      expect(h.state.presentationMode).toBe(true);
      expect(screen.queryByTestId("presentation-viewer")).toBeNull();
      container.removeEventListener("excalidraw:openPresenter", openPresenter);
      container.removeEventListener("excalidraw:startPresentation", startPresentation);
    },
  );

  it.each([
    { role: "member", allowedViews: undefined, visible: true, viewers: ["viewer"] },
    { role: "teacher", allowedViews: ["presenter"], visible: true, viewers: ["presenter"] },
    { role: "teacher", allowedViews: undefined, visible: false, viewers: [] },
  ] as const)(
    "honors presentation permissions for $role/visible=$visible",
    async ({ role, allowedViews, visible, viewers }) => {
      await render(
        <Excalidraw
          role={role}
          UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
          shareModePermissions={{
            footer: { presentation: { visible, allowedViews: allowedViews && [...allowedViews] } },
          }}
          initialData={{ elements: [API.createElement({ type: "frame" })] }}
        />,
      );
      if (!visible) {
        expect(screen.queryByTestId("toolbar-presentation")).toBeNull();
        expect(document.querySelector(".Courseware-toolbar__tools")?.firstElementChild)
          .toContainElement(screen.getByTestId("toolbar-lock"));
        return;
      }
      fireEvent.click(screen.getByTestId("toolbar-presentation"));
      await screen.findByTestId(`presentation-${viewers[0]}`);
      const expectedModes: readonly string[] = viewers;
      for (const mode of ["viewer", "presenter"]) {
        expect(!!screen.queryByTestId(`presentation-${mode}`)).toBe(expectedModes.includes(mode));
      }
    },
  );

  it("closes the presentation menu on Escape, outside clicks, scrolling and another tool menu", async () => {
    await renderCourseware();
    API.setElements([API.createElement({ type: "frame" })]);
    const trigger = screen.getByTestId("toolbar-presentation");
    fireEvent.click(trigger);
    const option = await screen.findByTestId("presentation-viewer");
    await waitFor(() => expect(option).toHaveFocus());
    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("presentation-viewer")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await screen.findByTestId("presentation-viewer");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByTestId("presentation-viewer")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await screen.findByTestId("presentation-viewer");
    const tools = document.querySelector<HTMLDivElement>(".Courseware-toolbar__tools")!;
    tools.scrollTop += 40;
    fireEvent.scroll(tools);
    await waitFor(() => expect(screen.queryByTestId("presentation-viewer")).toBeNull());

    fireEvent.click(trigger);
    await screen.findByTestId("presentation-viewer");
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    const rectangle = await screen.findByTestId("toolbar-rectangle");
    await waitFor(() => expect(rectangle).toHaveFocus());
    expect(screen.queryByTestId("presentation-viewer")).toBeNull();
    fireEvent.click(screen.getByTestId("toolbar-presentation"));
    await screen.findByTestId("presentation-viewer");
    expect(screen.queryByTestId("toolbar-rectangle")).toBeNull();
  });

  it.each([
    { toolbarLayout: "top", formFactor: "desktop", viewModeEnabled: false },
    { toolbarLayout: "left", formFactor: "phone", viewModeEnabled: false },
    { toolbarLayout: "left", formFactor: "desktop", viewModeEnabled: true },
  ] as const)(
    "keeps the existing action layout for $toolbarLayout/$formFactor/view=$viewModeEnabled",
    async ({ viewModeEnabled, ...UIOptions }) => {
      const renderToolbarStart = vi.fn(() => <button>Host action</button>);
      await render(
        <Excalidraw
          UIOptions={UIOptions}
          viewModeEnabled={viewModeEnabled}
          renderToolbarStart={renderToolbarStart}
        />,
      );
      act(() => {
        h.app.refreshEditorInterface();
        h.app.refresh();
      });
      expect(document.querySelector(".App-menu_bottom--courseware")).toBeNull();
      expect(document.querySelector(".Courseware-canvas-actions")).toBeNull();
      expect(screen.queryByRole("button", { name: "Host action" })).toBeNull();
      expect(screen.queryByTestId("toolbar-presentation")).toBeNull();
      if (UIOptions.formFactor === "desktop") {
        expect(document.querySelector(".layer-ui__wrapper__footer-left")).not.toBeNull();
        if (!viewModeEnabled) {
          expect(screen.getAllByTestId("footer-presentation")).toHaveLength(1);
        }
      }
    },
  );

  it.each([
    ["selection", "toolbar-lasso", "lasso"],
    ["eraser", "toolbar-eraser-box", "eraser"],
    ["text", "toolbar-richText", "richText"],
    ["shape", "toolbar-diamond", "diamond"],
    ["line", "toolbar-line", "line"],
  ])(
    "opens %s without switching tools and activates its child once",
    async (group, optionId, tool) => {
      await renderCourseware();
      const previousTool = h.state.activeTool.type;
      const setActiveTool = vi.spyOn(h.app, "setActiveTool");
      const trigger = screen.getByTestId(`toolbar-group-${group}`);

      fireEvent.click(trigger);

      expect(h.state.activeTool.type).toBe(previousTool);
      expect(setActiveTool).not.toHaveBeenCalled();
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const option = await screen.findByTestId(optionId);
      expect(option.closest(".Courseware-toolbar__tools")).toBeNull();
      expect(option.closest(".excalidraw")).not.toBeNull();
      fireEvent.click(option);

      expect(setActiveTool).toHaveBeenCalledTimes(1);
      expect(setActiveTool).toHaveBeenCalledWith({ type: tool });
      expect(h.state.activeTool.type).toBe(tool);
      expect(trigger).toHaveAttribute("aria-pressed", "true");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      if (group === "selection") {
        expect(h.state.preferredSelectionTool).toEqual({
          type: "lasso",
          initialized: true,
        });
      }
      if (group === "eraser") {
        expect(h.state.preferredEraserMode).toBe("box");
      }
    },
  );

  it("tracks shortcuts and imperative changes, then remembers the last child", async () => {
    await renderCourseware();
    const shape = screen.getByTestId("toolbar-group-shape");

    Keyboard.keyPress(KEYS.D);
    expect(h.state.activeTool.type).toBe("diamond");
    expect(shape).toHaveAttribute("data-active-tool", "diamond");
    expect(shape).toHaveAttribute("aria-pressed", "true");
    act(() => h.app.setActiveTool({ type: "ellipse" }));
    expect(shape).toHaveAttribute("data-active-tool", "ellipse");
    Keyboard.keyPress(KEYS.V);
    expect(shape).toHaveAttribute("data-active-tool", "ellipse");
    expect(shape).toHaveAttribute("aria-pressed", "false");

    Keyboard.keyPress(KEYS.A);
    const arrowType = h.state.currentItemArrowType;
    Keyboard.keyPress(KEYS.A);
    expect(h.state.currentItemArrowType).not.toBe(arrowType);
    expect(screen.getByTestId("toolbar-group-line")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the tool lock when choosing a grouped tool", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-lock"));
    expect(h.state.activeTool.locked).toBe(true);
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    fireEvent.click(await screen.findByTestId("toolbar-rectangle"));
    expect(h.state.activeTool.type).toBe("rectangle");
    expect(h.state.activeTool.locked).toBe(true);
  });

  it("dismisses on Escape with focus restored and on scrolling", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(trigger);
    await screen.findByTestId("toolbar-rectangle");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await screen.findByTestId("toolbar-rectangle");
    const tools = document.querySelector<HTMLDivElement>(
      ".Courseware-toolbar__tools",
    )!;
    tools.scrollTop += 40;
    fireEvent.scroll(tools);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it.each(["shape", "more"] as const)(
    "ignores a late scroll event for %s when the rail has not moved since opening",
    async (group) => {
      await renderCourseware();
      const tools = document.querySelector<HTMLDivElement>(
        ".Courseware-toolbar__tools",
      )!;
      tools.scrollTop = 80;
      const trigger = screen.getByTestId(
        group === "more"
          ? "toolbar-extra-tools-trigger"
          : "toolbar-group-shape",
      );
      fireEvent.click(trigger);
      await screen.findByTestId(
        group === "more" ? "dropdown-menu" : "toolbar-rectangle",
      );
      fireEvent.scroll(tools);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      tools.scrollTop = 120;
      fireEvent.scroll(tools);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("moves focus through the vertical toolbar without changing the tool", async () => {
    await renderCourseware();
    const lock = screen.getByTestId("toolbar-lock");
    const freedraw = screen.getByTestId("toolbar-freedraw");
    const more = within(screen.getByRole("toolbar")).getByRole("button", {
      name: "More tools",
    });
    const setActiveTool = vi.spyOn(h.app, "setActiveTool");
    lock.focus();
    fireEvent.keyDown(lock, { key: "ArrowDown" });
    expect(freedraw).toHaveFocus();
    fireEvent.keyDown(freedraw, { key: "End" });
    expect(more).toHaveFocus();
    fireEvent.keyDown(more, { key: "Home" });
    expect(lock).toHaveFocus();
    fireEvent.keyDown(lock, { key: "ArrowUp" });
    expect(more).toHaveFocus();
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it("dismisses an outside click and returns focus to its trigger", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("toolbar-group-line");
    fireEvent.click(trigger);
    const option = await screen.findByTestId("toolbar-arrow");
    await waitFor(() => expect(option).toHaveFocus());
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps grouped menus mutually exclusive with the canvas main menu", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    await screen.findByTestId("toolbar-rectangle");
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    expect(h.state.openMenu).toBe("canvas");
    await waitFor(() =>
      expect(document.querySelector(".Courseware-toolbar__popover")).toBeNull(),
    );
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    expect(h.state.openMenu).toBeNull();
    await screen.findByTestId("toolbar-rectangle");
  });

  it("moves from More to a group without old menu focus closing the new palette", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-extra-tools-trigger"));
    const moreMenu = await screen.findByTestId("dropdown-menu");
    await waitFor(() =>
      expect(moreMenu.contains(document.activeElement)).toBe(true),
    );
    const group = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(group);
    const child = await screen.findByTestId("toolbar-rectangle");
    await waitFor(() => expect(child).toHaveFocus());
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
  });

  it("keeps the current tool when Escape dismisses a grouped palette", async () => {
    await renderCourseware();
    act(() => h.app.setActiveTool({ type: "diamond" }));
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    const option = await screen.findByTestId("toolbar-rectangle");
    await waitFor(() => expect(option).toHaveFocus());
    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.state.activeTool.type).toBe("diamond");
  });

  it("filters disabled tools while retaining the single-child group interaction", async () => {
    await renderCourseware({
      tools: {
        rectangle: false,
        diamond: false,
        arrow: false,
        line: false,
        image: false,
      },
    });
    expect(screen.getByTestId("toolbar-group-shape")).toBeInTheDocument();
    expect(screen.queryByTestId("toolbar-group-line")).toBeNull();
    expect(screen.queryByTestId("toolbar-image")).toBeNull();
    const setActiveTool = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    expect(setActiveTool).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId("toolbar-ellipse"));
    expect(setActiveTool).toHaveBeenCalledTimes(1);
    expect(setActiveTool).toHaveBeenCalledWith({ type: "ellipse" });
    expect(h.state.activeTool.type).toBe("ellipse");
  });

  it("reuses image initialization rather than bypassing setActiveTool", async () => {
    await renderCourseware();
    const imageInitialization = vi
      .spyOn(h.app as any, "onImageToolbarButtonClick")
      .mockResolvedValue(undefined);
    fireEvent.click(screen.getByTestId("toolbar-image"));
    expect(imageInitialization).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool.type).toBe("image");
  });

  it("keeps shared extra actions and closes a group when opening More", async () => {
    const onExtraSelect = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        extraToolsMenuItems={[
          { id: "recording", label: "Recording", onSelect: onExtraSelect },
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("toolbar-group-text"));
    await screen.findByTestId("toolbar-richText");
    fireEvent.click(
      within(screen.getByRole("toolbar")).getByRole("button", {
        name: "More tools",
      }),
    );
    await waitFor(() =>
      expect(document.querySelector(".Courseware-toolbar__popover")).toBeNull(),
    );
    const item = await screen.findByTestId("toolbar-extra-recording");
    expect(item.closest(".Courseware-toolbar__tools")).toBeNull();
    fireEvent.keyDown(item, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("toolbar-extra-recording")).toBeNull(),
    );
    const more = within(screen.getByRole("toolbar")).getByRole("button", {
      name: "More tools",
    });
    await waitFor(() => expect(more).toHaveFocus());
    fireEvent.click(more);
    fireEvent.click(await screen.findByTestId("toolbar-extra-recording"));
    expect(onExtraSelect).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByTestId("toolbar-extra-recording")).toBeNull(),
    );
  });

  it("uses the phone breakpoint only for automatic left layout and restores the rail at a wide size", async () => {
    mockBoundingClientRect({ width: 390, height: 844 });
    await render(<Excalidraw UIOptions={{ toolbarLayout: "left" }} />);
    act(() => {
      h.app.refreshEditorInterface();
      h.app.refresh();
    });
    expect(h.app.editorInterface.formFactor).toBe("phone");
    expect(document.querySelector(".Courseware-toolbar")).toBeNull();
    expect(document.querySelector(".App-bottom-bar")).not.toBeNull();

    mockBoundingClientRect({ width: 1280, height: 800 });
    act(() => {
      h.app.refreshEditorInterface();
      h.app.refresh();
    });
    expect(h.app.editorInterface.formFactor).toBe("desktop");
    expect(document.querySelector(".Courseware-toolbar")).not.toBeNull();
    expect(document.querySelector(".App-bottom-bar")).toBeNull();

    unmountComponent();
    mockBoundingClientRect({ width: 390, height: 844 });
    await render(<Excalidraw UIOptions={{ toolbarLayout: "top" }} />);
    act(() => {
      h.app.refreshEditorInterface();
      h.app.refresh();
    });
    expect(h.app.editorInterface.formFactor).toBe("desktop");
    expect(document.querySelector(".App-bottom-bar")).toBeNull();
    expect(document.querySelector(".Courseware-toolbar")).toBeNull();
    expect(document.querySelector(".App-toolbar-container")).not.toBeNull();

    unmountComponent();
    await renderCourseware({ formFactor: "desktop" });
    expect(h.app.editorInterface.formFactor).toBe("desktop");
    expect(document.querySelector(".Courseware-toolbar")).not.toBeNull();
  });

  it.each(["top", "left"] as const)(
    "retains the phone toolbar for layout %s",
    async (toolbarLayout) => {
      await renderCourseware({ formFactor: "phone", toolbarLayout });
      expect(document.querySelector(".Courseware-toolbar")).toBeNull();
      expect(document.querySelector(".App-bottom-bar")).not.toBeNull();
      expect(screen.getByTestId("toolbar-freedraw")).toBeInTheDocument();
    },
  );
});
