import React from "react";

import { DEFAULT_SIDEBAR, PRESENTATION_SIDEBAR_TAB } from "@excalidraw/common";
import { CaptureUpdateAction } from "@excalidraw/element";
import type { ExcalidrawFrameElement } from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { act, fireEvent, render, screen, waitFor } from "../tests/test-utils";

const { h } = window;

const createFrame = (
  id: string,
  options: { excluded?: boolean; x?: number } = {},
): ExcalidrawFrameElement => ({
  ...API.createElement({
    type: "frame",
    id,
    x: options.x ?? 0,
    y: 0,
  }),
  customData: options.excluded
    ? { excludeFromPresentation: true }
    : undefined,
});

describe("presentation frame exclusion", () => {
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let openWindow: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    openWindow = vi.spyOn(window, "open").mockReturnValue(null);

    await render(<Excalidraw />);
  });

  afterEach(() => {
    openWindow.mockRestore();
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
  });

  it("keeps slide notes available when the selected frame is excluded", () => {
    const excluded = createFrame("frame-b", { excluded: true });
    API.setElements([excluded]);
    API.setSelectedElements([excluded]);

    expect(screen.queryByTitle("从此播放")).not.toBeInTheDocument();
    expect(screen.queryByTitle("演讲者视图")).not.toBeInTheDocument();
    expect(screen.getByTitle("添加注释")).toBeInTheDocument();
    expect(screen.queryByTitle("查看/编辑注释")).not.toBeInTheDocument();
    expect(screen.queryByTitle("设置播放顺序")).not.toBeInTheDocument();
    expect(screen.getByTitle("Frame 设置")).toBeInTheDocument();
  });

  it("keeps existing slide notes editable when the frame is excluded", () => {
    const excluded = {
      ...createFrame("frame-b", { excluded: true }),
      customData: {
        excludeFromPresentation: true,
        slideNoteHtml: "<p>Speaker note</p>",
      },
    };
    API.setElements([excluded]);
    API.setSelectedElements([excluded]);

    expect(screen.getByTitle("查看/编辑注释")).toBeInTheDocument();
    expect(screen.queryByTitle("添加注释")).not.toBeInTheDocument();
  });

  it("places slide order directly before Frame settings in the canvas toolbar", () => {
    const frame = createFrame("frame-a");
    API.setElements([frame]);
    API.setSelectedElements([frame]);

    const toolbar = document.querySelector<HTMLElement>(
      ".excalidraw-canvas-buttons",
    );
    expect(toolbar).toBeTruthy();
    expect(
      Array.from(toolbar!.children, (control) => {
        return (
          control.getAttribute("title") ??
          control.querySelector<HTMLElement>("[title]")?.title
        );
      }),
    ).toEqual([
      "从此播放",
      "演讲者视图",
      "添加注释",
      "设置播放顺序",
      "Frame 设置",
    ]);
  });

  it("uses the compact placeholder for an excluded frame label", () => {
    const excluded = createFrame("frame-b", { excluded: true });
    API.setElements([excluded]);

    expect(screen.getByText("[-]", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("[非 PPT]", { exact: true })).not.toBeInTheDocument();
  });

  it("uses playable numbering and preserves the excluded slot when reordered", () => {
    const first = createFrame("frame-a", { x: 0 });
    const excluded = createFrame("frame-b", { excluded: true, x: 200 });
    const last = createFrame("frame-c", { x: 400 });
    API.setElements([first, excluded, last]);
    API.setAppState({ slideOrder: [first.id, excluded.id, last.id] });
    API.setSelectedElements([last]);

    fireEvent.click(screen.getByTitle("设置播放顺序"));
    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("2");
    expect(input).toHaveAttribute("placeholder", "1-2");

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(h.state.slideOrder).toEqual([last.id, excluded.id, first.id]);
  });

  it("does not open or start presentation when every frame is excluded", () => {
    const excluded = createFrame("frame-only", { excluded: true });
    API.setElements([excluded]);

    const trigger = document.querySelector<HTMLButtonElement>(
      ".layer-ui__wrapper__footer-right button.App-menu__left-btn",
    );
    expect(trigger).toBeTruthy();
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("title", "没有可播放的幻灯片");

    fireEvent.click(trigger!);
    const presenterView = screen.queryByText("演讲者视图");
    if (presenterView) {
      fireEvent.click(presenterView);
    }

    expect(openWindow).not.toHaveBeenCalled();
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(h.state.presentationMode).toBe(false);
  });

  it("writes a normalized complete frame order before footer presentation starts", async () => {
    const first = createFrame("frame-a", { x: 0 });
    const second = createFrame("frame-b", { x: 200 });
    const last = createFrame("frame-c", { x: 400 });
    API.setElements([first, second, last]);
    API.setAppState({
      slideOrder: [last.id, "missing", last.id],
    });

    const trigger = document.querySelector<HTMLButtonElement>(
      ".layer-ui__wrapper__footer-right button.App-menu__left-btn",
    );
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger!);
    fireEvent.click(screen.getByText("普通视图"));

    await waitFor(() => {
      expect(h.state.presentationMode).toBe(true);
    });
    expect(h.state.slideOrder).toEqual([last.id, first.id, second.id]);
  });

  it("lists only playable ordinary frames while retaining a normalized full order", async () => {
    const first = { ...createFrame("frame-a", { x: 0 }), name: "First" };
    const excluded = {
      ...createFrame("frame-b", { excluded: true, x: 200 }),
      name: "Excluded",
    };
    const last = { ...createFrame("frame-c", { x: 400 }), name: "Last" };
    const magicFrame = {
      ...API.createElement({ type: "magicframe", id: "magic-frame", x: 600 }),
      name: "Magic",
    };
    API.setElements([first, excluded, last, magicFrame]);
    API.setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      },
      slideOrder: [last.id, "missing", last.id, excluded.id],
    });

    await waitFor(() => {
      expect(document.querySelectorAll(".PresentationMenu__slide")).toHaveLength(
        2,
      );
    });

    expect(screen.getByTitle("Last")).toBeInTheDocument();
    expect(screen.getByTitle("First")).toBeInTheDocument();
    expect(screen.queryByTitle("Excluded")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Magic")).not.toBeInTheDocument();
    expect(screen.getByText("2 张")).toBeInTheDocument();
    expect(h.state.slideOrder).toEqual([last.id, excluded.id, first.id]);
  });

  it("places Frame settings last in each slide card action row", async () => {
    const frame = { ...createFrame("frame-a"), name: "Only slide" };
    API.setElements([frame]);
    API.setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      },
    });

    await waitFor(() => {
      expect(
        document.querySelectorAll(
          ".PresentationMenu__slide-actions > button",
        ),
      ).toHaveLength(4);
    });

    expect(
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          ".PresentationMenu__slide-actions > button",
        ),
        (button) => button.title,
      ),
    ).toEqual(["从此播放", "演讲者视图", "添加注释", "Frame 设置"]);
  });

  it("keeps a visible drag reorder after persisting the complete order", async () => {
    const first = { ...createFrame("frame-a", { x: 0 }), name: "A" };
    const excluded = {
      ...createFrame("frame-b", { excluded: true, x: 200 }),
      name: "B hidden",
    };
    const last = { ...createFrame("frame-c", { x: 400 }), name: "C" };
    API.setElements([first, excluded, last]);
    API.setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      },
      slideOrder: [first.id, excluded.id, last.id],
    });
    await waitFor(() => {
      expect(document.querySelectorAll(".PresentationMenu__slide")).toHaveLength(
        2,
      );
    });

    const dataTransfer = new DataTransfer();
    fireEvent.dragStart(screen.getByTitle("C"), { dataTransfer });
    fireEvent.dragOver(screen.getByTitle("A"), { dataTransfer });
    fireEvent.drop(screen.getByTitle("A"), { dataTransfer });

    await waitFor(() => {
      expect(h.state.slideOrder).toEqual([last.id, excluded.id, first.id]);
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(h.state.slideOrder).toEqual([last.id, excluded.id, first.id]);
  });

  it("shows the no-playable-slides empty state when all frames are excluded", async () => {
    const excluded = createFrame("frame-only", { excluded: true });
    API.setElements([excluded]);
    API.setAppState({
      openSidebar: {
        name: DEFAULT_SIDEBAR.name,
        tab: PRESENTATION_SIDEBAR_TAB,
      },
    });

    expect(
      await screen.findByText("没有可播放的幻灯片"),
    ).toBeInTheDocument();
    expect(
      document.querySelectorAll(".PresentationMenu__slide"),
    ).toHaveLength(0);
  });

  it("starts formal presentation with only playable frames", async () => {
    const first = createFrame("frame-a", { x: 0 });
    const excluded = createFrame("frame-b", { excluded: true, x: 200 });
    const last = createFrame("frame-c", { x: 400 });
    const presentationStarts: Array<{ total: number }> = [];
    const handleStart = (event: Event) => {
      presentationStarts.push(
        (event as CustomEvent<{ total: number }>).detail,
      );
    };
    document.addEventListener("excalidraw:presentationStart", handleStart);

    API.setElements([first, excluded, last]);
    API.setAppState({
      slideOrder: [first.id, excluded.id, last.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });

    await waitFor(() => {
      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });
    expect(presentationStarts).toEqual([{ total: 2 }]);

    document.removeEventListener("excalidraw:presentationStart", handleStart);
  });

  it("exits an initially empty presentation without start side effects", async () => {
    const excluded = createFrame("frame-only", { excluded: true });
    const presentationStarts: Array<{ total: number }> = [];
    const handleStart = (event: Event) => {
      presentationStarts.push(
        (event as CustomEvent<{ total: number }>).detail,
      );
    };
    const setActiveTool = vi.spyOn(h.app, "setActiveTool");
    document.addEventListener("excalidraw:presentationStart", handleStart);

    API.setElements([excluded]);
    API.setAppState({
      slideOrder: [excluded.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });

    await waitFor(() => {
      expect(h.state.presentationMode).toBe(false);
    });
    expect(presentationStarts).toEqual([]);
    expect(h.state.presentationAnnotationSessionId).toBe(null);
    expect(setActiveTool).not.toHaveBeenCalledWith({ type: "hand" });

    setActiveTool.mockRestore();
    document.removeEventListener("excalidraw:presentationStart", handleStart);
  });

  it.each([
    {
      name: "keeps the current frame and follows its new index",
      currentIndex: 1,
      excludedIndices: [0],
      deletedIndices: [],
      removedIndices: [],
      expectedFrameId: "frame-b",
      expectedCounter: "1 / 3",
      expectedIndex: 0,
      expectedTotal: 3,
    },
    {
      name: "uses the next frame when the middle frame is excluded",
      currentIndex: 1,
      excludedIndices: [1],
      deletedIndices: [],
      removedIndices: [],
      expectedFrameId: "frame-c",
      expectedCounter: "2 / 3",
      expectedIndex: 1,
      expectedTotal: 3,
    },
    {
      name: "uses the previous frame when the last frame is excluded",
      currentIndex: 3,
      excludedIndices: [3],
      deletedIndices: [],
      removedIndices: [],
      expectedFrameId: "frame-c",
      expectedCounter: "3 / 3",
      expectedIndex: 2,
      expectedTotal: 3,
    },
    {
      name: "skips consecutive excluded frames at the same index",
      currentIndex: 1,
      excludedIndices: [1, 2],
      deletedIndices: [],
      removedIndices: [],
      expectedFrameId: "frame-d",
      expectedCounter: "2 / 2",
      expectedIndex: 1,
      expectedTotal: 2,
    },
    {
      name: "uses the next frame when the current frame is deleted",
      currentIndex: 1,
      excludedIndices: [],
      deletedIndices: [1],
      removedIndices: [],
      expectedFrameId: "frame-c",
      expectedCounter: "2 / 3",
      expectedIndex: 1,
      expectedTotal: 3,
    },
    {
      name: "uses the next frame when the current frame is removed",
      currentIndex: 1,
      excludedIndices: [],
      deletedIndices: [],
      removedIndices: [1],
      expectedFrameId: "frame-c",
      expectedCounter: "2 / 3",
      expectedIndex: 1,
      expectedTotal: 3,
    },
  ])("$name", async ({
    currentIndex,
    excludedIndices,
    deletedIndices,
    removedIndices,
    expectedFrameId,
    expectedCounter,
    expectedIndex,
    expectedTotal,
  }) => {
    const frames = [
      createFrame("frame-a", { x: 0 }),
      createFrame("frame-b", { x: 200 }),
      createFrame("frame-c", { x: 400 }),
      createFrame("frame-d", { x: 600 }),
    ];
    const slideChanges: Array<{
      frameId: string | null;
      index: number;
      total: number;
    }> = [];
    const handleSlideChange = (event: Event) => {
      slideChanges.push(
        (
          event as CustomEvent<{
            frameId: string | null;
            index: number;
            total: number;
          }>
        ).detail,
      );
    };
    document.addEventListener(
      "excalidraw:presentationSlideChange",
      handleSlideChange,
    );

    API.setElements(frames);
    API.setAppState({
      slideOrder: frames.map((frame) => frame.id),
      presentationMode: true,
      presentationSlideIndex: currentIndex,
    });
    await waitFor(() => {
      expect(
        screen.getByText(`${currentIndex + 1} / ${frames.length}`),
      ).toBeInTheDocument();
    });

    const scrollToContent = vi.spyOn(h.app, "scrollToContent");
    slideChanges.length = 0;
    scrollToContent.mockClear();
    API.updateScene({
      elements: frames
        .filter((_frame, index) => !removedIndices.includes(index))
        .map((frame) => {
          const index = frames.indexOf(frame);
          if (excludedIndices.includes(index)) {
            return {
              ...frame,
              customData: { excludeFromPresentation: true },
            };
          }
          if (deletedIndices.includes(index)) {
            return { ...frame, isDeleted: true };
          }
          return frame;
        }),
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    await waitFor(() => {
      expect(screen.getByText(expectedCounter)).toBeInTheDocument();
      expect(slideChanges.length).toBeGreaterThan(0);
    });
    for (const detail of slideChanges) {
      expect(detail.frameId).toBe(expectedFrameId);
      expect(detail.index).toBe(expectedIndex);
      expect(detail.total).toBe(expectedTotal);
      expect(detail.index).toBeGreaterThanOrEqual(0);
      expect(detail.index).toBeLessThan(detail.total);
    }
    expect(scrollToContent).toHaveBeenCalled();
    for (const [frame] of scrollToContent.mock.calls) {
      expect(frame.id).toBe(expectedFrameId);
    }

    scrollToContent.mockRestore();
    document.removeEventListener(
      "excalidraw:presentationSlideChange",
      handleSlideChange,
    );
  });

  it("exits formal presentation when no playable frame remains", async () => {
    const onlyFrame = createFrame("frame-only");
    API.setElements([onlyFrame]);
    API.setAppState({
      slideOrder: [onlyFrame.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await waitFor(() => {
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    API.updateScene({
      elements: [
        {
          ...onlyFrame,
          customData: { excludeFromPresentation: true },
        },
      ],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    await waitFor(() => {
      expect(h.state.presentationMode).toBe(false);
    });
  });

  it.each([
    {
      name: "removes the field when true changes to false",
      initiallyExcluded: true,
      nextValue: false,
    },
    {
      name: "removes the field when true changes to a non-boolean value",
      initiallyExcluded: true,
      nextValue: 1,
    },
    {
      name: "ignores undefined changing to false",
      initiallyExcluded: false,
      nextValue: false,
    },
  ])("$name", async ({ initiallyExcluded, nextValue }) => {
    const first = createFrame("frame-a", { x: 0 });
    const target = {
      ...createFrame("frame-b", {
        excluded: initiallyExcluded,
        x: 200,
      }),
      customData: {
        ...(initiallyExcluded ? { excludeFromPresentation: true } : {}),
        slideNoteHtml: "<p>keep me</p>",
      },
    };
    API.setElements([first, target]);
    API.setAppState({
      slideOrder: [first.id, target.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await waitFor(() => {
      expect(
        screen.getByText(initiallyExcluded ? "1 / 1" : "1 / 2"),
      ).toBeInTheDocument();
    });

    API.updateScene({
      elements: [
        first,
        {
          ...target,
          customData: {
            ...target.customData,
            excludeFromPresentation: nextValue,
          } as any,
        },
      ],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    await waitFor(() => {
      const storedTarget = h.elements.find(
        (element) => element.id === target.id,
      );
      expect(
        Object.prototype.hasOwnProperty.call(
          storedTarget?.customData,
          "excludeFromPresentation",
        ),
      ).toBe(false);
      expect(storedTarget?.customData?.slideNoteHtml).toBe("<p>keep me</p>");
    });
  });

  it("blocks unrelated frame changes while presenting", async () => {
    const frame = createFrame("frame-only", { x: 0 });
    API.setElements([frame]);
    API.setAppState({
      slideOrder: [frame.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await waitFor(() => {
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    API.updateScene({
      elements: [{ ...frame, x: 500 }],
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(h.elements.find((element) => element.id === frame.id)?.x).toBe(0);
  });

  it("preserves deleted frame tombstones during non-deleted scene replacement", async () => {
    const tombstone = {
      ...createFrame("frame-deleted", { x: 0 }),
      isDeleted: true,
    };
    const playable = createFrame("frame-live", { x: 200 });
    API.setElements([tombstone, playable]);
    API.setAppState({
      slideOrder: [playable.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await waitFor(() => {
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });

    API.updateScene({
      elements: h.app.scene.getNonDeletedElements(),
      captureUpdate: CaptureUpdateAction.NEVER,
    });

    expect(
      h.app
        .getSceneElementsIncludingDeleted()
        .some((element) => element.id === tombstone.id && element.isDeleted),
    ).toBe(true);
  });

  it.each([
    { mutation: "exclude" as const, versionOffset: 0 },
    { mutation: "delete" as const, versionOffset: -1 },
  ])(
    "normalizes $mutation changes with non-increasing external versions",
    async ({ mutation, versionOffset }) => {
      const first = createFrame("frame-a", { x: 0 });
      const target = createFrame("frame-b", { x: 200 });
      API.setElements([first, target]);
      API.setAppState({
        slideOrder: [first.id, target.id],
        presentationMode: true,
        presentationSlideIndex: 0,
      });
      await waitFor(() => {
        expect(screen.getByText("1 / 2")).toBeInTheDocument();
      });

      const externalTarget = {
        ...target,
        version: Math.max(0, target.version + versionOffset),
        versionNonce: target.versionNonce,
        ...(mutation === "exclude"
          ? { customData: { excludeFromPresentation: true } }
          : { isDeleted: true }),
      };
      API.updateScene({
        elements: [first, externalTarget],
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      await waitFor(() => {
        const storedTarget = h.app
          .getSceneElementsIncludingDeleted()
          .find((element) => element.id === target.id);
        expect(storedTarget?.version).toBeGreaterThan(target.version);
        expect(storedTarget?.versionNonce).not.toBe(target.versionNonce);
        if (mutation === "exclude") {
          expect(storedTarget?.customData?.excludeFromPresentation).toBe(true);
        } else {
          expect(storedTarget?.isDeleted).toBe(true);
        }
      });
    },
  );
});
