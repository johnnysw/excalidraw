import React from "react";

import { DEFAULT_SIDEBAR, PRESENTATION_SIDEBAR_TAB } from "@excalidraw/common";

import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { act, fireEvent, render, screen, waitFor } from "../tests/test-utils";

const { h } = window;

const frame = (id: string, x = 0) =>
  API.createElement({ type: "frame", id, x, y: 0 });

describe("presenter session entry and local commands", () => {
  beforeEach(async () => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    await render(<Excalidraw />);
  });

  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
    vi.restoreAllMocks();
  });

  it.each(["footer", "frame", "menu"])(
    "%s delegates window creation synchronously before fullscreen",
    async (entry) => {
      const first = frame("first");
      API.setElements([first]);
      const events: string[] = [];
      const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
      const onOpen = (event: Event) => {
        expect(event.target).toBe(h.app.excalidrawContainerRef.current);
        expect((event as CustomEvent).detail.frameId).toBe(first.id);
        events.push("open");
      };
      document.addEventListener("excalidraw:openPresenter", onOpen);
      vi.mocked(HTMLElement.prototype.requestFullscreen).mockImplementation(() => {
        events.push("fullscreen");
        return Promise.resolve();
      });
      try {
        if (entry === "footer") {
          fireEvent.click(document.querySelector<HTMLButtonElement>(
            ".layer-ui__wrapper__footer-right button.App-menu__left-btn",
          )!);
          fireEvent.click(screen.getByText("演讲者视图"));
        } else if (entry === "frame") {
          API.setSelectedElements([first]);
          fireEvent.click(screen.getByTitle("演讲者视图"));
        } else {
          API.setAppState({
            openSidebar: {
              name: DEFAULT_SIDEBAR.name,
              tab: PRESENTATION_SIDEBAR_TAB,
            },
          });
          fireEvent.click(await screen.findByTitle("演讲者视图"));
        }

        expect(events).toEqual(["open", "fullscreen"]);
        expect(openWindow).not.toHaveBeenCalled();
        await waitFor(() => expect(h.state.presentationMode).toBe(true));
      } finally {
        document.removeEventListener("excalidraw:openPresenter", onOpen);
      }
    },
  );

  it("orders consecutive navigation commands and honors custom slide order", async () => {
    const first = frame("first");
    const second = frame("second", 400);
    const third = frame("third", 800);
    API.setElements([first, second, third]);
    API.setAppState({
      slideOrder: [third.id, first.id, second.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await screen.findByText("1 / 3");

    const command = (direction: "next" | "prev") =>
      h.app.excalidrawContainerRef.current!.dispatchEvent(new CustomEvent(
        "excalidraw:presenterCommand",
        { detail: { type: "navigate", direction }, bubbles: true },
      ));
    act(() => {
      command("next");
      command("next");
      command("next");
    });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    act(() => {
      command("prev");
      command("prev");
      command("prev");
    });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("advances animation steps before slides and restores previous slide steps", async () => {
    const first = frame("first");
    const second = frame("second", 400);
    const animated = {
      ...API.createElement({ type: "rectangle", frameId: first.id, x: 10, y: 10 }),
      animation: { type: "fadeIn", stepGroup: 2, duration: 400, startMode: "onClick", trigger: "click" } as const,
    };
    API.setElements([first, second, animated]);
    API.setAppState({
      slideOrder: [first.id, second.id],
      presentationMode: true,
      presentationSlideIndex: 0,
    });
    await screen.findByText("1 / 2");
    const command = (direction: "next" | "prev") => {
      act(() => {
        h.app.excalidrawContainerRef.current!.dispatchEvent(new CustomEvent(
          "excalidraw:presenterCommand",
          { detail: { type: "navigate", direction }, bubbles: true },
        ));
      });
    };
    command("next");
    expect(h.state.presentationStep).toBe(1);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    command("next");
    expect(h.state.presentationStep).toBe(2);
    command("next");
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    command("prev");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(h.state.presentationStep).toBe(2);
  });

  it("ignores commands from another editor and never writes presenter strokes", async () => {
    const first = frame("first");
    const second = frame("second", 400);
    API.setElements([first, second]);
    API.setAppState({ presentationMode: true, presentationSlideIndex: 0 });
    await screen.findByText("1 / 2");
    act(() => {
      document.body.dispatchEvent(new CustomEvent("excalidraw:presenterCommand", {
        detail: { type: "navigate", direction: "next" }, bubbles: true,
      }));
      for (const type of ["stroke-complete", "erase-stroke", "clear"]) {
        h.app.excalidrawContainerRef.current!.dispatchEvent(new CustomEvent(
          "excalidraw:presenterCommand", {
            detail: { type, stroke: { points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] } },
            bubbles: true,
          },
        ));
      }
    });
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(h.elements.map((element) => element.id)).toEqual([first.id, second.id]);
  });

  it("uses the latest pen settings for consecutive parameter and tool commands", async () => {
    API.setElements([frame("first")]);
    API.setAppState({ presentationMode: true, presentationSlideIndex: 0 });
    await screen.findByText("1 / 1");
    act(() => {
      for (const detail of [
        { type: "param-sync", tool: "pen", color: "#e03131", strokeWidth: 1.5 },
        { type: "tool-select", tool: "none" },
        { type: "tool-select", tool: "pen" },
      ]) {
        h.app.excalidrawContainerRef.current!.dispatchEvent(new CustomEvent(
          "excalidraw:presenterCommand", { detail, bubbles: true },
        ));
      }
    });
    expect(h.state.activeTool.type).toBe("freedraw");
    expect(h.state.currentItemStrokeColor).toBe("#e03131");
    expect(h.state.currentItemStrokeWidth).toBe(1.5);
  });
});
