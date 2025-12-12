export const vibrate = (pattern: number | number[]): boolean => {
  try {
    return !!navigator.vibrate?.(pattern);
  } catch {
    return false;
  }
};

export const canVibrate = (): boolean => {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
};

export type HapticsController = {
  reset: () => void;
  maybeTrigger: (nextSignature: string | null) => void;
};

export const createHapticsController = (opts?: {
  throttleMs?: number;
  enterPattern?: number | number[];
  changePattern?: number | number[];
  exitPattern?: number | number[];
}): HapticsController => {
  const throttleMs = opts?.throttleMs ?? 120;
  const enterPattern = opts?.enterPattern ?? 8;
  const changePattern = opts?.changePattern ?? 6;
  const exitPattern = opts?.exitPattern ?? 4;

  let lastSignature: string | null = null;
  let lastTriggerAt = 0;

  const maybeVibrate = (pattern: number | number[]) => {
    if (!canVibrate()) {
      return;
    }
    const now = Date.now();
    if (now - lastTriggerAt < throttleMs) {
      return;
    }
    if (vibrate(pattern)) {
      lastTriggerAt = now;
    }
  };

  return {
    reset() {
      lastSignature = null;
      lastTriggerAt = 0;
    },
    maybeTrigger(nextSignature) {
      if (nextSignature === lastSignature) {
        return;
      }

      const wasSnapping = !!lastSignature;
      const isSnapping = !!nextSignature;

      if (!wasSnapping && isSnapping) {
        maybeVibrate(enterPattern);
      } else if (wasSnapping && isSnapping) {
        maybeVibrate(changePattern);
      } else if (wasSnapping && !isSnapping) {
        maybeVibrate(exitPattern);
      }

      lastSignature = nextSignature;
    },
  };
};
