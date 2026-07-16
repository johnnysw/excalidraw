import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DurationInput } from "./DurationInput";

describe("DurationInput", () => {
  it("allows an empty draft and normalizes it on blur", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <DurationInput value={800} onCommit={onCommit} />,
    );
    const input = getByRole("spinbutton") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("800");
  });

  it("does not commit an unchanged value on blur", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <DurationInput value={800} onCommit={onCommit} />,
    );

    fireEvent.blur(getByRole("spinbutton"));

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("clamps and commits on Enter", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <DurationInput value={800} onCommit={onCommit} />,
    );
    const input = getByRole("spinbutton") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "4000" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith(3000);
    expect(input.value).toBe("3000");
  });

  it("restores the saved value on Escape", () => {
    const onCommit = vi.fn();
    const { getByRole } = render(
      <DurationInput value={200} onCommit={onCommit} />,
    );
    const input = getByRole("spinbutton") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "50" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("200");
  });
});
