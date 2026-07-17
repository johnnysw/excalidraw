import React from "react";

import { FONT_FAMILY, SVG_NS } from "@excalidraw/common";

import type { ExcalidrawTextElement, FileId } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { getDataURL } from "../data/blob";
import { encodePngMetadata } from "../data/image";
import { serializeAsJSON } from "../data/json";
import { Excalidraw } from "../index";
import {
  decodeSvgBase64Payload,
  encodeSvgBase64Payload,
  exportToSvg,
} from "../scene/export";

import { API } from "./helpers/api";
import { render, waitFor } from "./test-utils";

const { h } = window;

const testElements = [
  {
    ...API.createElement({
      type: "text",
      id: "A",
      text: "😀",
    }),
    // can't get jsdom text measurement to work so this is a temp hack
    // to ensure the element isn't stripped as invisible
    width: 16,
    height: 16,
  },
];

// tiny polyfill for TextDecoder.decode on which we depend
Object.defineProperty(window, "TextDecoder", {
  value: class TextDecoder {
    decode(ab: ArrayBuffer) {
      return new Uint8Array(ab).reduce(
        (acc, c) => acc + String.fromCharCode(c),
        "",
      );
    }
  },
});

describe("export", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("export embedded png and reimport", async () => {
    const pngBlob = await API.loadFile("./fixtures/smiley.png");
    const pngBlobEmbedded = await encodePngMetadata({
      blob: pngBlob,
      metadata: serializeAsJSON(testElements, h.state, {}, "local"),
    });
    await API.drop([{ kind: "file", file: pngBlobEmbedded }]);

    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({ type: "text", text: "😀" }),
      ]);
    });
  });

  it("test encoding/decoding scene for SVG export", async () => {
    const metadataElement = document.createElementNS(SVG_NS, "metadata");

    encodeSvgBase64Payload({
      metadataElement,
      payload: serializeAsJSON(testElements, h.state, {}, "local"),
    });

    const decoded = JSON.parse(
      decodeSvgBase64Payload({ svg: metadataElement.innerHTML }),
    );
    expect(decoded.elements).toEqual([
      expect.objectContaining({ type: "text", text: "😀" }),
    ]);
  });

  it("export svg-embedded scene", async () => {
    const svg = await exportToSvg(
      testElements,
      { ...getDefaultAppState(), exportEmbedScene: true },
      {},
    );
    const svgText = svg.outerHTML;

    expect(svgText).toMatchSnapshot(`svg-embdedded scene export output`);
  });

  it("import embedded png (legacy v1)", async () => {
    await API.drop([
      {
        kind: "file",
        file: await API.loadFile("./fixtures/test_embedded_v1.png"),
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({ type: "text", text: "test" }),
      ]);
    });
  });

  it("import embedded png (v2)", async () => {
    await API.drop([
      {
        kind: "file",
        file: await API.loadFile("./fixtures/smiley_embedded_v2.png"),
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({ type: "text", text: "😀" }),
      ]);
    });
  });

  it("import embedded svg (legacy v1)", async () => {
    await API.drop([
      {
        kind: "file",
        file: await API.loadFile("./fixtures/test_embedded_v1.svg"),
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({ type: "text", text: "test" }),
      ]);
    });
  });

  it("import embedded svg (v2)", async () => {
    await API.drop([
      {
        kind: "file",
        file: await API.loadFile("./fixtures/smiley_embedded_v2.svg"),
      },
    ]);
    await waitFor(() => {
      expect(h.elements).toEqual([
        expect.objectContaining({ type: "text", text: "😀" }),
      ]);
    });
  });

  it("exporting svg containing transformed images", async () => {
    const normalizeAngle = (angle: number) => (angle / 180) * Math.PI;

    const elements = [
      API.createElement({
        type: "image",
        fileId: "file_A",
        x: 0,
        y: 0,
        scale: [1, 1],
        width: 100,
        height: 100,
        angle: normalizeAngle(315),
      }),
      API.createElement({
        type: "image",
        fileId: "file_A",
        x: 100,
        y: 0,
        scale: [-1, 1],
        width: 50,
        height: 50,
        angle: normalizeAngle(45),
      }),
      API.createElement({
        type: "image",
        fileId: "file_A",
        x: 0,
        y: 100,
        scale: [1, -1],
        width: 100,
        height: 100,
        angle: normalizeAngle(45),
      }),
      API.createElement({
        type: "image",
        fileId: "file_A",
        x: 100,
        y: 100,
        scale: [-1, -1],
        width: 50,
        height: 50,
        angle: normalizeAngle(315),
      }),
    ];
    const appState = { ...getDefaultAppState(), exportBackground: false };
    const files = {
      file_A: {
        id: "file_A" as FileId,
        dataURL: await getDataURL(await API.loadFile("./fixtures/deer.png")),
        mimeType: "image/png",
        created: Date.now(),
        lastRetrieved: Date.now(),
      },
    } as const;

    const svg = await exportToSvg(elements, appState, files);

    const svgText = svg.outerHTML;

    // expect 1 <image> element (deduped)
    expect(svgText.match(/<image/g)?.length).toBe(1);
    // expect 4 <use> elements (one for each excalidraw image element)
    expect(svgText.match(/<use/g)?.length).toBe(4);

    // in case of regressions, save the SVG to a file and visually compare to:
    // src/tests/fixtures/svg-image-exporting-reference.svg
    expect(svgText).toMatchSnapshot(`svg export output`);
  });

  it("exports mixed text runs and outlines as SVG tspans", async () => {
    const previousFlag = window.EXCALIDRAW_RICH_TEXT_V2;
    window.EXCALIDRAW_RICH_TEXT_V2 = true;
    try {
      const text = {
        ...API.createElement({
          type: "text",
          id: "rich-text-svg",
          text: "ABC",
          fontSize: 20,
          fontFamily: FONT_FAMILY.Helvetica,
          strokeColor: "#000000",
        }),
        width: 100,
        height: 40,
        textStyleRanges: [
          {
            start: 1,
            end: 2,
            color: "#ff0000",
            fontSize: 30,
            fontFamily: FONT_FAMILY.Cascadia,
            fontWeight: "bold" as const,
            textOutlineColor: "#00ff00",
            textOutlineWidth: 2,
          },
        ],
      } as ExcalidrawTextElement;

      const svg = await exportToSvg([text], getDefaultAppState(), {});
      const runs = [...svg.querySelectorAll("tspan")];

      expect(runs.map((run) => run.textContent)).toEqual(["A", "B", "C"]);
      expect(runs[1].getAttribute("fill")).toBe("#ff0000");
      expect(runs[1].getAttribute("font-size")).toBe("30px");
      expect(runs[1].getAttribute("font-weight")).toBe("bold");
      expect(runs[1].getAttribute("stroke")).toBe("#00ff00");
      expect(runs[1].getAttribute("stroke-width")).toBe("2");
      expect(runs[1].getAttribute("paint-order")).toBe("stroke fill");
    } finally {
      window.EXCALIDRAW_RICH_TEXT_V2 = previousFlag;
    }
  });
});
