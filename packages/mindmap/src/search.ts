import type { MindmapObject, MindmapNode } from "./types";
import { buildMindmapTreeIndex } from "./tree";
import { applyMindmapCommand } from "./commands";
import { layoutMindmap } from "./model";
import { replaceMindmapText } from "./text";
export interface MindmapSearchMatch {
  nodeId: string;
  field: "label" | "summary" | "tag";
  start: number;
  end: number;
  tagIndex?: number;
}
export function searchMindmap(
  object: MindmapObject,
  query: string,
  options: { caseSensitive?: boolean } = {}
): MindmapSearchMatch[] {
  if (!query) return [];
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase(),
    matches: MindmapSearchMatch[] = [];
  for (const id of buildMindmapTreeIndex(object).preorder) {
    const node = object.nodes[id];
    const fields: {
      field: MindmapSearchMatch["field"];
      text: string;
      tagIndex?: number;
    }[] = [
      { field: "label", text: node.label },
      { field: "summary", text: node.summary || "" },
      ...(node.tags || []).map((text, tagIndex) => ({
        field: "tag" as const,
        text,
        tagIndex,
      })),
    ];
    for (const { field, text, tagIndex } of fields) {
      const value = options.caseSensitive ? text : text.toLocaleLowerCase();
      let at = 0;
      while (at <= value.length) {
        const index = value.indexOf(needle, at);
        if (index < 0) break;
        matches.push({
          nodeId: id,
          field,
          start: index,
          end: index + needle.length,
          ...(tagIndex === undefined ? {} : { tagIndex }),
        });
        at = index + needle.length;
      }
    }
  }
  return matches;
}
/** A derived view only. Callers must keep this model outside persisted state. */
export function expandMindmapForSearch(
  object: MindmapObject,
  nodeId: string
): MindmapObject {
  const nodes = { ...object.nodes };
  const seen = new Set<string>();
  let parent = nodes[nodeId]?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    if (nodes[parent]?.collapsed)
      nodes[parent] = { ...nodes[parent], collapsed: false };
    parent = nodes[parent]?.parentId;
  }
  return layoutMindmap({ ...object, nodes });
}
export function replaceMindmapSearchMatches(
  object: MindmapObject,
  query: string,
  replacement: string,
  options: { caseSensitive?: boolean; nodeId?: string; all?: boolean } = {}
): { object: MindmapObject; count: number } {
  if (object.locked || !query) return { object, count: 0 };
  const matches = searchMindmap(object, query, options).filter(
    (match) => !options.nodeId || match.nodeId === options.nodeId
  );
  const targets = options.all === false ? matches.slice(0, 1) : matches;
  let next = object;
  const grouped = new Map<string, MindmapSearchMatch[]>();
  for (const match of targets) {
    const list = grouped.get(match.nodeId) || [];
    list.push(match);
    grouped.set(match.nodeId, list);
  }
  for (const [id, list] of grouped) {
    const node = next.nodes[id];
    const patch: Partial<MindmapNode> = {};
    for (const field of ["label", "summary", "tag"] as const) {
      const selected = list
        .filter((match) => match.field === field)
        .sort((a, b) => b.start - a.start);
      if (field === "tag") {
        const tags = [...(node.tags || [])];
        for (const match of selected) {
          const index = match.tagIndex!;
          tags[index] =
            tags[index].slice(0, match.start) +
            replacement +
            tags[index].slice(match.end);
        }
        if (selected.length) patch.tags = tags;
      } else if (selected.length) {
        let text = node[field] || "",
          ranges = node.labelStyleRanges || [];
        for (const match of selected) {
          const edited = replaceMindmapText(
            text,
            ranges,
            match.start,
            match.end,
            replacement
          );
          text = edited.label;
          ranges = edited.labelStyleRanges;
        }
        patch[field] = text;
        if (field === "label") patch.labelStyleRanges = ranges;
      }
    }
    next = applyMindmapCommand(next, {
      type: "patch",
      nodeIds: [id],
      patch,
    }).object;
  }
  return { object: next, count: targets.length };
}
