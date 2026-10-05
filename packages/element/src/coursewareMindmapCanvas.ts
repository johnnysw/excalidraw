import {
  COURSEWARE_MINDMAP_FONT_FAMILY,
  getCoursewareMindmapRenderData,
} from "./coursewareMindmapRenderData";

import type { ExcalidrawRectangleElement } from "./types";

export interface CoursewareMindmapCanvasOptions {
  files?: Record<string, { dataURL?: string; mimeType?: string }>;
  imageCache?: ReadonlyMap<
    any,
    { image: CanvasImageSource | Promise<CanvasImageSource>; mimeType?: string }
  >;
  getImage?: (fileId: string) => CanvasImageSource | null;
  imageFilter?: string;
}

/** Draws rectangle-local content only; its caller owns native x/y/angle/opacity. */
export const drawCoursewareMindmap = (
  element: ExcalidrawRectangleElement,
  ctx: CanvasRenderingContext2D,
  options: CoursewareMindmapCanvasOptions = {},
) => {
  const data = getCoursewareMindmapRenderData(element);
  if (!data) {
    return;
  }
  const { geometry, scale } = data;
  ctx.save();
  ctx.translate(
    data.flipX ? element.width : 0,
    data.flipY ? element.height : 0,
  );
  ctx.scale(data.flipX ? -1 : 1, data.flipY ? -1 : 1);
  ctx.scale(
    element.width / Math.max(1, geometry.bounds.width),
    element.height / Math.max(1, geometry.bounds.height),
  );
  ctx.translate(-geometry.bounds.x, -geometry.bounds.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = data.connector;
  ctx.lineWidth = data.branchWidth;
  ctx.setLineDash(data.branchDash);
  const drawProfessional = (items: typeof data.boundaries) => {
    for (const item of items) {
      ctx.save(); ctx.strokeStyle = item.color; ctx.fillStyle = item.fill || "transparent";
      ctx.lineWidth = 1.5 * scale;
      ctx.setLineDash(item.lineStyle === "dash" ? [8 * scale, 6 * scale] : item.lineStyle === "dot" ? [2 * scale, 5 * scale] : []);
      const path = new Path2D(item.path); if (item.fill && item.fill !== "transparent") ctx.fill(path); ctx.stroke(path);
      ctx.setLineDash([]);
      if (item.startArrowPath) ctx.stroke(new Path2D(item.startArrowPath));
      if (item.endArrowPath) ctx.stroke(new Path2D(item.endArrowPath));
      if (item.label && item.labelBounds) {
        const rect = item.labelBounds; ctx.fillStyle = item.color;
        ctx.font = `${14 * scale}px ${COURSEWARE_MINDMAP_FONT_FAMILY}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(item.label, rect.x, rect.y + rect.height / 2);
      }
      ctx.restore();
    }
  };
  drawProfessional(data.boundaries);
  for (const branch of data.branches) {
    ctx.strokeStyle = branch.color;
    ctx.stroke(new Path2D(branch.path));
  }
  drawProfessional([...data.summaries, ...data.relations]);
  for (const item of data.nodes) {
    const { node, bounds, style, content, decoration } = item;
    ctx.save();
    ctx.translate(bounds.x, bounds.y);
    ctx.globalAlpha *= item.opacity;
    ctx.lineWidth = style.strokeWidth;
    ctx.fillStyle = style.fill;
    ctx.strokeStyle = style.stroke;
    ctx.setLineDash(item.dash);
    if (item.textBackground) {
      const background = new Path2D();
      background.roundRect(
        0,
        0,
        bounds.width,
        bounds.height,
        item.textBackground.radius,
      );
      ctx.fillStyle = item.textBackground.fill;
      ctx.fill(background);
    }
    if (style.shape !== "text") {
      const path = new Path2D(item.shapePath ?? undefined);
      if (style.shape === "ellipse" || style.shape === "circle") {
        const radius =
          style.shape === "circle"
            ? Math.min(bounds.width, bounds.height) / 2
            : null;
        path.ellipse(
          bounds.width / 2,
          bounds.height / 2,
          radius ?? bounds.width / 2,
          radius ?? bounds.height / 2,
          0,
          0,
          Math.PI * 2,
        );
      } else if (!item.shapePath) {
        path.roundRect(
          0,
          0,
          bounds.width,
          bounds.height,
          style.shape === "rounded-rectangle" ? 12 * scale : 0,
        );
      }
      if (style.shape !== "brace" && style.shape !== "brace-right") {
        ctx.fill(path);
      }
      if (style.strokeWidth > 0) {
        ctx.stroke(path);
      }
    }
    ctx.setLineDash([]);
    if (node.imageAssetId && content.image) {
      const image =
        options.getImage?.(node.imageAssetId) ??
        options.imageCache?.get(node.imageAssetId)?.image;
      const rect = content.image;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 6 * scale);
      } else {
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.clip();
      if (image && !("then" in image)) {
        const mimeType =
          options.imageCache?.get(node.imageAssetId)?.mimeType ??
          options.files?.[node.imageAssetId]?.mimeType;
        if (options.imageFilter && mimeType !== "image/svg+xml") {
          ctx.filter = options.imageFilter;
        }
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      } else {
        ctx.fillStyle = "#eef0f4";
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeStyle = "#bcc3ce";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          rect.x + 2 * scale,
          rect.y + 2 * scale,
          Math.max(0, rect.width - 4 * scale),
          Math.max(0, rect.height - 4 * scale),
        );
      }
      ctx.restore();
    }
    ctx.fillStyle = style.color;
    if (decoration.artwork && content.decoration) {
      const rect = content.decoration;
      const size = Math.min(16 * scale, rect.width, rect.height);
      ctx.save();
      ctx.translate(
        rect.x + (rect.width - size) / 2,
        rect.y + (rect.height - size) / 2,
      );
      ctx.scale(size / 24, size / 24);
      const path = new Path2D(decoration.artwork.path);
      if (decoration.artwork.mode === "fill") {
        ctx.fill(path);
      } else {
        ctx.strokeStyle = style.color;
        ctx.lineWidth = 1.8;
        ctx.stroke(path);
      }
      ctx.restore();
    } else if (decoration.glyph && content.decoration) {
      const rect = content.decoration;
      ctx.font = `${16 * scale}px ${COURSEWARE_MINDMAP_FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        decoration.glyph,
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
    }
    const lineHeight = content.labelLineHeight;
    const firstY = content.label.y + Math.max(0, (content.label.height - item.labelLines.length * lineHeight) / 2) + style.fontSize;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (const run of item.textRuns) {
      const x = content.label.x + run.x, y = firstY + run.y;
      const color = run.style.color || style.color;
      ctx.fillStyle = color;
      ctx.font = `${run.style.italic ? "italic" : "normal"} ${run.style.bold ? "bold" : "normal"} ${style.fontSize}px ${COURSEWARE_MINDMAP_FONT_FAMILY}`;
      ctx.fillText(run.text, x, y);
      for (const decorationY of [run.style.underline ? y + style.fontSize * 0.12 : null, run.style.strikethrough ? y - style.fontSize * 0.32 : null]) {
        if (decorationY === null) continue;
        ctx.beginPath(); ctx.moveTo(x, decorationY); ctx.lineTo(x + run.width, decorationY);
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, style.fontSize / 14); ctx.stroke();
      }
    }
    if (
      content.summary &&
      content.summaryQuoteLine &&
      content.summaryLines?.length
    ) {
      const quote = content.summaryQuoteLine;
      ctx.fillStyle = data.summaryStyle.quoteColor;
      ctx.fillRect(quote.x, quote.y, quote.width, quote.height);
      ctx.fillStyle = data.summaryStyle.textColor;
      ctx.font = `${content.summaryFontSize}px ${COURSEWARE_MINDMAP_FONT_FAMILY}`;
      ctx.textAlign = "left";
      content.summaryLines.forEach((line, index) =>
        ctx.fillText(
          line,
          content.summary!.x,
          content.summary!.y +
            content.summaryFontSize +
            index * content.summaryLineHeight,
        ),
      );
    }
    ctx.restore();
  }
  ctx.restore();
};
