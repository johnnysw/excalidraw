import { FONT_FAMILY } from "@excalidraw/common";

import { fillTextWithWeight } from "../src/renderElement";

describe("fillTextWithWeight", () => {
  it("applies the resolved run color before filling normal-weight text", () => {
    const context = {
      fillStyle: "#000000",
      fillText: vi.fn(),
      strokeText: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    fillTextWithWeight(
      context,
      "哈哈",
      0,
      20,
      20,
      FONT_FAMILY.Helvetica,
      "normal",
      "#2f9e44",
    );

    expect(context.fillStyle).toBe("#2f9e44");
    expect(context.fillText).toHaveBeenCalledWith("哈哈", 0, 20);
    expect(context.strokeText).not.toHaveBeenCalled();
  });
});
