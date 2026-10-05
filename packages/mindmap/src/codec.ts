import type {
  MindmapObject,
  MindmapNode,
  MindmapLabelStyleRange,
} from "./types";
import {
  createId,
  createMindmapObject,
  layoutMindmap,
  normalizeMindmapObject,
  mindmapSubtreeNodeIds,
} from "./model";
import { normalizeMindmapSelectionRoots } from "./tree";
import {
  remapMindmapProfessionalObjects,
  normalizeMindmapProfessionalObjects,
} from "./professional";
import type { MindmapResource } from "./session";
import { normalizeMindmapLabelStyleRanges } from "./text";
export const MINDMAP_EXCHANGE_MIME = "application/x-mindmap+json";
export interface MindmapExchangePayload {
  rootNodeIds?: string[];
  format: "mindmap";
  kind: "map" | "branches";
  object: MindmapObject;
  resources: Record<string, MindmapResource>;
}
export interface MindmapExchangeResult {
  rootNodeIds: string[];
  object: MindmapObject;
  resources: Record<string, MindmapResource>;
  kind: "map" | "branches";
  warnings: string[];
}
export function collectMindmapResourceIds(
  object: Pick<MindmapObject, "nodes">
): string[] {
  return [
    ...new Set(
      Object.values(object.nodes)
        .map((node) => node.imageAssetId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}
export function duplicateMindmapObject(
  object: MindmapObject,
  options: {
    mapId?: string;
    idFactory?: (prefix: string) => string;
    resourceIdMap?: Record<string, string>;
  } = {}
): { object: MindmapObject; nodeIdMap: Record<string, string> } {
  const factory = options.idFactory || createId;
  const nodeIdMap = Object.fromEntries(
    Object.keys(object.nodes).map((id) => [id, factory("mindmap-node")])
  );
  const cloned = structuredClone(object) as MindmapObject;
  const nodes = Object.fromEntries(
    Object.entries(cloned.nodes).map(([id, node]) => [
      nodeIdMap[id],
      {
        ...node,
        id: nodeIdMap[id],
        parentId: node.parentId ? nodeIdMap[node.parentId] || null : null,
        ...(node.imageAssetId && options.resourceIdMap?.[node.imageAssetId]
          ? { imageAssetId: options.resourceIdMap[node.imageAssetId] }
          : {}),
      },
    ])
  );
  return {
    object: {
      ...cloned,
      ...remapMindmapProfessionalObjects(cloned, nodeIdMap, factory),
      id: options.mapId || factory("mindmap"),
      rootId: nodeIdMap[cloned.rootId],
      nodes,
      order: cloned.order.map((id) => nodeIdMap[id]).filter(Boolean),
    },
    nodeIdMap,
  };
}
function branchObject(
  object: MindmapObject,
  nodeIds: readonly string[]
): MindmapObject {
  const roots = normalizeMindmapSelectionRoots(object, nodeIds);
  if (!roots.length) throw new Error("请选择要复制的主题");
  if (roots.includes(object.rootId)) return object;
  const ids = [
      ...new Set(roots.flatMap((id) => mindmapSubtreeNodeIds(object, id))),
    ],
    included = new Set(ids);
  let rootId = roots[0];
  const nodes = Object.fromEntries(
    ids.map((id) => [
      id,
      {
        ...structuredClone(object.nodes[id]),
        ...(roots.includes(id) ? { parentId: null } : {}),
      },
    ])
  );
  if (roots.length > 1) {
    rootId = createId("mindmap-node");
    nodes[rootId] = {
      id: rootId,
      parentId: null,
      label: "中心主题",
      widthMode: "auto",
      textMaxWidth: 320 * (object.layoutScale || 1),
    };
    for (const id of roots) nodes[id].parentId = rootId;
    ids.unshift(rootId);
  }
  const professional = remapMindmapProfessionalObjects(
    object,
    Object.fromEntries([...included].map((id) => [id, id])),
    createId
  );
  return normalizeMindmapProfessionalObjects({
    ...structuredClone(object),
    ...professional,
    rootId,
    nodes,
    order: ids,
  });
}
function assertObject(value: unknown): asserts value is MindmapObject {
  if (!value || typeof value !== "object") throw new Error("脑图文件内容无效");
  const object = value as MindmapObject;
  if (
    object.type !== "mindmap" ||
    typeof object.id !== "string" ||
    typeof object.rootId !== "string" ||
    !object.nodes ||
    typeof object.nodes !== "object" ||
    Array.isArray(object.nodes) ||
    !Array.isArray(object.order)
  )
    throw new Error("脑图文件缺少节点或布局信息");
  if (Object.keys(object.nodes).length > 100000)
    throw new Error("脑图节点数量超出导入限制");
  if (!Object.keys(object.nodes).length || !object.nodes[object.rootId])
    throw new Error("脑图文件缺少中心主题");
  const record = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === "object" && !Array.isArray(value));
  const numeric = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value);
  for (const key of ["x", "y", "width", "height", "rotation"] as const)
    if (
      !numeric(object[key]) ||
      ((key === "width" || key === "height") && object[key] <= 0)
    )
      throw new Error("脑图位置或尺寸无效");
  if (
    object.layoutScale !== undefined &&
    (!numeric(object.layoutScale) || object.layoutScale <= 0)
  )
    throw new Error("脑图缩放比例无效");
  const validateStyle = (style: unknown) => {
    if (!record(style)) throw new Error("脑图样式无效");
    for (const key of ["fontSize", "strokeWidth", "opacity"])
      if (style[key] !== undefined && !numeric(style[key]))
        throw new Error("脑图样式数值无效");
    for (const key of [
      "shape",
      "fill",
      "color",
      "stroke",
      "lineStyle",
      "fontWeight",
      "fontStyle",
      "textDecoration",
      "align",
    ])
      if (style[key] !== undefined && typeof style[key] !== "string")
        throw new Error("脑图样式无效");
  };
  for (const [id, node] of Object.entries(object.nodes))
    if (
      !node ||
      typeof node !== "object" ||
      typeof node.label !== "string" ||
      node.id !== id
    )
      throw new Error("脑图节点内容无效");
  for (const [id, node] of Object.entries(object.nodes)) {
    if (
      (id === object.rootId && node.parentId !== null) ||
      (id !== object.rootId &&
        (typeof node.parentId !== "string" || !object.nodes[node.parentId]))
    )
      throw new Error("脑图节点父级引用无效");
    for (const key of [
      "x",
      "y",
      "width",
      "height",
      "textMaxWidth",
      "fontSize",
      "strokeWidth",
      "opacity",
      "imageWidth",
      "imageHeight",
    ] as const)
      if (node[key] !== undefined && !numeric(node[key]))
        throw new Error("脑图节点尺寸或样式数值无效");
    if (
      node.labelStyleRanges !== undefined &&
      (!Array.isArray(node.labelStyleRanges) ||
        node.labelStyleRanges.some(
          (range) =>
            !record(range) || !numeric(range.start) || !numeric(range.end)
        ))
    )
      throw new Error("脑图文字样式范围无效");
    if (
      node.tags !== undefined &&
      (!Array.isArray(node.tags) ||
        node.tags.some((tag) => typeof tag !== "string"))
    )
      throw new Error("脑图标签无效");
    if (node.branchStyleOverrides !== undefined)
      validateStyle(node.branchStyleOverrides);
    validateStyle(node);
  }
  const checked = new Set<string>([object.rootId]);
  for (const id of Object.keys(object.nodes)) {
    const path = new Set<string>();
    let cursor: string | null = id;
    while (cursor && !checked.has(cursor)) {
      if (path.has(cursor)) throw new Error("脑图节点包含循环引用");
      path.add(cursor);
      cursor = object.nodes[cursor].parentId;
    }
    for (const nodeId of path) checked.add(nodeId);
  }
  if (
    object.order.some((id) => typeof id !== "string" || !object.nodes[id]) ||
    new Set(object.order).size !== Object.keys(object.nodes).length ||
    new Set(object.order).size !== object.order.length
  )
    throw new Error("脑图节点顺序无效");
  if (object.theme !== undefined) {
    const theme = object.theme;
    if (
      !record(theme) ||
      typeof theme.id !== "string" ||
      typeof theme.name !== "string" ||
      typeof theme.connector !== "string" ||
      !Array.isArray(theme.branchColors) ||
      theme.branchColors.some((color) => typeof color !== "string") ||
      !numeric(theme.levelGap) ||
      !numeric(theme.crossGap)
    )
      throw new Error("脑图主题快照无效");
    validateStyle(theme.root);
    validateStyle(theme.branch);
    validateStyle(theme.leaf);
  }
  for (const key of ["summaries", "boundaries", "relations"] as const) {
    const items = object[key];
    if (items === undefined) continue;
    if (
      !Array.isArray(items) ||
      items.some((item) => !record(item) || typeof item.id !== "string")
    )
      throw new Error("脑图专业对象无效");
    for (const item of items) {
      if (key === "relations") {
        const relation = item as NonNullable<
          MindmapObject["relations"]
        >[number];
        if (
          !object.nodes[relation.sourceId] ||
          !object.nodes[relation.targetId]
        )
          throw new Error("脑图关联线引用无效");
      } else {
        const members = (
          item as NonNullable<MindmapObject["boundaries"]>[number]
        ).nodeIds;
        if (
          !Array.isArray(members) ||
          !members.length ||
          members.some((id) => typeof id !== "string" || !object.nodes[id])
        )
          throw new Error("脑图范围引用无效");
      }
    }
  }
}
function inlineMarkdown(text: string): {
  label: string;
  labelStyleRanges: MindmapLabelStyleRange[];
  link?: string;
} {
  let label = "";
  const ranges: MindmapLabelStyleRange[] = [];
  let link: string | undefined;
  const parse = (
    source: string,
    inherited: Omit<MindmapLabelStyleRange, "start" | "end"> = {}
  ) => {
    let offset = 0;
    const append = (value: string, style = inherited) => {
      const start = label.length;
      label += value;
      if (Object.keys(style).length && value)
        ranges.push({ ...style, start, end: label.length });
    };
    while (offset < source.length) {
      if (source[offset] === "\\" && offset + 1 < source.length) {
        append(source[offset + 1]);
        offset += 2;
        continue;
      }
      const reference = /^\[((?:\\.|[^\]\\])+)\]\(((?:\\.|[^)\\])+)\)/.exec(
        source.slice(offset)
      );
      if (reference) {
        link = reference[2].replace(/\\(.)/g, "$1");
        parse(reference[1], { ...inherited, underline: true });
        offset += reference[0].length;
        continue;
      }
      const markers: {
        open: string;
        close: string;
        style: Omit<MindmapLabelStyleRange, "start" | "end">;
      }[] = [
        { open: "***", close: "***", style: { bold: true, italic: true } },
        { open: "**", close: "**", style: { bold: true } },
        { open: "~~", close: "~~", style: { strikethrough: true } },
        { open: "<u>", close: "</u>", style: { underline: true } },
        { open: "*", close: "*", style: { italic: true } },
      ];
      let consumed = false;
      for (const marker of markers) {
        if (!source.startsWith(marker.open, offset)) continue;
        let closing = source.indexOf(marker.close, offset + marker.open.length);
        while (closing >= 0) {
          let slash = closing - 1;
          while (slash >= 0 && source[slash] === "\\") slash--;
          if ((closing - slash - 1) % 2 === 0) break;
          closing = source.indexOf(marker.close, closing + marker.close.length);
        }
        if (closing <= offset + marker.open.length) continue;
        // A nested italic closing marker can share a trailing run of stars with bold.
        if (marker.open === "**" && source.startsWith("***", closing))
          closing++;
        parse(source.slice(offset + marker.open.length, closing), {
          ...inherited,
          ...marker.style,
        });
        offset = closing + marker.close.length;
        consumed = true;
        break;
      }
      if (!consumed) {
        append(source[offset]);
        offset++;
      }
    }
  };
  parse(text);
  return {
    label,
    labelStyleRanges: normalizeMindmapLabelStyleRanges(label, ranges),
    ...(link ? { link } : {}),
  };
}
export function parseMindmapMarkdown(text: string): {
  object: MindmapObject;
  rootNodeIds: string[];
  warnings: string[];
} {
  const lines = text.replace(/\r\n?/g, "\n").split("\n"),
    entries: {
      label: string;
      depth: number;
      style: ReturnType<typeof inlineMarkdown>;
    }[] = [];
  const warnings: string[] = [];
  let fence = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s*```/.test(line)) {
      fence = !fence;
      if (!warnings.length)
        warnings.push("代码块等不支持的内容已转换为普通文字");
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const list = /^(\s*)(?:[-+*]|\d+[.)])\s+(.+)$/.exec(line);
    const indentation = /^\s*/.exec(line)![0].replace(/\t/g, "  ").length;
    const depth = heading
      ? heading[1].length - 1
      : list
      ? Math.floor(list[1].replace(/\t/g, "  ").length / 2) + 1
      : Math.floor(indentation / 2);
    const raw = heading ? heading[2] : list ? list[2] : line.trim();
    const style = fence
      ? { label: raw, labelStyleRanges: [] }
      : inlineMarkdown(raw);
    entries.push({ label: style.label, depth: fence ? 0 : depth, style });
  }
  if (!entries.length) throw new Error("没有可导入的主题");
  const minimum = Math.min(...entries.map((item) => item.depth));
  const normalized = entries.map((item) => ({
    ...item,
    depth: item.depth - minimum,
  }));
  const multiple = normalized.filter((item) => item.depth === 0).length > 1;
  const object = createMindmapObject(
    0,
    0,
    multiple ? "中心主题" : normalized[0].label
  );
  const nodes = { ...object.nodes };
  const order = [object.rootId];
  const stack: { depth: number; id: string }[] = [
    { depth: -1, id: object.rootId },
  ];
  for (let i = multiple ? 0 : 1; i < normalized.length; i++) {
    const item = normalized[i];
    while (stack.length > 1 && stack[stack.length - 1].depth >= item.depth)
      stack.pop();
    const parent = stack[stack.length - 1].id;
    const id = createId("mindmap-node");
    nodes[id] = {
      id,
      parentId: parent,
      ...item.style,
      widthMode: "auto",
      textMaxWidth: 320,
    };
    order.push(id);
    stack.push({ depth: item.depth, id });
  }
  if (!multiple)
    nodes[object.rootId] = { ...nodes[object.rootId], ...normalized[0].style };
  return {
    object: layoutMindmap({ ...object, nodes, order }),
    rootNodeIds: multiple
      ? order.filter((id) => nodes[id].parentId === object.rootId)
      : [object.rootId],
    warnings,
  };
}
function markdownLabel(node: MindmapNode) {
  const escape = (text: string) =>
    text.replace(/[\\`*_{}\[\]()#+.!~<>-]/g, "\\$&");
  const source = node.label;
  const ranges = normalizeMindmapLabelStyleRanges(
    source,
    node.labelStyleRanges
  );
  const points = [
    ...new Set([
      0,
      source.length,
      ...ranges.flatMap((range) => [range.start, range.end]),
    ]),
  ].sort((a, b) => a - b);
  let label = "";
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index],
      end = points[index + 1];
    const style = {
      bold: node.fontWeight === "bold",
      italic: node.fontStyle === "italic",
      underline: node.textDecoration === "underline",
      strikethrough: node.textDecoration === "line-through",
      ...ranges.find((range) => range.start <= start && range.end >= end),
    };
    let value = escape(source.slice(start, end));
    if (style.bold) value = `**${value}**`;
    if (style.italic) value = `*${value}*`;
    if (style.strikethrough) value = `~~${value}~~`;
    if (style.underline) value = `<u>${value}</u>`;
    label += value;
  }
  return node.link
    ? `[${label}](${node.link.replace(/[\\()]/g, "\\$&")})`
    : label;
}
export function mindmapToMarkdown(object: MindmapObject): string {
  const lines = [`# ${markdownLabel(object.nodes[object.rootId])}`];
  const children = new Map<string, string[]>();
  for (const id of object.order) {
    const node = object.nodes[id];
    if (node?.parentId) {
      const list = children.get(node.parentId) || [];
      list.push(id);
      children.set(node.parentId, list);
    }
  }
  const stack = (children.get(object.rootId) || [])
      .slice()
      .reverse()
      .map((id) => ({ id, depth: 0 })),
    seen = new Set<string>();
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push(
      `${"  ".repeat(depth)}- ${markdownLabel(object.nodes[id]).replace(
        /\n/g,
        " "
      )}`
    );
    for (const child of [...(children.get(id) || [])].reverse())
      stack.push({ id: child, depth: depth + 1 });
  }
  return lines.join("\n");
}
export const MindmapExchangeCodec = {
  serialize(
    object: MindmapObject,
    resources: Record<string, MindmapResource> = {},
    nodeIds?: readonly string[]
  ): string {
    const model = nodeIds?.length ? branchObject(object, nodeIds) : object;
    const references = new Set(collectMindmapResourceIds(model));
    return JSON.stringify({
      format: "mindmap",
      rootNodeIds: nodeIds?.length
        ? normalizeMindmapSelectionRoots(object, nodeIds)
        : [object.rootId],
      kind:
        nodeIds?.length && !nodeIds.includes(object.rootId)
          ? "branches"
          : "map",
      object: model,
      resources: Object.fromEntries(
        Object.entries(resources).filter(([id]) => references.has(id))
      ),
    } satisfies MindmapExchangePayload);
  },
  parse(text: string): MindmapExchangeResult {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("脑图 JSON 格式无效");
    }
    const payload = value as Partial<MindmapExchangePayload>;
    const object = payload?.format === "mindmap" ? payload.object : value;
    assertObject(object);
    const resources: Record<string, MindmapResource> = {};
    const required = collectMindmapResourceIds(object);
    for (const [id, resource] of Object.entries(payload.resources || {})) {
      if (
        resource &&
        typeof resource.dataURL === "string" &&
        resource.dataURL.startsWith("data:") &&
        typeof resource.mimeType === "string"
      )
        resources[id] = { ...resource, id };
      else throw new Error("脑图图片资源无效");
    }
    const warnings = required.some((id) => !resources[id])
      ? ["部分图片需由当前文档资源补充"]
      : [];
    return {
      object: normalizeMindmapProfessionalObjects(
        normalizeMindmapObject(object)
      ),
      rootNodeIds: Array.isArray(payload.rootNodeIds)
        ? payload.rootNodeIds.filter((id) => Boolean(object.nodes[id]))
        : [object.rootId],
      resources,
      kind: payload.kind === "branches" ? "branches" : "map",
      warnings,
    };
  },
  serializeSelection: serializeMindmapSelection,
  parseMarkdown: parseMindmapMarkdown,
  toMarkdown: mindmapToMarkdown,
};
/** One portable forest for a multi-map node selection, with no artificial root per source map. */
export function serializeMindmapSelection(
  objects: readonly MindmapObject[],
  selection: Readonly<Record<string, readonly string[]>>,
  resources: Record<string, MindmapResource> = {}
): string {
  const destination = createMindmapObject(0, 0);
  const nodes = { ...destination.nodes };
  const order = [destination.rootId];
  const summaries: NonNullable<MindmapObject["summaries"]> = [],
    boundaries: NonNullable<MindmapObject["boundaries"]> = [],
    relations: NonNullable<MindmapObject["relations"]> = [];
  for (const object of objects) {
    const roots = normalizeMindmapSelectionRoots(
      object,
      selection[object.id] || []
    );
    const nodeIdMap: Record<string, string> = {};
    for (const root of roots)
      for (const id of mindmapSubtreeNodeIds(object, root)) {
        if (nodeIdMap[id]) continue;
        nodeIdMap[id] = nodes[id] ? createId("mindmap-node") : id;
      }
    for (const root of roots)
      for (const id of mindmapSubtreeNodeIds(object, root)) {
        const mapped = nodeIdMap[id];
        if (nodes[mapped]) continue;
        const node = structuredClone(object.nodes[id]) as MindmapNode;
        const ratio = 1 / (object.layoutScale || 1);
        for (const key of [
          "width",
          "height",
          "x",
          "y",
          "fontSize",
          "strokeWidth",
          "imageWidth",
          "imageHeight",
          "textMaxWidth",
        ] as const) {
          const value = node[key];
          if (value !== undefined)
            (node as unknown as Record<string, unknown>)[key] = value * ratio;
        }
        if (node.branchStyleOverrides)
          node.branchStyleOverrides = {
            ...node.branchStyleOverrides,
            ...(node.branchStyleOverrides.fontSize !== undefined
              ? { fontSize: node.branchStyleOverrides.fontSize * ratio }
              : {}),
            ...(node.branchStyleOverrides.strokeWidth !== undefined
              ? { strokeWidth: node.branchStyleOverrides.strokeWidth * ratio }
              : {}),
          };
        nodes[mapped] = {
          ...node,
          id: mapped,
          parentId: roots.includes(id)
            ? destination.rootId
            : nodeIdMap[node.parentId!],
        };
        order.push(mapped);
      }
    const professional = remapMindmapProfessionalObjects(
      object,
      nodeIdMap,
      createId
    );
    summaries.push(...(professional.summaries || []));
    boundaries.push(...(professional.boundaries || []));
    relations.push(...(professional.relations || []));
  }
  if (order.length === 1) throw new Error("请选择要复制的主题");
  const model = layoutMindmap({
    ...destination,
    nodes,
    order,
    summaries,
    boundaries,
    relations,
  });
  const payload = JSON.parse(
    MindmapExchangeCodec.serialize(model, resources)
  ) as MindmapExchangePayload;
  payload.kind = "branches";
  payload.rootNodeIds = order.filter(
    (id) => nodes[id].parentId === destination.rootId
  );
  return JSON.stringify(payload);
}
