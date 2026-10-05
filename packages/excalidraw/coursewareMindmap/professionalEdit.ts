import type {
  MindmapObject,
  MindmapBoundary,
  MindmapRelation,
  MindmapSummary,
} from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "./controller";
import { resolveMindmapProfessionalEdit } from "@excalidraw/mindmap";
export type MindmapProfessionalEntry =
  | { type: "summary"; value: MindmapSummary }
  | { type: "boundary"; value: MindmapBoundary }
  | { type: "relation"; value: MindmapRelation };

export function getMindmapProfessionalEntries(
  model: MindmapObject,
): MindmapProfessionalEntry[] {
  return [
    ...(model.summaries ?? []).map((value) => ({
      type: "summary" as const,
      value,
    })),
    ...(model.boundaries ?? []).map((value) => ({
      type: "boundary" as const,
      value,
    })),
    ...(model.relations ?? []).map((value) => ({
      type: "relation" as const,
      value,
    })),
  ];
}

export function createMindmapProfessionalDraft(
  kind: MindmapProfessionalEntry["type"],
  fields: {
    id: string;
    members: string[];
    label: string;
    color: string;
    lineStyle: "solid" | "dash" | "dot";
    bracket: "square" | "curve";
    shape: "rectangle" | "rounded-rectangle";
    sourceId: string;
    target: string;
    relationStyle: "curve" | "round-angle" | "right-angle";
    startArrow: boolean;
    endArrow: boolean;
  },
): MindmapProfessionalEntry {
  const { id, members, label, color, lineStyle } = fields;
  if (kind === "summary")
    return {
      type: kind,
      value: {
        id,
        nodeIds: members,
        label: label || "概要",
        color,
        lineStyle,
        bracketStyle: fields.bracket,
      },
    };
  if (kind === "boundary")
    return {
      type: kind,
      value: {
        id,
        nodeIds: members,
        title: label || undefined,
        stroke: color,
        lineStyle,
        shape: fields.shape,
      },
    };
  return {
    type: kind,
    value: {
      id,
      sourceId: fields.sourceId,
      targetId: fields.target,
      label: label || undefined,
      color,
      lineStyle,
      style: fields.relationStyle,
      startArrow: fields.startArrow,
      endArrow: fields.endArrow,
    },
  };
}

/** A professional editor only changes dirty fields on the latest captured object. */
export function commitMindmapProfessionalEdit(
  controller: CoursewareMindmapController,
  mapId: string,
  original: MindmapProfessionalEntry,
  baselineDraft: MindmapProfessionalEntry,
  draft: MindmapProfessionalEntry,
) {
  const model = controller.host.readLatest()[mapId];
  const latest =
    model &&
    getMindmapProfessionalEntries(model).find(
      (entry) =>
        entry.type === original.type && entry.value.id === original.value.id,
    )?.value;
  const conflict = () => {
    controller.app.setToast({ message: "结构对象已发生变化，本次编辑已取消" });
    return false;
  };
  if (
    !controller.editable ||
    model?.locked ||
    controller.model?.id !== mapId ||
    !latest ||
    original.type !== draft.type
  )
    return conflict();
  const before = baselineDraft.value as unknown as Record<string, unknown>;
  const after = draft.value as unknown as Record<string, unknown>;
  const changed = Object.keys(after).filter(
    (field) =>
      field !== "id" &&
      JSON.stringify(after[field]) !== JSON.stringify(before[field]),
  );
  if (!changed.length) return true;
  const sparseDraft = { ...original.value };
  for (const field of changed)
    (sparseDraft as unknown as Record<string, unknown>)[field] = after[field];
  const result = resolveMindmapProfessionalEdit(
    latest,
    original.value,
    sparseDraft,
  );
  if (result.status === "conflict" || result.status === "missing")
    return conflict();
  if (result.status === "noop") return true;
  const value = result.value!;
  if (draft.type === "summary")
    controller.command({ type: "summary", value: value as typeof draft.value });
  if (draft.type === "boundary")
    controller.command({
      type: "boundary",
      value: value as typeof draft.value,
    });
  if (draft.type === "relation")
    controller.command({
      type: "relation",
      value: value as typeof draft.value,
    });
  return true;
}

export function normalizeMindmapProfessionalDraft(
  entry: MindmapProfessionalEntry,
): MindmapProfessionalEntry {
  if (entry.type === "summary")
    return {
      type: entry.type,
      value: {
        id: entry.value.id,
        nodeIds: entry.value.nodeIds,
        label: entry.value.label || "概要",
        color: entry.value.color ?? "#64748b",
        lineStyle: entry.value.lineStyle ?? "solid",
        bracketStyle: entry.value.bracketStyle ?? "square",
      },
    };
  if (entry.type === "boundary")
    return {
      type: entry.type,
      value: {
        id: entry.value.id,
        nodeIds: entry.value.nodeIds,
        title: entry.value.title || undefined,
        stroke: entry.value.stroke ?? "#64748b",
        lineStyle: entry.value.lineStyle ?? "solid",
        shape: entry.value.shape ?? "rounded-rectangle",
      },
    };
  return {
    type: entry.type,
    value: {
      id: entry.value.id,
      sourceId: entry.value.sourceId,
      targetId: entry.value.targetId,
      label: entry.value.label || undefined,
      color: entry.value.color ?? "#64748b",
      lineStyle: entry.value.lineStyle ?? "solid",
      style: entry.value.style ?? "curve",
      startArrow: !!entry.value.startArrow,
      endArrow: entry.value.endArrow !== false,
    },
  };
}
