import { Icon } from "@iconify/react";
import type { ShapeKind } from "../coursewareShapePaths";

/**
 * The selected-object shape picker uses the same 24px outline artwork as the
 * Feishu whiteboard. Keeping these paths in the bundle avoids a runtime
 * request to the reference site and keeps the icon geometry stable at any
 * canvas zoom level.
 */
const PATHS: Partial<Record<ShapeKind, string>> = {
  rectangle: "M3.9 3.9h16.2v16.2H3.9z",
  cylinder:
    "M21.96 6.944c-.24-1.536-1.55-2.73-3.124-3.516C17.04 2.529 14.62 2 11.999 2s-5.04.53-6.836 1.428c-1.574.786-2.885 1.98-3.124 3.516H2v9.436c0 1.81 1.397 3.226 3.15 4.135 1.8.933 4.222 1.483 6.85 1.483 2.626 0 5.049-.55 6.848-1.483 1.754-.91 3.15-2.325 3.15-4.135V6.944zM12 11.1c-2.404 0-4.535-.489-6.032-1.237C4.418 9.086 3.8 8.182 3.8 7.45V7.45c0-.732.617-1.636 2.168-2.411C7.465 4.289 9.596 3.8 11.999 3.8s4.535.489 6.032 1.238c1.55.775 2.167 1.68 2.167 2.412 0 .731-.616 1.636-2.167 2.412-1.497.748-3.629 1.237-6.032 1.237m8.198-.474c-.413.32-.875.603-1.362.847-1.796.898-4.215 1.427-6.837 1.427s-5.04-.53-6.836-1.427a8.3 8.3 0 0 1-1.363-.847v5.755c0 .796.64 1.74 2.18 2.538 1.494.774 3.62 1.28 6.02 1.28 2.398 0 4.525-.506 6.019-1.28 1.54-.799 2.18-1.742 2.18-2.538z",
  chevron:
    "M3.673 5.051a.1.1 0 0 1-.016-.05q0-.022.015-.05a.1.1 0 0 1 .036-.039.1.1 0 0 1 .051-.012h12.91a.1.1 0 0 1 .087.049l4.166 7a.1.1 0 0 1 0 .102l-4.166 7a.1.1 0 0 1-.086.049H3.759a.1.1 0 0 1-.05-.012.1.1 0 0 1-.037-.039.1.1 0 0 1-.015-.05c0-.012.002-.027.016-.05l3.558-5.977a1.9 1.9 0 0 0 0-1.944z",
  pentagon:
    "M2.9 5a.1.1 0 0 1 .1-.1h13.485a.1.1 0 0 1 .085.047l4.387 7a.1.1 0 0 1 0 .106l-4.387 7a.1.1 0 0 1-.085.047H3a.1.1 0 0 1-.1-.1z",
  parallelogram:
    "M5.31 5.757A1 1 0 0 1 6.28 5h14.421a1 1 0 0 1 .967 1.256l-3.171 12a1 1 0 0 1-.967.744H3.28a1 1 0 0 1-.97-1.242z",
  trapezoid:
    "M3.383 17.776A1.1 1.1 0 0 0 4.46 19.1h15.08a1.1 1.1 0 0 0 1.077-1.324l-2.5-12A1.1 1.1 0 0 0 17.04 4.9H6.96a1.1 1.1 0 0 0-1.077.876z",
  "speech-bubble":
    "M21.1 11c0 3.744-3.876 7.1-9.1 7.1q-.92-.001-1.785-.137a3.1 3.1 0 0 0-1.347.079l-3.823 1.124a1.1 1.1 0 0 1-1.381-1.307l.393-1.673c.2-.847-.015-1.675-.387-2.33A5.76 5.76 0 0 1 2.9 11c0-3.744 3.876-7.1 9.1-7.1s9.1 3.356 9.1 7.1Z",
  "speech-bubble-square":
    "m9.72 17.46-.27-.36H6A3.1 3.1 0 0 1 2.9 14V6A3.1 3.1 0 0 1 6 2.9h12A3.1 3.1 0 0 1 21.1 6v8a3.1 3.1 0 0 1-3.1 3.1h-3.45l-.27.36-2.2 2.933a.1.1 0 0 1-.16 0z",
  "right-triangle":
    "M19.65 20c.945 0 1.362-1.19.624-1.78L4.124 5.3a1 1 0 0 0-1.624.78V19a1 1 0 0 0 1 1z",
  triangle:
    "M20.196 20a1 1 0 0 0 .848-1.53L12.848 5.357a1 1 0 0 0-1.696 0L2.956 18.47A1 1 0 0 0 3.804 20z",
  star: "M11.103 2.817a1 1 0 0 1 1.794 0L15 7.079a1 1 0 0 0 .753.547l4.703.683a1 1 0 0 1 .555 1.706l-3.404 3.318a1 1 0 0 0-.287.885l.803 4.684a1 1 0 0 1-1.45 1.054l-4.208-2.211a1 1 0 0 0-.93 0l-4.207 2.211a1 1 0 0 1-1.451-1.054l.803-4.684a1 1 0 0 0-.287-.885l-3.404-3.318a1 1 0 0 1 .555-1.706l4.703-.683A1 1 0 0 0 9 7.079z",
  hexagon:
    "M16.133 3a1 1 0 0 1 .848.47l4.688 7.5a1 1 0 0 1 0 1.06l-4.688 7.5a1 1 0 0 1-.848.47H7.72a1 1 0 0 1-.855-.481l-4.55-7.5a1 1 0 0 1 0-1.038l4.55-7.5A1 1 0 0 1 7.72 3z",
  octagon:
    "M11.343 3.612a1.1 1.1 0 0 1 1.314 0l7.663 5.707a1.1 1.1 0 0 1 .392 1.215l-2.947 9.298a1.1 1.1 0 0 1-1.049.768H7.284a1.1 1.1 0 0 1-1.049-.768l-2.947-9.298a1.1 1.1 0 0 1 .392-1.215z",
  funnel:
    "M20.252 8.439a1.1 1.1 0 0 1 .326.776l.029 5.997a1.1 1.1 0 0 1-.319.779l-4.22 4.26a1.1 1.1 0 0 1-.776.326l-5.997.029a1.1 1.1 0 0 1-.78-.318l-4.26-4.22-.62.625.62-.626a1.1 1.1 0 0 1-.326-.776l-.028-5.997a1.1 1.1 0 0 1 .318-.779l4.22-4.26a1.1 1.1 0 0 1 .776-.326l5.997-.029a1.1 1.1 0 0 1 .78.318z",
  "left-arrow":
    "M12.444 6.416v.9h8.265a.1.1 0 0 1 .1.1v8.455a.1.1 0 0 1-.1.1h-8.265v4.314c0 .034-.008.048-.014.056a.1.1 0 0 1-.047.036.1.1 0 0 1-.058.009c-.01-.002-.025-.005-.05-.029l-9.053-8.641a.1.1 0 0 1 0-.145l9.053-8.641c.025-.024.04-.028.05-.03a.1.1 0 0 1 .058.01.1.1 0 0 1 .047.036c.006.008.014.022.014.056z",
  "right-arrow":
    "M10.656 7.316h.9V3.002c0-.034.008-.048.014-.056a.1.1 0 0 1 .046-.036.1.1 0 0 1 .059-.01c.01.002.025.006.05.03l9.053 8.641a.1.1 0 0 1 0 .145l-9.053 8.641c-.025.024-.04.027-.05.029a.1.1 0 0 1-.059-.01.1.1 0 0 1-.046-.035c-.006-.008-.014-.022-.014-.056V15.97H3.29a.1.1 0 0 1-.1-.1V7.416a.1.1 0 0 1 .1-.1z",
  "double-arrow":
    "M14.31 8.282h.9v-4.28c0-.037.009-.051.014-.058a.1.1 0 0 1 .05-.035.1.1 0 0 1 .061-.007c.008.001.024.006.05.033l7.04 7.88a.1.1 0 0 1 0 .133l-7.04 7.88c-.026.028-.042.032-.05.034a.1.1 0 0 1-.061-.007.1.1 0 0 1-.05-.036c-.005-.006-.014-.02-.014-.057v-4.28H8.79v4.28c0 .037-.009.05-.014.057a.1.1 0 0 1-.05.036.1.1 0 0 1-.061.007c-.008-.002-.024-.034-.05-.034l-7.04-7.88a.1.1 0 0 1 0-.133l7.04-7.88c.026-.027.042-.031.05-.033a.1.1 0 0 1 .061.007q.038.017.05.035c.005.007.014.02.014.058v4.28h5.52Z",
  cloud:
    "m19.15 8.13-.16.82.807.22c1.58.43 2.676 1.779 2.676 3.313 0 1.418-.932 2.674-2.322 3.199l-.636.24.057.677q.01.117.01.237a2.77 2.77 0 0 1-2.762 2.775c-.604 0-1.16-.194-1.614-.523l-.764-.553-.517.79a2.756 2.756 0 0 1-4.743-.204l-.448-.834-.81.49a3.1 3.1 0 0 1-1.61.447c-1.703 0-3.052-1.347-3.052-2.969 0-.481.117-.933.325-1.334l.468-.902-.951-.355c-.907-.34-1.577-1.25-1.577-2.341 0-1.359 1.03-2.422 2.265-2.482l.997-.048-.151-.987a2.286 2.286 0 0 1 3.07-2.492l.734.283.379-.69a2.86 2.86 0 0 1 2.505-1.485 2.86 2.86 0 0 1 2.646 1.782l.424 1.038.922-.64a2.45 2.45 0 0 1 1.405-.44A2.48 2.48 0 0 1 19.15 8.13Z",
  cross:
    "M7 7.9h.9V4A1.1 1.1 0 0 1 9 2.9h6A1.1 1.1 0 0 1 16.1 4v3.9H20A1.1 1.1 0 0 1 21.1 9v6a1.1 1.1 0 0 1-1.1 1.1h-3.9V20a1.1 1.1 0 0 1-1.1 1.1H9A1.1 1.1 0 0 1 7.9 20v-3.9H4A1.1 1.1 0 0 1 2.9 15V9A1.1 1.1 0 0 1 4 7.9z",
};

const FILLED_KINDS = new Set<ShapeKind>(["cylinder"]);

export function CoursewareShapeIcon({
  kind,
  className,
}: {
  kind: ShapeKind | "text";
  className?: string;
}) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    className,
    "aria-hidden": true,
  } as const;

  if (kind === "rounded-rectangle")
    return (
      <svg {...common}>
        <rect
          width="18.2"
          height="14.2"
          x="2.9"
          y="4.9"
          stroke="currentColor"
          strokeWidth="1.8"
          rx="3.1"
        />
      </svg>
    );
  if (kind === "text")
    return (
      <svg {...common}>
        <path
          fill="currentColor"
          d="M3.667 4.5a.833.833 0 0 1 .833-.833h15a.833.833 0 0 1 .833.833v3.333a.833.833 0 1 1-1.666 0v-2.5h-5.834v13.334h2.5a.833.833 0 0 1 0 1.666H8.667a.833.833 0 1 1 0-1.666h2.5V5.333H5.333v2.5a.833.833 0 1 1-1.666 0z"
        />
      </svg>
    );
  if (kind === "ellipse")
    return (
      <svg {...common}>
        <rect
          width="18.2"
          height="14.2"
          x="2.9"
          y="4.9"
          stroke="currentColor"
          strokeWidth="1.8"
          rx="7.1"
        />
      </svg>
    );
  if (kind === "circle")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  if (kind === "diamond")
    return (
      <svg {...common}>
        <rect
          width="14.142"
          height="14.142"
          x="12"
          y="2"
          stroke="currentColor"
          strokeWidth="1.8"
          rx="1"
          transform="rotate(45 12 2)"
        />
      </svg>
    );
  if (kind === "brace")
    return (
      <svg {...common}>
        <path
          stroke="currentColor"
          strokeWidth="1.8"
          d="M16 15a3.2 3.2 0 0 0-1.618-2.783L14 12l.382-.217C15.382 11.213 16 10.15 16 9M16 9V7a4 4 0 0 1 4-4M16 15v2a4 4 0 0 0 4 4"
        />
        <path
          fill="currentColor"
          d="M3 7h10v1.8H3zM3 11h7.5v1.8H3zM3 15h5v1.8H3z"
        />
      </svg>
    );
  if (kind === "brace-right")
    return (
      <svg {...common}>
        <path
          stroke="currentColor"
          strokeWidth="1.8"
          d="M7 15c0-1.151.618-2.214 1.618-2.783L9 12l-.382-.217A3.2 3.2 0 0 1 7 9M7 9V7a4 4 0 0 0-4-4M7 15v2a4 4 0 0 1-4 4"
        />
        <path
          fill="currentColor"
          d="M12 7h10v1.8H12zM12 11h7.5v1.8H12zM12 15h5v1.8h-5z"
        />
      </svg>
    );

  const path = PATHS[kind];
  if (path)
    return (
      <svg {...common}>
        <path
          d={path}
          fill={FILLED_KINDS.has(kind) ? "currentColor" : undefined}
          fillRule={FILLED_KINDS.has(kind) ? "evenodd" : undefined}
          clipRule={FILLED_KINDS.has(kind) ? "evenodd" : undefined}
          stroke={FILLED_KINDS.has(kind) ? undefined : "currentColor"}
          strokeWidth={FILLED_KINDS.has(kind) ? undefined : 1.8}
          strokeLinejoin="round"
        />
      </svg>
    );

  return <Icon icon={SHAPE_ICON_FALLBACKS[kind]} className={className} />;
}

const SHAPE_ICON_FALLBACKS: Record<ShapeKind, string> = {
  rectangle: "lucide:square",
  circle: "lucide:circle",
  "rounded-rectangle": "lucide:rectangle-horizontal",
  ellipse: "lucide:circle",
  diamond: "lucide:diamond",
  triangle: "lucide:triangle",
  cylinder: "lucide:cylinder",
  chevron: "lucide:chevron-right",
  pentagon: "lucide:pentagon",
  parallelogram: "ph:parallelogram",
  trapezoid: "ph:polygon",
  "speech-bubble": "lucide:message-circle",
  "speech-bubble-square": "lucide:message-square",
  "right-triangle": "lucide:triangle-right",
  star: "lucide:star",
  hexagon: "lucide:hexagon",
  octagon: "lucide:octagon",
  "left-arrow": "lucide:arrow-left",
  "right-arrow": "lucide:arrow-right",
  "double-arrow": "lucide:arrow-left-right",
  cloud: "lucide:cloud",
  brace: "lucide:braces",
  "brace-right": "lucide:braces",
  funnel: "lucide:octagon",
  cross: "lucide:plus",
};
