import React, { useId } from "react";

import type { getCoursewareMindmapRenderData } from "@excalidraw/element/coursewareMindmapRenderData";

type RenderNode = NonNullable<
  ReturnType<typeof getCoursewareMindmapRenderData>
>["nodes"][number];

interface MindmapNodeSelectionProps {
  node: RenderNode;
  layoutScale: number;
  style: React.CSSProperties;
  children?: React.ReactNode;
}

export const MindmapNodeSelection = ({
  node,
  layoutScale,
  style,
  children,
}: MindmapNodeSelectionProps) => {
  const maskId = `mindmap-selection-${useId().replace(/:/g, "")}`;
  const { width, height } = node.bounds;
  const scaleX = (Number(style.width) || width) / width;
  const scaleY = (Number(style.height) || height) / height;
  const strokeWidth =
    node.style.shape === "text"
      ? 0
      : node.style.strokeWidth * Math.max(scaleX, scaleY);
  // Leave the node's own stroke visible, followed by a 3px gap and a 2px ring.
  const maskStrokeWidth = strokeWidth + 6;
  const outlineStrokeWidth = maskStrokeWidth + 4;
  const paddingX = (outlineStrokeWidth / 2 + 1) / scaleX;
  const paddingY = (outlineStrokeWidth / 2 + 1) / scaleY;
  const region = {
    x: -paddingX,
    y: -paddingY,
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  };
  const shape = (attributes: React.SVGAttributes<SVGElement>) => {
    if (node.shapePath) {
      return <path d={node.shapePath} {...attributes} />;
    }
    if (node.style.shape === "ellipse" || node.style.shape === "circle") {
      const radius =
        node.style.shape === "circle" ? Math.min(width, height) / 2 : null;
      return (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={radius ?? width / 2}
          ry={radius ?? height / 2}
          {...attributes}
        />
      );
    }
    return (
      <rect
        width={width}
        height={height}
        rx={
          node.style.shape === "rounded-rectangle"
            ? 12 * layoutScale
            : node.style.shape === "text"
              ? (node.textBackground?.radius ?? 4 / scaleX)
              : 0
        }
        ry={
          node.style.shape === "text"
            ? (node.textBackground?.radius ?? 4 / scaleY)
            : undefined
        }
        {...attributes}
      />
    );
  };
  const strokeAttributes = {
    vectorEffect: "non-scaling-stroke",
    strokeLinejoin: "round",
    strokeLinecap: "round",
  } as const;
  return (
    <div
      className="Courseware-mindmap-selection"
      data-node-id={node.node.id}
      style={style}
    >
      <svg
        className="Courseware-mindmap-selection-outline"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
            {...region}
          >
            <rect {...region} fill="white" />
            {shape({
              ...strokeAttributes,
              fill:
                node.style.shape === "brace" ||
                node.style.shape === "brace-right"
                  ? "none"
                  : "black",
              stroke: "black",
              strokeWidth: maskStrokeWidth,
            })}
          </mask>
        </defs>
        {shape({
          ...strokeAttributes,
          fill: "none",
          stroke: "var(--color-primary)",
          strokeWidth: outlineStrokeWidth,
          mask: `url(#${maskId})`,
        })}
      </svg>
      {children}
    </div>
  );
};
