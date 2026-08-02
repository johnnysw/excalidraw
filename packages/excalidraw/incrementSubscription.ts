import type { UnsubscribeCallback } from "./types";

type IncrementEmitter<TIncrement> = {
  on: (handler: (increment: TIncrement) => void) => UnsubscribeCallback;
};

export const createIncrementSubscriptionController = <TIncrement>(
  emitter: IncrementEmitter<TIncrement>,
  getHandler: () => ((increment: TIncrement) => void) | undefined,
) => {
  let unsubscribe: UnsubscribeCallback | null = null;

  const sync = () => {
    const shouldSubscribe = typeof getHandler() === "function";

    if (shouldSubscribe && !unsubscribe) {
      unsubscribe = emitter.on((increment) => {
        getHandler()?.(increment);
      });
    } else if (!shouldSubscribe && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const dispose = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  return {
    sync,
    dispose,
    isSubscribed: () => unsubscribe !== null,
  };
};
