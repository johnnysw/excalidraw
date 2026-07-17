import { newTextElement } from "@excalidraw/element";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { getSyncableElements } from ".";

describe("getSyncableElements rich text", () => {
  it("emits canonical text style ranges without legacy fields", () => {
    const text = {
      ...newTextElement({
        x: 0,
        y: 0,
        text: "abcd",
        strokeColor: "#000000",
      }),
      textStyleRanges: [{ start: -1, end: 9, fontWeight: "bold" as const }],
      richTextRanges: [{ start: 1, end: 3, color: "#ff0000" }],
    } as unknown as OrderedExcalidrawElement;

    const syncedText = getSyncableElements([text])[0];

    expect(syncedText).not.toHaveProperty("richTextRanges");
    expect(syncedText).toMatchObject({
      textStyleRanges: [
        { start: 0, end: 1, fontWeight: "bold" },
        { start: 1, end: 3, color: "#ff0000", fontWeight: "bold" },
        { start: 3, end: 4, fontWeight: "bold" },
      ],
    });
  });
});
