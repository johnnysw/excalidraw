import { SVG_NS } from "@excalidraw/common";
import {
  COURSEWARE_MINDMAP_FONT_FAMILY,
  getCoursewareMindmapRenderData,
} from "./coursewareMindmapRenderData";

import type { ExcalidrawRectangleElement } from "./types";

/** SVG uses the exact same visible tree, content bounds and styles as Canvas. */
export const createCoursewareMindmapSvgNode = (
  element: ExcalidrawRectangleElement,
  svgRoot: SVGElement,
  files: Record<string, { dataURL?: string; mimeType?: string }> = {},
  options: { imageFilter?: string } = {},
) => {
  const document = svgRoot.ownerDocument!;
  const make = (
    tag: string,
    attributes: Record<string, string | number>,
    parent?: SVGElement,
  ) => {
    const node = document.createElementNS(SVG_NS, tag) as SVGElement;
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, `${value}`);
    }
    parent?.appendChild(node);
    return node;
  };
  const group = make("g", {});
  const data = getCoursewareMindmapRenderData(element);
  if (!data) {
    return group;
  }
  const { geometry, scale } = data;
  const contentGroup = make(
    "g",
    {
      transform: `translate(${data.flipX ? element.width : 0} ${
        data.flipY ? element.height : 0
      }) scale(${
        ((data.flipX ? -1 : 1) * element.width) /
        Math.max(1, geometry.bounds.width)
      } ${
        ((data.flipY ? -1 : 1) * element.height) /
        Math.max(1, geometry.bounds.height)
      }) translate(${-geometry.bounds.x} ${-geometry.bounds.y})`,
    },
    group,
  );
  const drawProfessional = (items: typeof data.boundaries) => {
    for (const item of items) {
      make("path", { "data-mindmap-object": item.id, d: item.path, fill: item.fill || "none", stroke: item.color, "stroke-width": 1.5 * scale,
        ...(item.lineStyle === "solid" ? {} : { "stroke-dasharray": item.lineStyle === "dash" ? `${8 * scale} ${6 * scale}` : `${2 * scale} ${5 * scale}` }),
      }, contentGroup);
      for (const arrowPath of [item.startArrowPath, item.endArrowPath]) if (arrowPath) make("path", { d: arrowPath, fill: "none", stroke: item.color, "stroke-width": 1.5 * scale }, contentGroup);
      if (item.label && item.labelBounds) {
        const rect = item.labelBounds, label = make("text", { x: rect.x, y: rect.y + rect.height / 2, fill: item.color, "font-size": 14 * scale, "font-family": COURSEWARE_MINDMAP_FONT_FAMILY, "dominant-baseline": "central" }, contentGroup);
        label.textContent = item.label;
      }
    }
  };
  drawProfessional(data.boundaries);
  data.branches.forEach((branch) =>
    make(
      "path",
      {
        "data-mindmap-branch": branch.id,
        d: branch.path,
        fill: "none",
        stroke: branch.color,
        "stroke-width": data.branchWidth,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...(data.branchDash.length
          ? { "stroke-dasharray": data.branchDash.join(" ") }
          : {}),
      },
      contentGroup,
    ),
  );
  drawProfessional([...data.summaries, ...data.relations]);
  for (const item of data.nodes) {
    const { node, bounds, style, content, decoration } = item;
    const nodeGroup = make(
      "g",
      {
        "data-mindmap-node": node.id,
        transform: `translate(${bounds.x} ${bounds.y})`,
        opacity: item.opacity,
      },
      contentGroup,
    );
    if (item.textBackground) {
      make(
        "rect",
        {
          x: 0,
          y: 0,
          width: bounds.width,
          height: bounds.height,
          rx: item.textBackground.radius,
          fill: item.textBackground.fill,
        },
        nodeGroup,
      );
    }
    const shapeAttributes = {
      fill:
        style.shape === "brace" || style.shape === "brace-right"
          ? "none"
          : style.fill,
      stroke: style.stroke,
      "stroke-width": style.strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      ...(item.dash.length ? { "stroke-dasharray": item.dash.join(" ") } : {}),
    };
    if (style.shape === "ellipse" || style.shape === "circle") {
      const radius =
        style.shape === "circle"
          ? Math.min(bounds.width, bounds.height) / 2
          : null;
      make(
        "ellipse",
        {
          cx: bounds.width / 2,
          cy: bounds.height / 2,
          rx: radius ?? bounds.width / 2,
          ry: radius ?? bounds.height / 2,
          ...shapeAttributes,
        },
        nodeGroup,
      );
    } else if (style.shape !== "text") {
      if (item.shapePath) {
        make("path", { d: item.shapePath, ...shapeAttributes }, nodeGroup);
      } else {
        make(
          "rect",
          {
            x: 0,
            y: 0,
            width: bounds.width,
            height: bounds.height,
            rx: style.shape === "rounded-rectangle" ? 12 * scale : 0,
            ...shapeAttributes,
          },
          nodeGroup,
        );
      }
    }
    if (node.imageAssetId && content.image) {
      const rect = content.image;
      const href = files[node.imageAssetId]?.dataURL;
      if (href) {
        const clipId = `mindmap-image-${element.id}-${node.id}`.replace(
          /[^a-zA-Z0-9_-]/g,
          "-",
        );
        const defs = make("defs", {}, nodeGroup);
        const clip = make("clipPath", { id: clipId }, defs);
        make("rect", { ...rect, rx: 6 * scale }, clip);
        make(
          "image",
          {
            ...rect,
            href,
            preserveAspectRatio: "none",
            "clip-path": `url(#${clipId})`,
            ...(options.imageFilter &&
            files[node.imageAssetId]?.mimeType !== "image/svg+xml"
              ? { filter: options.imageFilter }
              : {}),
          },
          nodeGroup,
        );
      } else {
        make(
          "rect",
          { ...rect, rx: 6 * scale, fill: "#eef0f4", stroke: "#bcc3ce" },
          nodeGroup,
        );
      }
    }
    if (decoration.artwork && content.decoration) {
      const rect = content.decoration;
      const size = Math.min(16 * scale, rect.width, rect.height);
      make(
        "path",
        {
          d: decoration.artwork.path,
          transform: `translate(${rect.x + (rect.width - size) / 2} ${
            rect.y + (rect.height - size) / 2
          }) scale(${size / 24})`,
          ...(decoration.artwork.mode === "fill"
            ? { fill: style.color }
            : {
                fill: "none",
                stroke: style.color,
                "stroke-width": 1.8,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
              }),
        },
        nodeGroup,
      );
    } else if (decoration.glyph && content.decoration) {
      const rect = content.decoration;
      const glyph = make(
        "text",
        {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          fill: style.color,
          "dominant-baseline": "central",
          "text-anchor": "middle",
          "font-size": 16 * scale,
          "font-family": COURSEWARE_MINDMAP_FONT_FAMILY,
        },
        nodeGroup,
      );
      glyph.textContent = decoration.glyph;
    }
    const firstY = content.label.y + Math.max(0, (content.label.height - item.labelLines.length * content.labelLineHeight) / 2) + style.fontSize;
    for (const run of item.textRuns) {
      const text = make("text", {
        x: content.label.x + run.x, y: firstY + run.y,
        fill: run.style.color || style.color, "font-family": COURSEWARE_MINDMAP_FONT_FAMILY, "font-size": style.fontSize,
        "font-weight": run.style.bold ? "bold" : "normal", "font-style": run.style.italic ? "italic" : "normal",
        "text-decoration": [run.style.underline ? "underline" : "", run.style.strikethrough ? "line-through" : ""].filter(Boolean).join(" ") || "none",
        "xml:space": "preserve",
      }, nodeGroup);
      const span = make("tspan", {}, text);
      span.textContent = run.text;
    }
    if (
      content.summary &&
      content.summaryQuoteLine &&
      content.summaryLines?.length
    ) {
      make(
        "rect",
        {
          ...content.summaryQuoteLine,
          fill: data.summaryStyle.quoteColor,
          rx: content.summaryQuoteLine.width / 2,
        },
        nodeGroup,
      );
      const summary = make(
        "text",
        {
          x: content.summary.x,
          y: content.summary.y + content.summaryFontSize,
          fill: data.summaryStyle.textColor,
          "font-family": COURSEWARE_MINDMAP_FONT_FAMILY,
          "font-size": content.summaryFontSize,
          "xml:space": "preserve",
        },
        nodeGroup,
      );
      content.summaryLines.forEach((line, index) => {
        const span = make(
          "tspan",
          {
            x: content.summary!.x,
            dy: index === 0 ? 0 : content.summaryLineHeight,
          },
          summary,
        );
        span.textContent = line;
      });
    }
  }
  return group;
};
