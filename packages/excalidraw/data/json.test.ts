import { FONT_FAMILY } from "@excalidraw/common";

import { newTextElement } from "@excalidraw/element";

import { getDefaultAppState } from "../appState";
import { serializeAsJSON, serializeLibraryAsJSON } from "./json";

describe("rich text serialization", () => {
  const createLegacyTextElement = () => ({
    ...newTextElement({
      x: 0,
      y: 0,
      text: "abcd",
      fontFamily: FONT_FAMILY.Helvetica,
      strokeColor: "#000000",
      textStyleRanges: [
        { start: -2, end: 2, color: "#ff0000", fontSize: 30 },
        { start: 1, end: 8, fontWeight: "bold" },
      ],
    }),
    richTextRanges: [{ start: 1, end: 3, color: "#00ff00" }],
  });

  it("writes only normalized textStyleRanges to scene JSON", () => {
    const data = JSON.parse(
      serializeAsJSON(
        [createLegacyTextElement()],
        getDefaultAppState(),
        {},
        "local",
      ),
    );

    expect(data.elements[0]).not.toHaveProperty("richTextRanges");
    expect(data.elements[0].textStyleRanges).toEqual([
      { start: 0, end: 1, color: "#ff0000", fontSize: 30 },
      {
        start: 1,
        end: 2,
        color: "#00ff00",
        fontSize: 30,
        fontWeight: "bold",
      },
      { start: 2, end: 3, color: "#00ff00", fontWeight: "bold" },
      { start: 3, end: 4, fontWeight: "bold" },
    ]);
  });

  it("applies the same canonical model to library serialization", () => {
    const data = JSON.parse(
      serializeLibraryAsJSON([
        {
          id: "library-item",
          status: "unpublished",
          created: 1,
          elements: [createLegacyTextElement()],
        },
      ]),
    );

    expect(data.libraryItems[0].elements[0]).not.toHaveProperty(
      "richTextRanges",
    );
    expect(data.libraryItems[0].elements[0].textStyleRanges).toBeDefined();
  });
});
