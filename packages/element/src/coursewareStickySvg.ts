import { SVG_NS } from "@excalidraw/common";

import { COURSEWARE_STICKY_STYLE } from "./coursewareSticky";

import type { ExcalidrawElement } from "./types";

export const createCoursewareStickySvgNode = (
  element: ExcalidrawElement,
  svgRoot: SVGElement,
) => {
  const document = svgRoot.ownerDocument!;
  const createNode = (
    name: string,
    attributes: Record<string, string | number> = {},
  ) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [name, value] of Object.entries(attributes)) {
      node.setAttribute(name, String(value));
    }
    return node;
  };
  const style = COURSEWARE_STICKY_STYLE;
  const node = createNode("g");
  const defs = createNode("defs");
  const shadowId = `sticky-shadow-${element.id}`;
  const filter = createNode("filter", {
    id: shadowId, x: "-20%", y: "-20%", width: "140%", height: "160%",
  });
  filter.appendChild(createNode("feDropShadow", {
    dx: 0,
    dy: style.shadowOffsetY,
    stdDeviation: style.shadowBlur / 2,
    "flood-color": style.shadowColor,
    "flood-opacity": style.shadowOpacity,
  }));
  defs.appendChild(filter);
  node.appendChild(defs);
  node.appendChild(createNode("rect", {
    width: element.width,
    height: element.height,
    rx: style.cornerRadius,
    fill: element.backgroundColor,
    stroke: "none",
    filter: `url(#${shadowId})`,
  }));

  return node;
};
