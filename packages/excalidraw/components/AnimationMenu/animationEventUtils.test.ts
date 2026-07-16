import { describe, expect, it } from "vitest";

import { eventsToElements } from "./animationEventUtils";
import type { AnimationEvent } from "./types";

const baseElement = (animation?: unknown) =>
  ({
    id: "element-1",
    type: "rectangle",
    frameId: "frame-1",
    animation,
    version: 1,
    versionNonce: 123,
    updated: 1,
  } as any);

const animationEvent = (duration = 800): AnimationEvent => ({
  id: "event-1",
  order: 1,
  elements: ["element-1"],
  type: "fadeIn",
  duration,
  startMode: "onClick",
  trigger: "click",
});

describe("eventsToElements", () => {
  it("bumps version metadata when animation configuration changes", () => {
    const previousAnimation = {
      type: "fadeIn",
      duration: 400,
      stepGroup: 1,
      trigger: "click",
      startMode: "onClick",
      eventId: "event-1",
      order: 1,
    };
    const element = baseElement(previousAnimation);

    const [updated] = eventsToElements(
      [animationEvent(800)],
      [element],
      "frame-1",
    );

    expect(updated).not.toBe(element);
    expect(updated.version).toBe(element.version + 1);
    expect(updated.versionNonce).not.toBe(element.versionNonce);
  });

  it("preserves the element reference when animation configuration is unchanged", () => {
    const element = baseElement({
      type: "fadeIn",
      duration: 800,
      stepGroup: 1,
      trigger: "click",
      startMode: "onClick",
      eventId: "event-1",
      order: 1,
    });

    const [updated] = eventsToElements(
      [animationEvent()],
      [element],
      "frame-1",
    );

    expect(updated).toBe(element);
  });

  it("bumps version metadata when animation is removed", () => {
    const element = baseElement({
      type: "fadeIn",
      duration: 800,
      stepGroup: 1,
      trigger: "click",
      startMode: "onClick",
      eventId: "event-1",
      order: 1,
    });

    const [updated] = eventsToElements([], [element], "frame-1");

    expect(updated).not.toBe(element);
    expect(updated.animation).toBeUndefined();
    expect(updated.version).toBe(element.version + 1);
    expect(updated.versionNonce).not.toBe(element.versionNonce);
  });

  it("preserves the element reference when its animation array is empty", () => {
    const element = baseElement([]);

    const [updated] = eventsToElements([], [element], "frame-1");

    expect(updated).toBe(element);
  });

  it("preserves the element reference when animations only differ in array order", () => {
    const element = baseElement([
      {
        type: "slideInLeft",
        duration: 1600,
        stepGroup: 2,
        trigger: "click",
        startMode: "afterPrevious",
        eventId: "event-2",
        order: 2,
      },
      {
        type: "fadeIn",
        duration: 800,
        stepGroup: 1,
        trigger: "click",
        startMode: "onClick",
        eventId: "event-1",
        order: 1,
      },
    ]);
    const events: AnimationEvent[] = [
      animationEvent(),
      {
        id: "event-2",
        order: 2,
        elements: ["element-1"],
        type: "slideInLeft",
        duration: 1600,
        startMode: "afterPrevious",
        trigger: "click",
      },
    ];

    const [updated] = eventsToElements(events, [element], "frame-1");

    expect(updated).toBe(element);
  });
});
