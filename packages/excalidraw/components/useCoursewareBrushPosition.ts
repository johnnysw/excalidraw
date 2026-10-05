import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_BOTTOM = 24;
const FOOTER_GAP = 12;

/** Keep the centered toolbox clear of the actual footer controls, without a breakpoint. */
export const useCoursewareBrushPosition = (
  container: HTMLDivElement | null,
  visible: boolean,
  zenModeEnabled: boolean
) => {
  const ref = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(DEFAULT_BOTTOM);

  useLayoutEffect(() => {
    const toolbar = ref.current;
    if (!container || !toolbar || !visible) {
      return;
    }
    const footer = Array.from(
      container.querySelectorAll<HTMLElement>(
        ".layer-ui__wrapper__footer-left, .layer-ui__wrapper__footer-right"
      )
    );
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      const tools = toolbar.getBoundingClientRect();
      const restingBottom = bounds.bottom - DEFAULT_BOTTOM;
      const restingTop = restingBottom - tools.height;
      const collisions = footer
        .map((element) => element.getBoundingClientRect())
        .filter(
          (rect) =>
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left < tools.right &&
            rect.right > tools.left &&
            rect.top < restingBottom &&
            rect.bottom > restingTop
        );
      const nextBottom = collisions.length
        ? Math.max(
            DEFAULT_BOTTOM,
            bounds.bottom -
              Math.min(...collisions.map((rect) => rect.top)) +
              FOOTER_GAP
          )
        : DEFAULT_BOTTOM;
      // Do not move outside a short canvas, even if there is no room to avoid all controls.
      setBottom(
        Math.min(
          nextBottom,
          Math.max(DEFAULT_BOTTOM, bounds.height - tools.height - 8)
        )
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    [container, toolbar, ...footer].forEach((element) =>
      observer.observe(element)
    );
    window.addEventListener("resize", measure);
    container.addEventListener("transitionend", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      container.removeEventListener("transitionend", measure);
    };
  }, [container, visible, zenModeEnabled]);

  return { ref, bottom };
};
