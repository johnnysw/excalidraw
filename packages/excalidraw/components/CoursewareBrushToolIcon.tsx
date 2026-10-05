import { useId } from "react";

import type { CoursewareBrushMode } from "../coursewareBrush";

/**
 * Localized from the three SVGs loaded by Feishu's whiteboard paint toolbar.
 * Color bands stay dynamic so the illustrations mirror the active brush.
 */
export function CoursewareBrushToolIcon({
  mode,
  color,
}: {
  mode: CoursewareBrushMode | "eraser";
  color: string;
}) {
  const token = useId().replace(/:/g, "");
  const metalId = `courseware-brush-metal-${token}`;
  const colorId = `courseware-brush-color-${token}`;
  if (mode === "pen") {
    return (
      <svg viewBox="8 4 22 76" aria-hidden="true">
        <defs>
          <linearGradient
            id={metalId}
            x1="8"
            x2="30"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#d9d9d9" />
            <stop offset="0.18" stopColor="#f4f4f4" />
            <stop offset="0.5" stopColor="#d7d7d7" />
            <stop offset="0.78" stopColor="#fafafa" />
            <stop offset="1" stopColor="#d6d6d6" />
          </linearGradient>
          <linearGradient
            id={colorId}
            x1="8"
            x2="30"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={color} />
            <stop offset="0.5" stopColor={color} stopOpacity="0.76" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path
          d="M8.1 51.9v-4.546c0-1.934.235-3.861.699-5.738l9.058-36.621A1.178 1.178 0 0 1 19 4.1c.541 0 1.013.369 1.143.895l9.058 36.621c.464 1.877.699 3.804.699 5.738V51.9Z"
          fill={`url(#${metalId})`}
          stroke="#b6b6b6"
          strokeWidth=".2"
        />
        <path
          d="M15.527 14h6.946L20.24 4.971A1.278 1.278 0 0 0 19 4a1.278 1.278 0 0 0-1.24.971Z"
          fill={`url(#${colorId})`}
        />
        <path d="M8 54h22v26H8Z" fill={`url(#${metalId})`} />
        <path d="M8 52h22v2H8Z" fill={`url(#${colorId})`} />
      </svg>
    );
  }
  if (mode === "highlighter") {
    return (
      <svg viewBox="8 0 24 76" aria-hidden="true">
        <defs>
          <linearGradient
            id={metalId}
            x1="8"
            x2="32"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#d9d9d9" />
            <stop offset="0.18" stopColor="#f5f5f5" />
            <stop offset="0.5" stopColor="#d8d8d8" />
            <stop offset="0.78" stopColor="#fafafa" />
            <stop offset="1" stopColor="#d6d6d6" />
          </linearGradient>
          <linearGradient
            id={colorId}
            x1="15"
            x2="24.3"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={color} />
            <stop offset="0.5" stopColor={color} stopOpacity="0.5" />
            <stop offset="1" stopColor={color} />
          </linearGradient>
        </defs>
        <path
          d="M15.1 12.9V6.293L24.131.188V12.9Z"
          fill={`url(#${colorId})`}
          stroke="#b6b6b6"
          strokeWidth=".2"
        />
        <path
          d="M8.1 38.9v-4.79a6.27 6.27 0 0 1 1.24-3.742 25.94 25.94 0 0 0 5.145-15.52v-2.059c0-.381.308-.689.689-.689h9.176c.352 0 .641.278.654.63l.099 2.656a23.96 23.96 0 0 0 5.476 14.095 5.56 5.56 0 0 1 1.321 3.597V38.9Z"
          fill={`url(#${metalId})`}
          stroke="#b6b6b6"
          strokeWidth=".2"
        />
        <path d="M8.1 36.1h23.8v9.8H8.1Z" fill={`url(#${colorId})`} />
        <path d="M8 44h24v32H8Z" fill={`url(#${metalId})`} />
      </svg>
    );
  }
  return (
    <svg viewBox="8 4 22 76" aria-hidden="true">
      <defs>
        <linearGradient
          id={metalId}
          x1="8"
          x2="30"
          y1="0"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#dbdbdb" />
          <stop offset="0.2" stopColor="#f6f6f6" />
          <stop offset="0.52" stopColor="#dadada" />
          <stop offset="0.8" stopColor="#fafafa" />
          <stop offset="1" stopColor="#d8d8d8" />
        </linearGradient>
      </defs>
      <path
        d="M8 9a5 5 0 0 1 5-5h12a5 5 0 0 1 5 5v14H8Z"
        fill="#e9a29e"
        stroke="#b46f6a"
        strokeWidth=".2"
      />
      <path d="M8 23h22v19H8Z" fill={`url(#${metalId})`} />
      <path d="M8 42h22v38H8Z" fill={`url(#${metalId})`} />
      <path d="M8 42h22v1H8Z" fill="#d8d8d8" />
    </svg>
  );
}
