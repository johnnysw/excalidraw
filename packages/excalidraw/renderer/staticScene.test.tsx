import React from "react";
import { cleanup, render } from "@testing-library/react";
import rough from "roughjs/bin/rough";

import { toBrandedType } from "@excalidraw/common";
import { Scene } from "@excalidraw/element";

import { getDefaultAppState } from "../appState";
import StaticCanvas from "../components/canvases/StaticCanvas";
import { Renderer } from "../scene/Renderer";

import { renderStaticScene } from "./staticScene";

import type { StaticSceneRenderConfig } from "../scene/types";

const createCanvas = (color: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 200;
  const context = canvas.getContext("2d")!;
  const paintedColors: (string | CanvasGradient | CanvasPattern)[] = [];
  vi.spyOn(context, "fillRect").mockImplementation(() => {
    paintedColors.push(context.fillStyle);
  });
  const config: StaticSceneRenderConfig = {
    canvas,
    rc: rough.canvas(canvas),
    scale: 1,
    elementsMap: toBrandedType<StaticSceneRenderConfig["elementsMap"]>(new Map()),
    allElementsMap: toBrandedType<StaticSceneRenderConfig["allElementsMap"]>(new Map()),
    visibleElements: [],
    appState: {
      ...getDefaultAppState(),
      width: 300,
      height: 200,
      offsetLeft: 0,
      offsetTop: 0,
      viewBackgroundColor: color,
    },
    renderConfig: {
      canvasBackgroundColor: color,
      imageCache: new Map(),
      renderGrid: false,
      isExporting: false,
      embedsValidationStatus: new Map(),
      elementsPendingErasure: new Set(),
      pendingFlowchartNodes: null,
    },
  };
  return { config, paintedColors };
};

const mountCanvas = (config: StaticSceneRenderConfig) =>
  render(
    <StaticCanvas
      canvas={config.canvas}
      rc={config.rc}
      scale={config.scale}
      appState={config.appState}
      renderConfig={config.renderConfig}
      sceneNonce={1}
      selectionNonce={1}
      readRenderData={() => ({
        elementsMap: config.elementsMap,
        allElementsMap: config.allElementsMap,
        visibleElements: config.visibleElements,
        selectedElements: [],
      })}
    />,
  );

describe("static scene canvas scheduling", () => {
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;

  beforeEach(() => {
    // Exercise production RAF scheduling; throttleRAF bypasses it in test mode.
    vi.stubEnv("MODE", "development");
    frames = new Map();
    frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const runFrame = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  };

  it("paints the latest update of each canvas in the same frame", () => {
    const first = createCanvas("#111111");
    const second = createCanvas("#222222");
    renderStaticScene(first.config, true);
    renderStaticScene(second.config, true);
    renderStaticScene(
      {
        ...first.config,
        appState: { ...first.config.appState, viewBackgroundColor: "#ff0000" },
      },
      true,
    );
    renderStaticScene(
      {
        ...second.config,
        appState: { ...second.config.appState, viewBackgroundColor: "#00ff00" },
      },
      true,
    );

    expect(first.paintedColors).toEqual([]);
    expect(second.paintedColors).toEqual([]);
    runFrame();

    expect(first.paintedColors).toEqual(["#ff0000"]);
    expect(second.paintedColors).toEqual(["#00ff00"]);
  });

  it("unmounting one canvas cancels only its pending paint", () => {
    const first = createCanvas("#ff0000");
    const second = createCanvas("#00ff00");
    mountCanvas(second.config);
    const firstView = mountCanvas(first.config);

    firstView.unmount();
    runFrame();

    expect(first.paintedColors).toEqual([]);
    expect(second.paintedColors).toEqual(["#00ff00"]);
  });

  it("destroying a scene renderer does not cancel another canvas paint", () => {
    const other = createCanvas("#00ff00");
    renderStaticScene(other.config, true);
    new Renderer(new Scene()).destroy();
    runFrame();

    expect(other.paintedColors).toEqual(["#00ff00"]);
  });

  it("does not overwrite a synchronous paint with an older pending frame", () => {
    const first = createCanvas("#ff0000");
    const second = createCanvas("#0000ff");
    renderStaticScene(second.config, true);
    renderStaticScene(first.config, true);
    renderStaticScene(
      {
        ...first.config,
        appState: { ...first.config.appState, viewBackgroundColor: "#00ff00" },
      },
      false,
    );
    expect(first.paintedColors).toEqual(["#00ff00"]);

    runFrame();

    expect(first.paintedColors).toEqual(["#00ff00"]);
    expect(second.paintedColors).toEqual(["#0000ff"]);
  });
});
