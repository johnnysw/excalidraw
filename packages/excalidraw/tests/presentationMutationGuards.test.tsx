import React from "react";
import { vi } from "vitest";

import { CaptureUpdateAction } from "@excalidraw/element";

import type { Scene } from "@excalidraw/element/Scene";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import App from "../components/App";
import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { act, render, unmountComponent } from "./test-utils";

const { h } = window;

const createAnnotation = (id: string, sessionId?: string) => ({
  ...API.createElement({ type: "freedraw", id }),
  customData: sessionId ? { annotationSessionId: sessionId } : undefined,
});

const updateElements = (elements: readonly ExcalidrawElement[]) => {
  API.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
};

describe.each([false, true])("presentation guards with StrictMode=%s", (strict) => {
  beforeEach(() => {
    unmountComponent();
  });

  afterEach(() => {
    unmountComponent();
    vi.restoreAllMocks();
  });

  const setup = async () => {
    const willUnmount = vi.spyOn(App.prototype, "componentWillUnmount");
    const editor = <Excalidraw />;
    await render(strict ? <React.StrictMode>{editor}</React.StrictMode> : editor);
    // A StrictMode mount must exercise the real scene destruction/recreation.
    expect(willUnmount).toHaveBeenCalledTimes(strict ? 1 : 0);
    const context = (
      h.app as unknown as { elementsContextValue: { scene: Scene | null } }
    ).elementsContextValue;
    expect(context.scene).toBe(h.app.scene);

    const frame = API.createElement({ type: "frame", id: "slide" });
    const body = API.createElement({ type: "rectangle", id: "content" });
    const previousAnnotation = createAnnotation("previous", "previous-session");
    API.setElements([frame, body, previousAnnotation]);
    API.setAppState({ presentationMode: true });
    expect(h.state.presentationMode).toBe(true);
    expect(h.state.presentationAnnotationSessionId).toBeTruthy();
    return { body, previousAnnotation };
  };

  it("keeps current-session ink editable and removable after it enters the scene", async () => {
    await setup();
    const annotation = createAnnotation(
      "current",
      h.state.presentationAnnotationSessionId!,
    );
    updateElements([...h.elements, annotation]);
    const stored = h.app.scene.getElement(annotation.id)!;
    expect(stored).toBeDefined();

    API.updateElement(stored, { strokeColor: "#ff0000" });
    expect(stored.strokeColor).toBe("#ff0000");
    updateElements(
      h.elements.map((element) =>
        element.id === stored.id ? { ...element, x: 175 } : element,
      ),
    );
    expect(h.app.scene.getElement(stored.id)?.x).toBe(175);

    API.updateElement(h.app.scene.getElement(stored.id)!, { isDeleted: true });
    expect(h.app.scene.getNonDeletedElement(stored.id)).toBeNull();
    updateElements(h.elements.filter((element) => element.id !== stored.id));
    expect(h.app.scene.getElement(stored.id)).toBeNull();
  });

  it("rejects unmarked or other-session ink and protects existing slide content", async () => {
    const { body, previousAnnotation } = await setup();
    const unmarked = createAnnotation("unmarked");
    const wrongSession = createAnnotation("wrong", "other-session");
    const markedBody = {
      ...API.createElement({ type: "rectangle", id: "marked-content" }),
      customData: {
        annotationSessionId: h.state.presentationAnnotationSessionId!,
      },
    };
    updateElements([
      ...h.elements.map((element) => ({ ...element, x: 300 })),
      unmarked,
      wrongSession,
      markedBody,
    ]);

    expect(h.app.scene.getElement(unmarked.id)).toBeNull();
    expect(h.app.scene.getElement(wrongSession.id)).toBeNull();
    expect(h.app.scene.getElement(markedBody.id)).toBeNull();
    expect(h.app.scene.getElement(body.id)?.x).toBe(body.x);
    expect(h.app.scene.getElement(previousAnnotation.id)?.x).toBe(
      previousAnnotation.x,
    );

    API.updateElement(h.app.scene.getElement(body.id)!, { x: 300 });
    API.updateElement(h.app.scene.getElement(previousAnnotation.id)!, {
      isDeleted: true,
    });
    expect(h.app.scene.getElement(body.id)?.x).toBe(body.x);
    expect(h.app.scene.getElement(previousAnnotation.id)?.isDeleted).toBe(false);
    updateElements(h.elements.filter((element) => element.type === "frame"));
    expect(h.app.scene.getElement(body.id)).toBeDefined();
    expect(h.app.scene.getElement(previousAnnotation.id)).toBeDefined();
  });

  it("promotes kept ink to protected content until presentation ends", async () => {
    await setup();
    const annotation = {
      ...createAnnotation("kept", h.state.presentationAnnotationSessionId!),
      customData: {
        annotationSessionId: h.state.presentationAnnotationSessionId!,
        speakerStrokeId: "stroke-to-keep",
      },
    };
    updateElements([...h.elements, annotation]);
    const stored = h.app.scene.getElement(annotation.id)!;
    const versionBeforeKeep = stored.version;
    const { annotationSessionId, ...persistentData } = stored.customData!;
    expect(annotationSessionId).toBe(h.state.presentationAnnotationSessionId);
    act(() => {
      h.app.mutateElement(stored, { customData: persistentData });
    });
    expect(stored.version).toBeGreaterThan(versionBeforeKeep);
    expect(stored.customData).toEqual({ speakerStrokeId: "stroke-to-keep" });
    expect(h.app.scene.getNonDeletedElement(stored.id)).toBe(stored);

    updateElements(
      h.elements.map((element) =>
        element.id === stored.id ? { ...element, x: 325 } : element,
      ),
    );
    expect(h.app.scene.getElement(stored.id)?.x).toBe(0);
    updateElements(h.elements.filter((element) => element.id !== stored.id));
    expect(h.app.scene.getNonDeletedElement(stored.id)).toBe(stored);
    API.updateElement(stored, { x: 325 });
    expect(stored.x).toBe(0);

    API.setAppState({ presentationMode: false });
    API.updateElement(stored, { x: 325 });
    expect(h.app.scene.getNonDeletedElement(stored.id)?.x).toBe(325);
  });

  it("allows ordinary editing after leaving presentation", async () => {
    const { body } = await setup();
    API.setAppState({ presentationMode: false });
    const unmarked = createAnnotation("ordinary-ink");
    const newBody = API.createElement({ type: "rectangle", id: "new-content" });
    updateElements([...h.elements, unmarked, newBody]);
    expect(h.app.scene.getElement(unmarked.id)).toBeDefined();
    expect(h.app.scene.getElement(newBody.id)).toBeDefined();

    API.updateElement(h.app.scene.getElement(body.id)!, { x: 325 });
    expect(h.app.scene.getElement(body.id)?.x).toBe(325);
    updateElements(h.elements.filter((element) => element.id !== body.id));
    expect(h.app.scene.getElement(body.id)).toBeNull();
  });
});
