import { describe, expect, it, vi } from "vitest";

import {
  ANIMATION_DEFAULT_DURATION,
  ANIMATION_MAX_DURATION,
  ANIMATION_MIN_DURATION,
  buildAnimationPlaybackSteps,
  easeInOutCubic,
  getAnimationPreviewInitialDelay,
  getAnimationSlideOffset,
  getAnimatedElementOpacity,
  getAnimationStepConfig,
  getPresentationAutoAdvanceDelay,
  normalizeAnimationDuration,
  runAnimationProgress,
  schedulePresentationAutoAdvance,
} from "./animationPlayback";
import type { AnimationEvent, ElementAnimation } from "./types";

const event = (
  id: string,
  order: number,
  duration: number,
  startMode: AnimationEvent["startMode"],
): AnimationEvent => ({
  id,
  order,
  elements: [`element-${id}`],
  type: "fadeIn",
  duration,
  startMode,
});

describe("normalizeAnimationDuration", () => {
  it.each([undefined, 0, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to the default for %s",
    (value) => {
      expect(normalizeAnimationDuration(value)).toBe(
        ANIMATION_DEFAULT_DURATION,
      );
    },
  );

  it("clamps finite durations to the supported range", () => {
    expect(normalizeAnimationDuration(1)).toBe(ANIMATION_MIN_DURATION);
    expect(normalizeAnimationDuration(3200)).toBe(ANIMATION_MAX_DURATION);
    expect(normalizeAnimationDuration(1600)).toBe(1600);
  });
});

describe("buildAnimationPlaybackSteps", () => {
  it("groups withPrevious events and uses the longest duration", () => {
    const steps = buildAnimationPlaybackSteps([
      event("a", 1, 800, "onClick"),
      event("b", 2, 1600, "withPrevious"),
      event("c", 3, 400, "afterPrevious"),
    ]);

    expect(steps).toEqual([
      expect.objectContaining({
        stepGroup: 1,
        duration: 1600,
        startMode: "onClick",
        previewGap: 500,
      }),
      expect.objectContaining({
        stepGroup: 2,
        duration: 400,
        startMode: "afterPrevious",
        previewGap: 50,
      }),
    ]);
    expect(steps[0].events.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("uses the configured gap before the first preview step", () => {
    const afterPreviousSteps = buildAnimationPlaybackSteps([
      event("a", 1, 800, "afterPrevious"),
    ]);
    const onClickSteps = buildAnimationPlaybackSteps([
      event("a", 1, 800, "onClick"),
    ]);

    expect(getAnimationPreviewInitialDelay(afterPreviousSteps)).toBe(50);
    expect(getAnimationPreviewInitialDelay(onClickSteps)).toBe(500);
  });
});

describe("animation geometry", () => {
  it("uses the frame width for horizontal slides and clamps the result", () => {
    expect(
      getAnimationSlideOffset("slideInLeft", { width: 1000, height: 500 }),
    ).toEqual({ x: -180, y: 0 });
    expect(
      getAnimationSlideOffset("slideInRight", { width: 200, height: 500 }),
    ).toEqual({ x: 120, y: 0 });
    expect(
      getAnimationSlideOffset("slideInRight", { width: 4000, height: 500 }),
    ).toEqual({ x: 480, y: 0 });
  });

  it("uses the frame height for vertical slides", () => {
    expect(
      getAnimationSlideOffset("slideInTop", { width: 2000, height: 1000 }),
    ).toEqual({ x: 0, y: -180 });
    expect(
      getAnimationSlideOffset("slideInBottom", { width: 2000, height: 1000 }),
    ).toEqual({ x: 0, y: 180 });
  });
});

describe("getAnimatedElementOpacity", () => {
  it("preserves the element opacity while applying animation alpha", () => {
    expect(getAnimatedElementOpacity(50, 0.5)).toBe(25);
    expect(getAnimatedElementOpacity(80, 1)).toBe(80);
  });
});

describe("getAnimationStepConfig", () => {
  it("preserves a valid duration below the default", () => {
    expect(
      getAnimationStepConfig(
        [
          {
            animation: {
              type: "fadeIn",
              duration: 400,
              stepGroup: 1,
              trigger: "click",
              startMode: "onClick",
            },
          },
        ],
        1,
      ),
    ).toEqual({ duration: 400, startMode: "onClick" });
  });

  it("uses the first event start mode and longest duration in the step", () => {
    const animations: ElementAnimation[] = [
      {
        type: "fadeIn",
        duration: 800,
        stepGroup: 2,
        trigger: "click",
        startMode: "afterPrevious",
        order: 2,
      },
      {
        type: "slideInLeft",
        duration: 1600,
        stepGroup: 2,
        trigger: "click",
        startMode: "withPrevious",
        order: 3,
      },
    ];

    expect(
      getAnimationStepConfig(
        animations.map((animation) => ({
          animation,
        })),
        2,
      ),
    ).toEqual({ duration: 1600, startMode: "afterPrevious" });
  });

  it("returns the presentation auto-advance delay only for afterPrevious", () => {
    expect(getPresentationAutoAdvanceDelay("afterPrevious")).toBe(50);
    expect(getPresentationAutoAdvanceDelay("onClick")).toBeNull();
  });
});

describe("runAnimationProgress", () => {
  const createScheduler = () => {
    let callback: ((timestamp: number) => void) | undefined;
    let nextId = 0;
    const cancelFrame = vi.fn();

    return {
      scheduler: {
        now: () => 0,
        requestFrame: (nextCallback: (timestamp: number) => void) => {
          callback = nextCallback;
          nextId += 1;
          return nextId;
        },
        cancelFrame,
      },
      advanceTo: (timestamp: number) => callback?.(timestamp),
      cancelFrame,
    };
  };

  it("reports eased half progress at 400ms and completes at 800ms", () => {
    const scheduler = createScheduler();
    const onProgress = vi.fn();
    const onComplete = vi.fn();

    runAnimationProgress({
      duration: 800,
      onProgress,
      onComplete,
      ...scheduler.scheduler,
    });

    expect(onProgress).toHaveBeenLastCalledWith(0);

    scheduler.advanceTo(400);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    expect(onComplete).not.toHaveBeenCalled();

    scheduler.advanceTo(800);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does not finish a 1600ms animation at 800ms", () => {
    const scheduler = createScheduler();
    const onComplete = vi.fn();

    runAnimationProgress({
      duration: 1600,
      onProgress: vi.fn(),
      onComplete,
      ...scheduler.scheduler,
    });

    scheduler.advanceTo(800);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancels the scheduled frame and suppresses completion", () => {
    const scheduler = createScheduler();
    const onComplete = vi.fn();
    const cancel = runAnimationProgress({
      duration: 800,
      onProgress: vi.fn(),
      onComplete,
      ...scheduler.scheduler,
    });

    cancel();
    scheduler.advanceTo(800);

    expect(scheduler.cancelFrame).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("schedulePresentationAutoAdvance", () => {
  it("runs after 50ms and can be cancelled", () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();

    schedulePresentationAutoAdvance(50, onAdvance);
    vi.advanceTimersByTime(49);
    expect(onAdvance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onAdvance).toHaveBeenCalledTimes(1);

    const cancelledAdvance = vi.fn();
    const cancel = schedulePresentationAutoAdvance(50, cancelledAdvance);
    cancel();
    vi.advanceTimersByTime(50);
    expect(cancelledAdvance).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
