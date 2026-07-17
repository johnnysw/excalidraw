import React from "react";

import { CODES, FONT_FAMILY } from "@excalidraw/common";

import type { ExcalidrawTextElement } from "@excalidraw/element/types";

import { copiedStyles } from "../actions/actionStyles";
import { Excalidraw } from "../index";
import { API } from "../tests/helpers/api";
import { Keyboard, Pointer, UI } from "../tests/helpers/ui";
import {
  act,
  fireEvent,
  render,
  screen,
  togglePopover,
} from "../tests/test-utils";

const { h } = window;

const mouse = new Pointer("mouse");

describe("actionStyles", () => {
  beforeEach(async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);
  });

  afterEach(async () => {
    // https://github.com/floating-ui/floating-ui/issues/1908#issuecomment-1301553793
    // affects node v16+
    await act(async () => {});
  });

  it("should copy & paste styles via keyboard", async () => {
    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    UI.clickTool("rectangle");
    mouse.down(10, 10);
    mouse.up(20, 20);

    // Change some styles of second rectangle
    togglePopover("Stroke");
    UI.clickOnTestId("color-red");
    togglePopover("Background");
    UI.clickOnTestId("color-blue");
    // Fill style
    fireEvent.click(screen.getByTitle("Cross-hatch"));
    // Stroke width
    fireEvent.click(screen.getByTitle("Bold"));
    // Stroke style
    fireEvent.click(screen.getByTitle("Dotted"));
    // Roughness
    fireEvent.click(screen.getByTitle("Cartoonist"));
    // Opacity
    fireEvent.change(screen.getByTestId("opacity"), {
      target: { value: "60" },
    });

    mouse.reset();

    API.setSelectedElements([h.elements[1]]);

    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
      Keyboard.codeDown(CODES.C);
    });
    const secondRect = JSON.parse(copiedStyles)[0];
    expect(secondRect.id).toBe(h.elements[1].id);

    mouse.reset();
    // Paste styles to first rectangle
    API.setSelectedElements([h.elements[0]]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
      Keyboard.codeDown(CODES.V);
    });

    const firstRect = API.getSelectedElement();
    expect(firstRect.id).toBe(h.elements[0].id);
    expect(firstRect.strokeColor).toBe("#e03131");
    expect(firstRect.backgroundColor).toBe("#a5d8ff");
    expect(firstRect.fillStyle).toBe("cross-hatch");
    expect(firstRect.strokeWidth).toBe(2); // Bold: 2
    expect(firstRect.strokeStyle).toBe("dotted");
    expect(firstRect.roughness).toBe(2); // Cartoonist: 2
    expect(firstRect.opacity).toBe(60);
  });

  it("pastes complete base text formatting and clears local ranges", () => {
    const source = {
      ...API.createElement({
        type: "text",
        text: "source",
        strokeColor: "#e03131",
        fontSize: 32,
        fontFamily: FONT_FAMILY.Cascadia,
        textAlign: "center",
        verticalAlign: "middle",
      }),
      fontWeight: "bold" as const,
      textOutlineColor: "#00ff00",
      textOutlineWidth: 2,
    } as ExcalidrawTextElement;
    const target = {
      ...API.createElement({
        type: "text",
        text: "target",
        strokeColor: "#000000",
      }),
      textStyleRanges: [{ start: 0, end: 3, color: "#0000ff", fontSize: 48 }],
    } as ExcalidrawTextElement;
    API.setElements([source, target]);

    API.setSelectedElements([source]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
      Keyboard.codeDown(CODES.C);
    });
    API.setSelectedElements([target]);
    Keyboard.withModifierKeys({ ctrl: true, alt: true }, () => {
      Keyboard.codeDown(CODES.V);
    });

    const updated = h.elements[1] as ExcalidrawTextElement;
    expect(updated).toMatchObject({
      strokeColor: "#e03131",
      fontSize: 32,
      fontFamily: FONT_FAMILY.Cascadia,
      fontWeight: "bold",
      textAlign: "center",
      verticalAlign: "middle",
      textOutlineColor: "#00ff00",
      textOutlineWidth: 2,
    });
    expect(updated.textStyleRanges).toBeUndefined();
    expect(updated.richTextRanges).toBeUndefined();
  });
});
