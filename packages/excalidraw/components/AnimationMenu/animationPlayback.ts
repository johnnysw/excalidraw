import type {
  AnimationEvent,
  AnimationType,
  ElementAnimation,
  StartMode,
} from "./types";

export const ANIMATION_DEFAULT_DURATION_MS = 800;
export const ANIMATION_MIN_DURATION_MS = 100;
export const ANIMATION_MAX_DURATION_MS = 3000;
export const ANIMATION_PREVIEW_CLICK_GAP_MS = 500;
export const PRESENTATION_AUTO_ADVANCE_DELAY_MS = 50;

export const ANIMATION_DEFAULT_DURATION = ANIMATION_DEFAULT_DURATION_MS;
export const ANIMATION_MIN_DURATION = ANIMATION_MIN_DURATION_MS;
export const ANIMATION_MAX_DURATION = ANIMATION_MAX_DURATION_MS;
export const ANIMATION_PREVIEW_CLICK_GAP = ANIMATION_PREVIEW_CLICK_GAP_MS;
export const PRESENTATION_AUTO_ADVANCE_DELAY =
  PRESENTATION_AUTO_ADVANCE_DELAY_MS;

const SLIDE_DISTANCE_RATIO = 0.18;
const MIN_SLIDE_DISTANCE = 120;
const MAX_SLIDE_DISTANCE = 480;

export const normalizeAnimationDuration = (
  duration?: number | null,
): number => {
  if (!duration || !Number.isFinite(duration)) {
    return ANIMATION_DEFAULT_DURATION;
  }

  return Math.min(
    ANIMATION_MAX_DURATION,
    Math.max(ANIMATION_MIN_DURATION, duration),
  );
};

export const easeInOutCubic = (progress: number): number => {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return clampedProgress < 0.5
    ? 4 * clampedProgress * clampedProgress * clampedProgress
    : 1 - Math.pow(-2 * clampedProgress + 2, 3) / 2;
};

export const getAnimatedElementOpacity = (
  elementOpacity: number,
  animationProgress: number,
): number =>
  elementOpacity * Math.min(1, Math.max(0, animationProgress));

const getSlideDistance = (frameSize: number): number => {
  const distance = Number.isFinite(frameSize)
    ? frameSize * SLIDE_DISTANCE_RATIO
    : MIN_SLIDE_DISTANCE;
  return Math.min(MAX_SLIDE_DISTANCE, Math.max(MIN_SLIDE_DISTANCE, distance));
};

export const getAnimationSlideOffset = (
  animationType: AnimationType,
  frame: { width: number; height: number },
): { x: number; y: number } => {
  switch (animationType) {
    case "slideInLeft":
      return { x: -getSlideDistance(frame.width), y: 0 };
    case "slideInRight":
      return { x: getSlideDistance(frame.width), y: 0 };
    case "slideInTop":
      return { x: 0, y: -getSlideDistance(frame.height) };
    case "slideInBottom":
      return { x: 0, y: getSlideDistance(frame.height) };
    default:
      return { x: 0, y: 0 };
  }
};

export interface AnimationPlaybackStep {
  stepGroup: number;
  duration: number;
  startMode: Exclude<StartMode, "withPrevious">;
  previewGap: number;
  events: AnimationEvent[];
}

const normalizeStepStartMode = (
  startMode?: StartMode,
): Exclude<StartMode, "withPrevious"> =>
  startMode === "afterPrevious" ? "afterPrevious" : "onClick";

export const buildAnimationPlaybackSteps = (
  events: readonly AnimationEvent[],
): AnimationPlaybackStep[] => {
  const sortedEvents = [...events].sort((a, b) => a.order - b.order);
  const steps: AnimationPlaybackStep[] = [];

  for (const event of sortedEvents) {
    const previousStep = steps[steps.length - 1];
    if (event.startMode === "withPrevious" && previousStep) {
      previousStep.events.push(event);
      previousStep.duration = Math.max(
        previousStep.duration,
        normalizeAnimationDuration(event.duration),
      );
      continue;
    }

    const startMode = normalizeStepStartMode(event.startMode);
    steps.push({
      stepGroup: steps.length + 1,
      duration: normalizeAnimationDuration(event.duration),
      startMode,
      previewGap:
        startMode === "onClick"
          ? ANIMATION_PREVIEW_CLICK_GAP
          : PRESENTATION_AUTO_ADVANCE_DELAY,
      events: [event],
    });
  }

  return steps;
};

export const getAnimationPreviewInitialDelay = (
  steps: readonly AnimationPlaybackStep[],
): number => steps[0]?.previewGap ?? 0;

type ElementWithAnimation = {
  animation?: ElementAnimation | ElementAnimation[];
};

const normalizeElementAnimations = (
  animation?: ElementAnimation | ElementAnimation[],
): ElementAnimation[] => {
  if (!animation) {
    return [];
  }
  return Array.isArray(animation) ? animation : [animation];
};

export const getAnimationStepConfig = (
  elements: readonly ElementWithAnimation[],
  stepGroup: number,
): { duration: number; startMode: Exclude<StartMode, "withPrevious"> } => {
  const animations = elements
    .flatMap((element) => normalizeElementAnimations(element.animation))
    .filter((animation) => animation.stepGroup === stepGroup)
    .sort(
      (a, b) => (a.order ?? a.stepGroup ?? 0) - (b.order ?? b.stepGroup ?? 0),
    );

  return {
    duration:
      animations.length > 0
        ? Math.max(
            ...animations.map((animation) =>
              normalizeAnimationDuration(animation.duration),
            ),
          )
        : ANIMATION_DEFAULT_DURATION,
    startMode: normalizeStepStartMode(animations[0]?.startMode),
  };
};

export const getMaxAnimationStep = (
  elements: readonly ElementWithAnimation[],
): number =>
  elements.reduce((maxStep, element) => {
    for (const animation of normalizeElementAnimations(element.animation)) {
      if (Number.isFinite(animation.stepGroup)) {
        maxStep = Math.max(maxStep, animation.stepGroup);
      }
    }
    return maxStep;
  }, 0);

export const getPresentationAutoAdvanceDelay = (
  startMode: StartMode,
): number | null =>
  startMode === "afterPrevious" ? PRESENTATION_AUTO_ADVANCE_DELAY : null;

export const schedulePresentationAutoAdvance = (
  delay: number,
  onAdvance: () => void,
  scheduleTimeout: (callback: () => void, delay: number) => number = (
    callback,
    timeout,
  ) => window.setTimeout(callback, timeout),
  cancelTimeout: (timeoutId: number) => void = (timeoutId) =>
    window.clearTimeout(timeoutId),
): (() => void) => {
  const timeoutId = scheduleTimeout(onAdvance, delay);
  return () => cancelTimeout(timeoutId);
};

interface RunAnimationProgressOptions {
  duration?: number | null;
  onProgress: (progress: number) => void;
  onComplete?: () => void;
  now?: () => number;
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (frameId: number) => void;
}

export const runAnimationProgress = ({
  duration,
  onProgress,
  onComplete,
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (frameId) => cancelAnimationFrame(frameId),
}: RunAnimationProgressOptions): (() => void) => {
  const normalizedDuration = normalizeAnimationDuration(duration);
  const startTime = now();
  let frameId = 0;
  let isCancelled = false;

  const tick = (timestamp: number) => {
    if (isCancelled) {
      return;
    }

    const linearProgress = Math.min(
      1,
      Math.max(0, (timestamp - startTime) / normalizedDuration),
    );
    onProgress(easeInOutCubic(linearProgress));

    if (linearProgress < 1) {
      frameId = requestFrame(tick);
    } else {
      onComplete?.();
    }
  };

  onProgress(0);
  frameId = requestFrame(tick);

  return () => {
    if (isCancelled) {
      return;
    }
    isCancelled = true;
    cancelFrame(frameId);
  };
};
