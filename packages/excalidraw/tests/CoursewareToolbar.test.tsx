import React from "react";
import { vi } from "vitest";
import * as Popover from "@radix-ui/react-popover";

import type { ExcalidrawProps } from "../types";

import { KEYS } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";

import { Excalidraw, MainMenu, TTDDialogTrigger } from "../index";
import { actionZoomIn, actionZoomOut } from "../actions/actionCanvas";
import { hideTooltip } from "../components/Tooltip";
import { t } from "../i18n";
import { COURSEWARE_SHAPE_PRESETS } from "../coursewareShapes";
import {
  COURSEWARE_EMOJI_CUSTOM_TYPE,
  COURSEWARE_DEFAULT_EMOJI,
  COURSEWARE_STICKY_CUSTOM_TYPE,
} from "../coursewareInsertTools";

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

// Exercise the host/fork contract without coupling the drawing package to a
// specific emoji library. The teaching host supplies the shared whiteboard UI.
const renderTestEmojiPicker: NonNullable<ExcalidrawProps["renderEmojiPicker"]> = ({
  open, onOpenChange, onEmojiSelect, triggerClassName, selectedEmoji, onDefaultEmojiSelect,
}) => (
  <Popover.Root open={open} onOpenChange={onOpenChange}>
    <Popover.Trigger className={triggerClassName} aria-label="表情" data-testid="toolbar-emoji">表情</Popover.Trigger>
    <Popover.Portal>
      <Popover.Content aria-label="选择表情" data-tooltip-obstacle onEscapeKeyDown={(event) => event.stopPropagation()}>
        <TestEmojiOptions selectedEmoji={selectedEmoji} onEmojiSelect={onEmojiSelect} onDefaultEmojiSelect={onDefaultEmojiSelect} />
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);

const TestEmojiOptions = ({ selectedEmoji, onEmojiSelect, onDefaultEmojiSelect }: Pick<
  Parameters<NonNullable<ExcalidrawProps["renderEmojiPicker"]>>[0],
  "selectedEmoji" | "onEmojiSelect" | "onDefaultEmojiSelect"
>) => {
  React.useEffect(() => {
    if (!selectedEmoji) { onDefaultEmojiSelect(COURSEWARE_DEFAULT_EMOJI); }
  }, [selectedEmoji, onDefaultEmojiSelect]);
  return <>{[COURSEWARE_DEFAULT_EMOJI, "👍", "✅", "🦄"].map((emoji) => (
    <button key={emoji} type="button" aria-label={`表情 ${emoji}`} aria-pressed={selectedEmoji === emoji} onClick={() => onEmojiSelect(emoji)}>{emoji}</button>
  ))}</>;
};

const renderCourseware = async (UIOptions: any = {}) => {
  const result = await render(
    <Excalidraw
      handleKeyboardGlobally
      renderEmojiPicker={renderTestEmojiPicker}
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
  hideTooltip({ immediate: true });
  delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
  restoreOriginalGetBoundingClientRect();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("courseware grouped toolbar", () => {
  it("selects common shapes once and remembers their icon after leaving the group", async () => {
    await renderCourseware();
    const group = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(group);
    const menu = (await screen.findByTestId("toolbar-rectangle")).closest(".Courseware-toolbar__popover")!;
    expect(menu).toHaveClass("Courseware-toolbar__popover--shapes");
    expect(within(menu as HTMLElement).getAllByRole("button")).toHaveLength(25);
    expect(within(menu as HTMLElement).getAllByRole("button").map((button) => button.dataset.testid)).toEqual([
      "toolbar-rounded-rectangle", "toolbar-ellipse", "toolbar-diamond", "toolbar-rectangle", "toolbar-circle",
      "toolbar-cylinder", "toolbar-chevron", "toolbar-process-pentagon", "toolbar-parallelogram", "toolbar-trapezoid",
      "toolbar-speech-bubble", "toolbar-speech-bubble-square", "toolbar-right-triangle", "toolbar-triangle", "toolbar-star",
      "toolbar-hexagon", "toolbar-pentagon", "toolbar-octagon", "toolbar-left-arrow", "toolbar-right-arrow",
      "toolbar-double-arrow", "toolbar-cloud", "toolbar-cross", "toolbar-brace", "toolbar-brace-right",
    ]);
    expect(screen.queryByTestId("toolbar-document")).toBeNull();
    expect(screen.queryByTestId("toolbar-cube")).toBeNull();
    for (const preset of COURSEWARE_SHAPE_PRESETS) {
      expect(screen.getByTestId(`toolbar-${preset.id}`)).toHaveAccessibleName(preset.label);
    }
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(screen.getByTestId("toolbar-star"));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool).toMatchObject({ type: "custom", customType: "courseware-shape:star" });
    expect(group).toHaveAttribute("data-active-tool", "star");
    expect(group).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("toolbar-group-line")).toHaveAttribute("aria-pressed", "false");
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    expect(group).toHaveAttribute("data-active-tool", "star");
    expect(group).toHaveAttribute("aria-pressed", "false");
    act(() => h.app.setActiveTool({ type: "custom", customType: "courseware-shape:hexagon" }));
    expect(group).toHaveAttribute("data-active-tool", "hexagon");
    fireEvent.click(group);
    expect(h.state.activeTool).toMatchObject({ type: "custom", customType: "courseware-shape:hexagon" });
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTestId("toolbar-hexagon")).toHaveAttribute("aria-pressed", "true");
  });

  it("filters polygon presets with the line permission", async () => {
    await renderCourseware({ tools: { line: false } });
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    await screen.findByTestId("toolbar-rectangle");
    for (const preset of COURSEWARE_SHAPE_PRESETS) {
      expect(screen.queryByTestId(`toolbar-${preset.id}`)).toBeNull();
    }
    expect(screen.getByTestId("toolbar-ellipse")).toBeInTheDocument();
  });

  it("opens the sticky and emoji palettes and activates the selected insert tool", async () => {
    await renderCourseware();

    fireEvent.click(screen.getByTestId("toolbar-sticky"));
    expect(screen.getByRole("button", { name: "便签颜色 #d9f3fd" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "便签颜色 #d9f3fd" }));
    expect(h.state.coursewareStickyColor).toBe("#d9f3fd");
    expect(h.state.activeTool).toMatchObject({
      type: "custom",
      customType: COURSEWARE_STICKY_CUSTOM_TYPE,
    });

    fireEvent.click(screen.getByTestId("toolbar-emoji"));
    fireEvent.click(screen.getByRole("button", { name: "表情 👍" }));
    expect(h.state.coursewareEmoji).toBe("👍");
    expect(h.state.activeTool).toMatchObject({
      type: "custom",
      customType: COURSEWARE_EMOJI_CUSTOM_TYPE,
    });
  });

  it("uses the injected emoji picker and accepts emoji beyond the old small palette", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-emoji"));
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(screen.getByRole("button", { name: "表情 🦄" }));
    expect(h.state.coursewareEmoji).toBe("🦄");
    expect(activate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "选择表情" })).toBeNull();
  });

  it("closes insert menus when another palette, shortcut, or rail scrolling takes over", async () => {
    await renderCourseware();
    const emoji = screen.getByTestId("toolbar-emoji");
    fireEvent.click(emoji);
    expect(emoji).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    expect(emoji).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(emoji);
    expect(screen.queryByTestId("toolbar-rectangle")).toBeNull();
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    expect(emoji).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(emoji);
    const rail = emoji.closest(".Courseware-toolbar__tools")!;
    fireEvent.scroll(rail, { target: { scrollTop: 40 } });
    expect(emoji).toHaveAttribute("aria-expanded", "false");
  });

  it("does not create a limited emoji fallback when no picker is injected", async () => {
    await render(<Excalidraw UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }} />);
    act(() => { h.app.refreshEditorInterface(); h.app.refresh(); });
    expect(screen.queryByTestId("toolbar-emoji")).toBeNull();
  });

  it("places emoji and sticky elements as native serializable elements", async () => {
    await renderCourseware();
    const pointer = new Pointer("mouse");

    fireEvent.click(screen.getByTestId("toolbar-emoji"));
    fireEvent.click(screen.getByRole("button", { name: "表情 ✅" }));
    pointer.clickAt(120, 140);
    const emoji = h.app
      .scene
      .getNonDeletedElements()
      .find((element) => element.customData?.coursewareObjectType === "emoji");
    expect(emoji).toMatchObject({
      type: "text",
      text: "✅",
      customData: {
        coursewareObjectType: "emoji",
        coursewareEmoji: "✅",
      },
    });
    expect(h.state.activeTool.type).toBe("selection");

    fireEvent.click(screen.getByTestId("toolbar-sticky"));
    fireEvent.click(screen.getByRole("button", { name: "便签颜色 #fff7cc" }));
    pointer.clickAt(360, 180);
    const elements = h.app.scene.getNonDeletedElements();
    const sticky = elements.find(
      (element) => element.customData?.coursewareObjectType === "sticky",
    );
    const stickyText = elements.find(
      (element) => element.customData?.coursewareObjectType === "sticky-text",
    );
    expect(sticky).toMatchObject({
      type: "rectangle",
      width: 160,
      height: 160,
      backgroundColor: "#fff7cc",
    });
    expect(sticky?.boundElements).toEqual([
      { type: "text", id: stickyText?.id },
    ]);
    expect(stickyText).toMatchObject({
      type: "text",
      containerId: sticky?.id,
      width: 136,
      customData: {
        coursewareObjectType: "sticky-text",
        coursewareStickyId: sticky?.id,
      },
    });
    expect(h.state.activeTool.type).toBe("selection");
  });

  it("activates sticky placement with N on the desktop courseware toolbar", async () => {
    await renderCourseware();
    Keyboard.keyPress("n");
    expect(h.state.activeTool).toMatchObject({
      type: "custom",
      customType: COURSEWARE_STICKY_CUSTOM_TYPE,
    });
  });

  it("navigates the common shape grid by rows without activating a tool", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    const first = await screen.findByTestId("toolbar-rounded-rectangle");
    const menu = first.closest<HTMLElement>(".Courseware-toolbar__popover")!;
    menu.style.gridTemplateColumns = "32px 32px 32px 32px 32px";
    await waitFor(() => expect(first).toHaveFocus());
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(screen.getByTestId("toolbar-cylinder")).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(first).toHaveFocus();
    expect(activate).not.toHaveBeenCalled();
  });

  it("combines canvas commands and extension tools behind one toolbar entry", async () => {
    const frameSettings = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        aiEnabled={false}
        extraToolsMenuItems={[
          { id: "frame-settings", label: "Frame settings", onSelect: frameSettings },
        ]}
      />,
    );
    const trigger = screen.getByTestId("main-menu-trigger");
    expect(screen.getAllByTestId("main-menu-trigger")).toHaveLength(1);
    expect(trigger.closest(".Courseware-toolbar")).not.toBeNull();
    expect(document.querySelector(".App-menu_top [data-testid='main-menu-trigger']")).toBeNull();
    expect(screen.queryByTestId("dropdown-menu-button")).toBeNull();
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    expect(menu).toHaveClass("Courseware-toolbar__menu", "dropdown-menu--portal");
    expect(menu.closest(".Courseware-toolbar__tools")).toBeNull();
    expect(within(menu).getByTestId("load-button")).toBeInTheDocument();
    expect(within(menu).getByTestId("image-export-button")).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: t("labels.canvasBackground") })).toBeInTheDocument();
    expect(within(menu).getByTestId("toolbar-embeddable")).toBeInTheDocument();
    expect(within(menu).getByTestId("toolbar-mermaid")).toBeInTheDocument();
    expect(activate).not.toHaveBeenCalled();
    expect(frameSettings).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByTestId("toolbar-extra-frame-settings"));
    expect(frameSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("preserves custom MainMenu children and selection cancellation", async () => {
    const onMenuSelect = vi.fn((event: Event) => event.preventDefault());
    const onItemSelect = vi.fn();
    const onToolSelect = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        extraToolsMenuItems={[{ id: "custom-tool", label: "Custom tool", onSelect: onToolSelect }]}
      >
        <MainMenu onSelect={onMenuSelect}>
          <MainMenu.Item onSelect={onItemSelect}>Custom menu command</MainMenu.Item>
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>,
    );
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    const menu = await screen.findByTestId("dropdown-menu");
    expect(within(menu).queryByTestId("load-button")).toBeNull();
    fireEvent.click(within(menu).getByRole("button", { name: "Custom menu command" }));
    expect(onItemSelect).toHaveBeenCalledTimes(1);
    expect(onMenuSelect).toHaveBeenCalledTimes(1);
    expect(h.state.openMenu).toBe("canvas");
    fireEvent.click(within(menu).getByTestId("toolbar-extra-custom-tool"));
    expect(onToolSelect).toHaveBeenCalledTimes(1);
    expect(onMenuSelect).toHaveBeenCalledTimes(2);
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
  });

  it("lets the image export dialog retain focus when the unified menu closes", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("main-menu-trigger");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    const restoreTriggerFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(within(menu).getByTestId("image-export-button"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // Radix defers its close autofocus until unmount cleanup has finished.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(restoreTriggerFocus).not.toHaveBeenCalled();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(h.state.openDialog?.name).toBe("imageExport");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.state.openDialog).toBeNull();
  });

  it("focuses a help dialog without interactive children so Escape can dismiss it", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("main-menu-trigger");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    const restoreTriggerFocus = vi.spyOn(trigger, "focus");
    fireEvent.click(within(menu).getByTestId("help-menu-item"));
    const dialog = await screen.findByRole("dialog");
    const content = dialog.querySelector<HTMLElement>(".Modal__content");
    expect(content?.querySelector("button, a[href], input, select, textarea")).toBeNull();
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
    await waitFor(() => expect(content).toHaveFocus());
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(restoreTriggerFocus).not.toHaveBeenCalled();
    expect(content).toHaveFocus();
    fireEvent.keyDown(content!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.state.openDialog).toBeNull();
  });

  it("preserves cancellation from an individual custom menu command", async () => {
    const onMenuSelect = vi.fn();
    const onItemSelect = vi.fn((event: Event) => event.preventDefault());
    await render(
      <Excalidraw UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}>
        <MainMenu onSelect={onMenuSelect}>
          <MainMenu.Item onSelect={onItemSelect}>Keep menu open</MainMenu.Item>
        </MainMenu>
      </Excalidraw>,
    );
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    const menu = await screen.findByTestId("dropdown-menu");
    fireEvent.click(within(menu).getByRole("button", { name: "Keep menu open" }));
    expect(onItemSelect).toHaveBeenCalledTimes(1);
    expect(onMenuSelect).not.toHaveBeenCalled();
    expect(h.state.openMenu).toBe("canvas");
    expect(menu).toBeInTheDocument();
  });

  it("keeps the combined menu open while its canvas background picker is used", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    const menu = await screen.findByTestId("dropdown-menu");
    const color = within(menu).getByRole("button", { name: t("labels.canvasBackground") });
    fireEvent.click(color);
    const picker = document.querySelector(".advanced-color-picker-popover");
    expect(picker).toBeInTheDocument();
    expect(h.state.openMenu).toBe("canvas");
    expect(h.state.openPopup).toBe("canvasBackground");
    fireEvent.pointerDown(picker!);
    expect(menu).toBeInTheDocument();
    expect(picker).toBeInTheDocument();
    expect(h.state.openMenu).toBe("canvas");
  });

  it("keeps extension tools available when the original main menu is hidden", async () => {
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop", tools: { embeddable: false } }}
        shareModePermissions={{ mainMenu: { visible: false } }}
        aiEnabled={false}
        extraToolsMenuItems={[{ id: "frame-settings", label: "Frame settings", onSelect: vi.fn() }]}
      >
        <MainMenu><MainMenu.Item>Hidden custom command</MainMenu.Item></MainMenu>
      </Excalidraw>,
    );
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    const menu = await screen.findByTestId("dropdown-menu");
    expect(within(menu).queryByText("Hidden custom command")).toBeNull();
    expect(within(menu).queryByRole("button", { name: t("labels.canvasBackground") })).toBeNull();
    expect(within(menu).queryByTestId("toolbar-embeddable")).toBeNull();
    expect(within(menu).getByTestId("toolbar-mermaid")).toBeInTheDocument();
    expect(within(menu).getByTestId("toolbar-extra-frame-settings")).toBeInTheDocument();
  });

  it.each([
    { toolbarLayout: "top", formFactor: "desktop", viewModeEnabled: false, role: "teacher" },
    { toolbarLayout: "left", formFactor: "phone", viewModeEnabled: false, role: "teacher" },
    { toolbarLayout: "left", formFactor: "desktop", viewModeEnabled: true, role: "teacher" },
    { toolbarLayout: "top", formFactor: "desktop", viewModeEnabled: false, role: "member" },
  ] as const)("keeps the original main menu for $toolbarLayout/$formFactor/view=$viewModeEnabled/$role", async ({ role, viewModeEnabled, ...UIOptions }) => {
    await render(<Excalidraw role={role} viewModeEnabled={viewModeEnabled} UIOptions={UIOptions} />);
    act(() => {
      h.app.refreshEditorInterface();
      h.app.refresh();
    });
    const trigger = screen.getByTestId("main-menu-trigger");
    expect(trigger.closest(".Courseware-toolbar")).toBeNull();
    expect(trigger).not.toHaveClass("Courseware-toolbar__menu-trigger");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    expect(menu).not.toHaveClass("dropdown-menu--portal", "Courseware-toolbar__menu");
    expect(within(menu).queryByTestId("toolbar-embeddable")).toBeNull();
    expect(within(menu).queryByTestId("toolbar-mermaid")).toBeNull();
  });

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

  it("restores zoom and history to the left footer, with hand after zoom and presentation on the right", async () => {
    await renderCourseware();
    const footer = document.querySelector(".App-menu_bottom--courseware");
    const left = footer?.querySelector(".layer-ui__wrapper__footer-left");
    const actions = left?.querySelector("section");
    const navigation = actions?.querySelector(".Courseware-navigation-controls");
    const zoom = navigation?.querySelector(".zoom-actions");
    const history = actions?.querySelector(".undo-redo-buttons");
    expect(left).not.toBeNull();
    expect(navigation?.firstElementChild).toBe(zoom);
    expect(navigation?.lastElementChild).toContainElement(screen.getByTestId("toolbar-hand"));
    expect(navigation?.nextElementSibling).toBe(history);
    expect(screen.getAllByTestId("toolbar-group-selection")).toHaveLength(1);
    expect(screen.getAllByTestId("toolbar-hand")).toHaveLength(1);
    expect(document.querySelector(".Courseware-toolbar"))
      .toContainElement(screen.getByTestId("toolbar-group-selection"));
    expect(left).toContainElement(screen.getByTestId("toolbar-hand"));
    expect(left).not.toContainElement(screen.getByTestId("toolbar-group-selection"));
    const right = footer?.querySelector(".layer-ui__wrapper__footer-right");
    expect(right).toContainElement(screen.getByTestId("footer-presentation"));
    expect(right?.querySelector(".Courseware-footer__auxiliary")?.lastElementChild)
      .toHaveClass("help-icon");
    expect(document.querySelector(".Courseware-toolbar [data-testid='footer-presentation']")).toBeNull();
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

  it("keeps selection preference, API and shortcut highlights in the main toolbar", async () => {
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
    Keyboard.keyPress(KEYS.H);
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

  it("shows the built-in hand tooltip without a duplicate native title", async () => {
    await renderCourseware();
    const hand = screen.getByTestId("toolbar-hand");
    const label = hand.closest("label")!;
    const wrapper = label.closest(".excalidraw-tooltip-wrapper")!;
    expect(label).not.toHaveAttribute("title");
    expect(hand).toHaveAttribute("aria-label", `${t("toolBar.hand")} — ${KEYS.H}`);
    expect(hand).toHaveAttribute("aria-keyshortcuts", KEYS.H);
    expect(wrapper.closest(".Courseware-navigation-controls"))
      .toHaveClass("Courseware-navigation-controls--with-hand");
    fireEvent.pointerEnter(wrapper);
    const tooltip = document.querySelector(".excalidraw-tooltip")!;
    expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
    expect(tooltip.textContent).toBe(
      `${t("toolBar.hand")} — ${KEYS.H}`,
    );
    fireEvent.pointerLeave(wrapper);
    expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    fireEvent.pointerEnter(wrapper);
    fireEvent.click(hand);
    expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    expect(hand).toBeChecked();
  });

  it("shows only the three courseware numbers in tool menus and help", async () => {
    await renderCourseware();
    const selection = screen.getByTestId("toolbar-group-selection");
    fireEvent.click(selection);
    expect(screen.getByTestId("toolbar-selection")).toHaveAttribute("aria-keyshortcuts", `V ${t("helpDialog.or")} 1`);
    expect(screen.getByTestId("toolbar-lasso")).toHaveAttribute("aria-keyshortcuts", `V ${t("helpDialog.or")} 1`);
    fireEvent.click(screen.getByTestId("toolbar-group-writing"));
    expect(screen.getByTestId("toolbar-freedraw")).toHaveAttribute("aria-keyshortcuts", `P ${t("helpDialog.or")} 2`);
    fireEvent.click(screen.getByTestId("toolbar-group-text"));
    const text = screen.getByTestId("toolbar-text");
    expect(text).toHaveAttribute("aria-keyshortcuts", "T");
    expect(text.querySelector(".ToolIcon__keybinding")).toHaveTextContent("T");
    fireEvent.click(screen.getByTestId("toolbar-group-line"));
    expect(screen.getByTestId("toolbar-arrow")).toHaveAttribute("aria-keyshortcuts", "A");
    expect(screen.getByTestId("toolbar-line")).toHaveAttribute("aria-keyshortcuts", "L");
    act(() => h.app.setState({ openDialog: { name: "help" } }));
    await screen.findByRole("dialog");
    const rows = Array.from(document.querySelectorAll(".HelpDialog__island--tools .HelpDialog__shortcut"));
    const keys = (label: string) => Array.from(rows.find((row) => row.firstElementChild?.textContent === label)!.querySelectorAll("kbd")).map((key) => key.textContent);
    expect(keys(t("toolBar.selection"))).toEqual(["V", "1"]);
    expect(keys(t("toolBar.hand"))).toEqual(["H"]);
    expect(keys(t("toolBar.freedraw"))).toEqual(["P", "2"]);
    expect(keys(t("toolBar.eraser"))).toEqual(["E", "3"]);
    for (const [tool, letter] of [["text", "T"], ["rectangle", "R"], ["diamond", "D"], ["ellipse", "O"], ["arrow", "A"], ["line", "L"]] as const) {
      expect(keys(t(`toolBar.${tool}`))).toEqual([letter]);
    }
  });

  it.each(["writing", "eraser", "text", "shape", "line", "more", "presentation"] as const)(
    "suppresses only the expanded %s trigger and keeps other rail hints available",
    async (menu) => {
      await renderCourseware();
      if (menu === "presentation") {
        API.setElements([API.createElement({ type: "frame" })]);
      }
      const trigger = screen.getByTestId(menu === "more" ? "main-menu-trigger" :
        menu === "presentation" ? "footer-presentation" : `toolbar-group-${menu}`);
      fireEvent.pointerEnter(trigger);
      const tooltip = document.querySelector(".excalidraw-tooltip")!;
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      // Native title cannot be dismissed by our overlay coordinator.
      expect(trigger).not.toHaveAttribute("title");
      fireEvent.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
      expect(tooltip).toHaveClass("excalidraw-tooltip--instant");
      fireEvent.pointerEnter(trigger);
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
      const draw = screen.getByTestId(menu === "writing" ? "toolbar-group-eraser" : "toolbar-group-writing");
      fireEvent.pointerEnter(draw);
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      expect(tooltip.textContent).toContain(draw.getAttribute("aria-label"));
      const otherGroup = screen.getByTestId(menu === "shape" ? "toolbar-group-text" : "toolbar-group-shape");
      fireEvent.pointerEnter(otherGroup);
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      const focused = document.activeElement as HTMLElement;
      fireEvent.keyDown(focused, { key: "Escape" });
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
      // Returning focus alone must not reopen a tooltip.
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
      fireEvent.pointerEnter(trigger);
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
    },
  );

  it("dismisses the previous hint on opening selection, then allows other rail hints", async () => {
    await renderCourseware();
    const shape = screen.getByTestId("toolbar-group-shape");
    fireEvent.pointerEnter(shape);
    fireEvent.click(screen.getByTestId("toolbar-group-selection"));
    await screen.findByTestId("toolbar-lasso");
    expect(document.querySelector(".excalidraw-tooltip")).not.toHaveClass("excalidraw-tooltip--visible");
    fireEvent.pointerEnter(shape);
    expect(document.querySelector(".excalidraw-tooltip")).toHaveClass("excalidraw-tooltip--visible");
    expect(screen.getByTestId("toolbar-group-selection")).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("toolbar-group-selection")).toHaveAttribute("aria-expanded", "false"));
    expect(document.querySelector(".excalidraw-tooltip")).not.toHaveClass("excalidraw-tooltip--visible");
  });

  it.each([
    { group: "writing", ids: ["freedraw", "laser"] },
    { group: "eraser", ids: ["eraser-path", "eraser-box"] },
    { group: "text", ids: ["text", "richText"] },
    { group: "shape", ids: ["rectangle", "diamond", "ellipse"] },
    { group: "line", ids: ["arrow", "line"] },
    { group: "selection", ids: ["selection", "lasso"] },
  ])("shows built-in hints for every $group palette option without changing tools", async ({ group, ids }) => {
    await renderCourseware();
    const trigger = screen.getByTestId(`toolbar-group-${group}`);
    fireEvent.click(trigger);
    const activate = vi.spyOn(h.app, "setActiveTool");
    for (const id of ids) {
      const option = await screen.findByTestId(`toolbar-${id}`);
      fireEvent.pointerEnter(option);
      const tooltip = document.querySelector(".excalidraw-tooltip")!;
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      expect(tooltip.textContent).toContain(option.getAttribute("aria-label"));
      expect(option).not.toHaveAttribute("title");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      fireEvent.pointerLeave(option);
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    }
    expect(activate).not.toHaveBeenCalled();
  });

  it.each(["toolbar-group-shape", "main-menu-trigger"])(
    "cleans up an imperative tooltip when %s unmounts",
    async (testId) => {
      await renderCourseware();
      fireEvent.pointerEnter(screen.getByTestId(testId));
      const tooltip = document.querySelector(".excalidraw-tooltip")!;
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      unmountComponent();
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    },
  );

  it("shows all More option hints without selecting or closing, then runs an action once", async () => {
    const onExtraSelect = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        extraToolsMenuItems={[
          { id: "recording", label: "Recording", onSelect: onExtraSelect },
          { id: "reading", label: <span>Reading aid</span>, onSelect: onExtraSelect },
        ]}
      >
        <TTDDialogTrigger>AI diagram</TTDDialogTrigger>
      </Excalidraw>,
    );
    act(() => {
      h.app.setPlugins({ diagramToCode: { generate: () => ({ html: "" }) } });
      h.app.refresh();
    });
    const trigger = screen.getByTestId("main-menu-trigger");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    const activate = vi.spyOn(h.app, "setActiveTool");
    const openDialog = vi.spyOn(h.app, "setOpenDialog");
    const magicframe = vi.spyOn(h.app, "onMagicframeToolSelect");
    const options = [
      {
        button: within(menu).getByRole("button", { name: t("toolBar.embeddable") }),
        label: t("toolBar.embeddable"),
      },
      {
        button: within(menu).getByRole("button", { name: t("toolBar.mermaidToExcalidraw") }),
        label: t("toolBar.mermaidToExcalidraw"),
      },
      { button: within(menu).getByTestId("toolbar-extra-recording"), label: "Recording" },
      { button: within(menu).getByTestId("toolbar-extra-reading"), label: "Reading aid" },
      { button: within(menu).getByTestId("toolbar-magicframe"), label: t("toolBar.magicframe") },
      { button: within(menu).getByRole("button", { name: "AI diagram AI" }), label: "AI diagram" },
    ];
    for (const { button, label } of options) {
      fireEvent.pointerEnter(button);
      const tooltip = document.querySelector(".excalidraw-tooltip")!;
      expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
      expect(tooltip.textContent).toBe(label);
      expect(button).not.toHaveAttribute("title");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(menu).toBeInTheDocument();
      expect(h.state.openDialog).toBeNull();
      fireEvent.pointerLeave(button);
      expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    }
    expect(activate).not.toHaveBeenCalled();
    expect(openDialog).not.toHaveBeenCalled();
    expect(magicframe).not.toHaveBeenCalled();
    expect(onExtraSelect).not.toHaveBeenCalled();

    const recording = within(menu).getByTestId("toolbar-extra-recording");
    fireEvent.pointerEnter(recording);
    fireEvent.click(recording);
    expect(onExtraSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
    expect(document.querySelector(".excalidraw-tooltip")).not.toHaveClass("excalidraw-tooltip--visible");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("cleans up a More option hint when Escape closes its menu", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("main-menu-trigger");
    fireEvent.click(trigger);
    const menu = await screen.findByTestId("dropdown-menu");
    const option = within(menu).getByRole("button", { name: t("toolBar.embeddable") });
    fireEvent.pointerEnter(option);
    const tooltip = document.querySelector(".excalidraw-tooltip")!;
    expect(tooltip).toHaveClass("excalidraw-tooltip--visible");
    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("dropdown-menu")).toBeNull());
    expect(tooltip).not.toHaveClass("excalidraw-tooltip--visible");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
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
  ])("filters selection and hand controls by their tool permissions %j", async (tools) => {
    await renderCourseware({ tools });
    expect(!!screen.queryByTestId("toolbar-group-selection")).toBe(tools.selection || tools.lasso);
    expect(!!screen.queryByTestId("toolbar-hand")).toBe(tools.hand);
    expect(document.querySelector(".Courseware-navigation-controls")
      ?.classList.contains("Courseware-navigation-controls--with-hand"))
      .toBe(tools.hand);
    if (tools.lasso) {
      fireEvent.click(screen.getByTestId("toolbar-group-selection"));
      expect(screen.queryByTestId("toolbar-selection")).toBeNull();
      const setActiveTool = vi.spyOn(h.app, "setActiveTool");
      fireEvent.click(await screen.findByTestId("toolbar-lasso"));
      expect(setActiveTool).toHaveBeenCalledTimes(1);
      expect(h.state.activeTool.type).toBe("lasso");
    }
  });

  it("opens selection beside the main toolbar and closes with focus restored", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("toolbar-group-selection");
    fireEvent.click(trigger);
    const selection = await screen.findByTestId("toolbar-selection");
    const lasso = screen.getByTestId("toolbar-lasso");
    const menu = selection.closest(".Courseware-toolbar__popover");
    expect(menu).toHaveAttribute("data-side", "right");
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
    "keeps selection mutually exclusive with the %s menu",
    async (menu) => {
      await renderCourseware();
      if (menu === "presentation") {
        API.setElements([API.createElement({ type: "frame" })]);
      }
      const selection = screen.getByTestId("toolbar-group-selection");
      const railTrigger = screen.getByTestId(
        menu === "shape" ? "toolbar-group-shape" : menu === "more" ? "main-menu-trigger" : "footer-presentation",
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
      expect(selection).toHaveAttribute("aria-expanded", "true");
    },
  );

  it("keeps save first, then lock and selection, with presentation only in the right footer", async () => {
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        renderToolbarStart={() => <button>Save courseware</button>}
      />,
    );
    const save = screen.getByRole("button", { name: "Save courseware" });
    expect(save.nextElementSibling).toHaveClass("Courseware-toolbar__separator");
    expect(save.nextElementSibling?.nextElementSibling)
      .toContainElement(screen.getByTestId("toolbar-lock"));
    const selection = screen.getByTestId("toolbar-group-selection");
    const tools = document.querySelector(".Courseware-toolbar__tools")!;
    const buttons = Array.from(tools.querySelectorAll("button, input"));
    expect(buttons.indexOf(selection)).toBeLessThan(buttons.indexOf(screen.getByTestId("toolbar-group-writing")));
    const presentation = screen.getByTestId("footer-presentation");
    expect(screen.getAllByTestId("footer-presentation")).toHaveLength(1);
    expect(presentation.closest(".layer-ui__wrapper__footer-right")).not.toBeNull();
    expect(presentation.closest(".Courseware-toolbar")).toBeNull();
  });

  it("does not add an empty save section and disables presentation without playable frames", async () => {
    await renderCourseware();
    const presentation = screen.getByTestId("footer-presentation");
    const tools = document.querySelector(".Courseware-toolbar__tools");
    expect(tools?.firstElementChild).toContainElement(screen.getByTestId("toolbar-lock"));
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
      fireEvent.click(screen.getByTestId("footer-presentation"));
      const option = await screen.findByTestId(`presentation-${mode}`);
      expect(option.closest(".Courseware-toolbar__tools")).toBeNull();
      expect(option.closest(".excalidraw")).toBe(container);
      fireEvent.pointerEnter(option);
      expect(document.querySelector(".excalidraw-tooltip--visible")).toBeNull();
      expect(option).not.toHaveAttribute("title");
      expect(screen.getByTestId("footer-presentation")).toHaveAttribute("aria-expanded", "true");
      expect(startPresentation).not.toHaveBeenCalled();
      expect(openPresenter).not.toHaveBeenCalled();
      expect(HTMLElement.prototype.requestFullscreen).not.toHaveBeenCalled();
      fireEvent.click(option);
      expect(startPresentation).toHaveBeenCalledTimes(1);
      expect(openPresenter).toHaveBeenCalledTimes(mode === "presenter" ? 1 : 0);
      expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalledTimes(1);
      expect(events).toEqual(
        mode === "presenter" ? ["open", "fullscreen", "start"] : ["fullscreen", "start"],
      );
      expect(h.state.presentationMode).toBe(true);
      expect(screen.queryByTestId("presentation-viewer")).toBeNull();
      expect(document.querySelector(".excalidraw-tooltip--visible")).toBeNull();
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
        expect(screen.queryByTestId("footer-presentation")).toBeNull();
        expect(document.querySelector(".Courseware-toolbar__tools"))
          .toContainElement(screen.getByTestId("toolbar-lock"));
        return;
      }
      fireEvent.click(screen.getByTestId("footer-presentation"));
      await screen.findByTestId(`presentation-${viewers[0]}`);
      const expectedModes: readonly string[] = viewers;
      for (const mode of ["viewer", "presenter"]) {
        expect(!!screen.queryByTestId(`presentation-${mode}`)).toBe(expectedModes.includes(mode));
      }
    },
  );

  it("closes the footer presentation menu on Escape, outside clicks and another tool menu", async () => {
    await renderCourseware();
    API.setElements([API.createElement({ type: "frame" })]);
    const trigger = screen.getByTestId("footer-presentation");
    fireEvent.click(trigger);
    const option = await screen.findByTestId("presentation-viewer");
    await waitFor(() => expect(option).toHaveFocus());
    fireEvent.pointerEnter(option);
    expect(document.querySelector(".excalidraw-tooltip--visible")).toBeNull();
    fireEvent.keyDown(option, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("presentation-viewer")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.querySelector(".excalidraw-tooltip--visible")).toBeNull();

    fireEvent.click(trigger);
    await screen.findByTestId("presentation-viewer");
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByTestId("presentation-viewer")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await screen.findByTestId("presentation-viewer");
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    const first = await screen.findByTestId("toolbar-rounded-rectangle");
    await waitFor(() => expect(first).toHaveFocus());
    expect(screen.queryByTestId("presentation-viewer")).toBeNull();
    fireEvent.click(screen.getByTestId("footer-presentation"));
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
      expect(document.querySelector(".Courseware-toolbar [data-testid='footer-presentation']")).toBeNull();
      if (UIOptions.formFactor === "desktop") {
        expect(document.querySelector(".layer-ui__wrapper__footer-left")).not.toBeNull();
        if (!viewModeEnabled) {
          expect(screen.getAllByTestId("footer-presentation")).toHaveLength(1);
        }
      }
    },
  );

  it.each([
    ["selection", "toolbar-lasso", "lasso", "selection", "toolbar-selection"],
    ["writing", "toolbar-laser", "laser", "freedraw", "toolbar-freedraw"],
    ["eraser", "toolbar-eraser-box", "eraser", "eraser", "toolbar-eraser-path"],
    ["text", "toolbar-richText", "richText", "text", "toolbar-text"],
    ["shape", "toolbar-diamond", "diamond", "custom", "toolbar-rounded-rectangle"],
    ["line", "toolbar-line", "line", "arrow", "toolbar-arrow"],
  ])(
    "defaults to the first %s tool, then restores the last choice once",
    async (group, optionId, tool, defaultTool, firstOptionId) => {
      await renderCourseware();
      act(() => h.app.setActiveTool({ type: group === "writing" ? "text" : "freedraw" }));
      const setActiveTool = vi.spyOn(h.app, "setActiveTool");
      const trigger = screen.getByTestId(`toolbar-group-${group}`);

      fireEvent.click(trigger);

      expect(h.state.activeTool.type).toBe(defaultTool);
      expect(setActiveTool).toHaveBeenCalledTimes(1);
      expect(setActiveTool).toHaveBeenCalledWith(defaultTool === "custom"
        ? { type: "custom", customType: "courseware-shape:rounded-rectangle" }
        : { type: defaultTool });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByTestId(firstOptionId)).toHaveAttribute("aria-pressed", "true");
      const option = await screen.findByTestId(optionId);
      expect(option.closest(".Courseware-toolbar__tools")).toBeNull();
      expect(option.closest(".excalidraw")).not.toBeNull();
      setActiveTool.mockClear();
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
      act(() => h.app.setActiveTool({ type: group === "writing" ? "text" : "freedraw" }));
      setActiveTool.mockClear();
      fireEvent.click(trigger);
      expect(h.state.activeTool.type).toBe(tool);
      expect(setActiveTool).toHaveBeenCalledTimes(1);
      expect(await screen.findByTestId(optionId)).toHaveAttribute("aria-pressed", "true");
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      setActiveTool.mockClear();
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(setActiveTool).not.toHaveBeenCalled();
    },
  );

  it("groups free drawing before laser and follows shortcut changes", async () => {
    await renderCourseware();
    const trigger = screen.getByTestId("toolbar-group-writing");
    const rail = document.querySelector<HTMLElement>(".Courseware-toolbar__tools")!;
    expect(trigger).toHaveAttribute("data-active-tool", "freedraw");
    expect(within(rail).queryByTestId("toolbar-freedraw")).toBeNull();
    expect(within(rail).queryByTestId("toolbar-laser")).toBeNull();

    fireEvent.click(trigger);
    const palette = screen.getByRole("dialog", { name: t("toolBar.freedraw") });
    expect(within(palette).getAllByRole("button").map((button) => button.dataset.tool))
      .toEqual(["freedraw", "laser"]);
    Keyboard.keyPress(KEYS.K);
    expect(h.state.activeTool.type).toBe("laser");
    expect(trigger).toHaveAttribute("data-active-tool", "laser");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    Keyboard.keyPress(KEYS.V);
    expect(trigger).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trigger);
    expect(h.state.activeTool.type).toBe("laser");
    expect(await screen.findByTestId("toolbar-laser")).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    { freedraw: false, laser: true, available: "laser" },
    { freedraw: true, laser: false, available: "freedraw" },
    { freedraw: false, laser: false, available: null },
  ])("filters drawing group permissions %j", async ({ freedraw, laser, available }) => {
    await renderCourseware({ tools: { freedraw, laser } });
    const trigger = screen.queryByTestId("toolbar-group-writing");
    if (!available) {
      expect(trigger).toBeNull();
      return;
    }
    expect(trigger).toHaveAttribute("data-active-tool", available);
    fireEvent.click(trigger!);
    expect(h.state.activeTool.type).toBe(available);
    const palette = screen.getByRole("dialog", { name: t("toolBar.freedraw") });
    expect(within(palette).getAllByRole("button")).toHaveLength(1);
    expect(within(palette).getByTestId(`toolbar-${available}`)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId(`toolbar-${available === "laser" ? "freedraw" : "laser"}`)).toBeNull();
  });

  it("restores sticky color and emoji placement on opening without discarding either choice", async () => {
    await renderCourseware();
    const pointer = new Pointer("mouse");
    const sticky = screen.getByTestId("toolbar-sticky");
    const emoji = screen.getByTestId("toolbar-emoji");
    const activate = vi.spyOn(h.app, "setActiveTool");

    fireEvent.click(sticky);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool.customType).toBe(COURSEWARE_STICKY_CUSTOM_TYPE);
    expect(screen.getByRole("button", { name: "便签颜色 #fff7cc" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "便签颜色 #d9f3fd" }));
    pointer.clickAt(300, 200);

    activate.mockClear();
    fireEvent.click(emoji);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool.customType).toBe(COURSEWARE_EMOJI_CUSTOM_TYPE);
    expect(h.state.coursewareEmoji).toBe(COURSEWARE_DEFAULT_EMOJI);
    expect(await screen.findByRole("button", { name: `表情 ${COURSEWARE_DEFAULT_EMOJI}` })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "表情 🦄" }));
    pointer.clickAt(500, 200);

    activate.mockClear();
    fireEvent.click(sticky);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(sticky).toHaveAttribute("aria-expanded", "true");
    expect(h.state.coursewareStickyColor).toBe("#d9f3fd");
    expect(screen.getByRole("button", { name: "便签颜色 #d9f3fd" })).toHaveAttribute("aria-pressed", "true");
    pointer.clickAt(300, 400);
    expect(h.elements.filter((element) => element.customData?.coursewareObjectType === "sticky").at(-1)?.backgroundColor).toBe("#d9f3fd");

    activate.mockClear();
    fireEvent.click(emoji);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(emoji).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("button", { name: "表情 🦄" })).toHaveAttribute("aria-pressed", "true");
    pointer.clickAt(500, 400);
    expect(h.elements.filter((element) => element.customData?.coursewareObjectType === "emoji").at(-1)?.customData?.coursewareEmoji).toBe("🦄");
  });

  it("keeps polygon memory independent when switching between custom insert tools and groups", async () => {
    await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    fireEvent.click(await screen.findByTestId("toolbar-star"));
    fireEvent.click(screen.getByTestId("toolbar-sticky"));
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith({ type: "custom", customType: "courseware-shape:star" });
    expect(screen.getByTestId("toolbar-group-shape")).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTestId("toolbar-star")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("toolbar-sticky")).toHaveAttribute("aria-expanded", "false");
  });

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

  it("closes a default-selected group on a subsequent shortcut or API tool change", async () => {
    await renderCourseware();
    const shape = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(shape);
    await screen.findByTestId("toolbar-rectangle");
    Keyboard.keyPress(KEYS.D);
    expect(h.state.activeTool.type).toBe("diamond");
    expect(shape).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(shape);
    await screen.findByTestId("toolbar-rectangle");
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    expect(shape).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the unified command menu without selecting a tool or executing commands", async () => {
    const onExtraSelect = vi.fn();
    await render(
      <Excalidraw
        UIOptions={{ toolbarLayout: "left", formFactor: "desktop" }}
        extraToolsMenuItems={[{ id: "custom", label: "Custom action", onSelect: onExtraSelect }]}
      />,
    );
    const activate = vi.spyOn(h.app, "setActiveTool");
    const dialog = vi.spyOn(h.app, "setOpenDialog");
    const more = screen.getByTestId("main-menu-trigger");
    fireEvent.click(more);
    const menu = await screen.findByTestId("dropdown-menu");
    expect(activate).not.toHaveBeenCalled();
    expect(h.state.activeTool.type).toBe("selection");
    expect(within(menu).getByRole("button", { name: t("toolBar.embeddable") })).not.toHaveClass("dropdown-menu-item--selected");
    expect(dialog).not.toHaveBeenCalled();
    expect(onExtraSelect).not.toHaveBeenCalled();
    expect(more).toHaveAttribute("aria-expanded", "true");
    activate.mockClear();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(activate).not.toHaveBeenCalled();
  });

  it("does not auto-activate a disabled embedded tool when More opens", async () => {
    await renderCourseware({ tools: { embeddable: false } });
    const activate = vi.spyOn(h.app, "setActiveTool");
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    await screen.findByTestId("dropdown-menu");
    expect(activate).not.toHaveBeenCalled();
    expect(h.state.activeTool.type).toBe("selection");
    expect(screen.getByTestId("main-menu-trigger")).toHaveAttribute("aria-expanded", "true");
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
          ? "main-menu-trigger"
          : "toolbar-group-shape",
      );
      fireEvent.click(trigger);
      await screen.findByTestId(
        group === "more" ? "dropdown-menu" : "toolbar-rectangle",
      );
      fireEvent.scroll(tools);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(
        group === "more"
          ? screen.getByTestId("dropdown-menu")
          : document.querySelector(".Courseware-toolbar__popover"),
      ).toBeInTheDocument();

      tools.scrollTop = 120;
      fireEvent.scroll(tools);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    },
  );

  it("moves focus through the vertical toolbar without changing the tool", async () => {
    await renderCourseware();
    const lock = screen.getByTestId("toolbar-lock");
    const writing = screen.getByTestId("toolbar-group-writing");
    const more = within(screen.getByRole("toolbar")).getByRole("button", {
      name: t("buttons.menu"),
    });
    const setActiveTool = vi.spyOn(h.app, "setActiveTool");
    lock.focus();
    fireEvent.keyDown(lock, { key: "ArrowDown" });
    expect(screen.getByTestId("toolbar-group-selection")).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId("toolbar-group-selection"), { key: "ArrowDown" });
    expect(writing).toHaveFocus();
    fireEvent.keyDown(writing, { key: "End" });
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
    fireEvent.click(screen.getByTestId("main-menu-trigger"));
    const moreMenu = await screen.findByTestId("dropdown-menu");
    await waitFor(() =>
      expect(moreMenu.contains(document.activeElement)).toBe(true),
    );
    const group = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(group);
    const child = await screen.findByTestId("toolbar-rounded-rectangle");
    await waitFor(() => expect(child).toHaveFocus());
    expect(group).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
  });

  it("keeps the remembered tool when Escape dismisses a grouped palette", async () => {
    await renderCourseware();
    act(() => h.app.setActiveTool({ type: "diamond" }));
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    const option = await screen.findByTestId("toolbar-rounded-rectangle");
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
    expect(setActiveTool).toHaveBeenCalledTimes(1);
    expect(h.state.activeTool.type).toBe("ellipse");
    setActiveTool.mockClear();
    fireEvent.click(await screen.findByTestId("toolbar-ellipse"));
    expect(setActiveTool).toHaveBeenCalledTimes(1);
    expect(setActiveTool).toHaveBeenCalledWith({ type: "ellipse" });
    expect(h.state.activeTool.type).toBe("ellipse");
  });

  it("falls back to the first available option when the remembered tool becomes disabled", async () => {
    const { rerender } = await renderCourseware();
    fireEvent.click(screen.getByTestId("toolbar-group-shape"));
    fireEvent.click(await screen.findByTestId("toolbar-diamond"));
    act(() => h.app.setActiveTool({ type: "freedraw" }));
    rerender(
      <Excalidraw
        handleKeyboardGlobally
        renderEmojiPicker={renderTestEmojiPicker}
        UIOptions={{
          toolbarLayout: "left",
          formFactor: "desktop",
          tools: { diamond: false },
        }}
      />,
    );
    const activate = vi.spyOn(h.app, "setActiveTool");
    const trigger = screen.getByTestId("toolbar-group-shape");
    fireEvent.click(trigger);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith({ type: "custom", customType: "courseware-shape:rounded-rectangle" });
    expect(await screen.findByTestId("toolbar-rounded-rectangle")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("toolbar-diamond")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
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
        name: t("buttons.menu"),
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
      name: t("buttons.menu"),
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
