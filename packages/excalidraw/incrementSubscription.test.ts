import { Emitter } from "@excalidraw/common";

import { createIncrementSubscriptionController } from "./incrementSubscription";

describe("increment subscription controller", () => {
  it("keeps the emitter subscriber-free while the handler is undefined", () => {
    const emitter = new Emitter<[number]>();
    const controller = createIncrementSubscriptionController(
      emitter,
      () => undefined,
    );

    controller.sync();

    expect(controller.isSubscribed()).toBe(false);
    expect(emitter.subscribers).toHaveLength(0);
  });

  it("enables, updates, and disables the subscription dynamically", () => {
    const emitter = new Emitter<[number]>();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    let handler: ((value: number) => void) | undefined = firstHandler;
    const controller = createIncrementSubscriptionController(
      emitter,
      () => handler,
    );

    controller.sync();
    expect(emitter.subscribers).toHaveLength(1);
    emitter.trigger(1);
    expect(firstHandler).toHaveBeenCalledWith(1);

    handler = secondHandler;
    controller.sync();
    expect(emitter.subscribers).toHaveLength(1);
    emitter.trigger(2);
    expect(secondHandler).toHaveBeenCalledWith(2);

    handler = undefined;
    controller.sync();
    expect(controller.isSubscribed()).toBe(false);
    expect(emitter.subscribers).toHaveLength(0);
  });
});
