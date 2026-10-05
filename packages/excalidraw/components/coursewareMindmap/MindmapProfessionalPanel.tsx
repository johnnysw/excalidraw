import React, { useRef, useState } from "react";
import {
  commitMindmapProfessionalEdit,
  createMindmapProfessionalDraft,
  getMindmapProfessionalEntries,
  normalizeMindmapProfessionalDraft,
} from "../../coursewareMindmap/professionalEdit";
import { MindmapProfessionalList } from "./MindmapProfessionalList";
import { MindmapProfessionalControls } from "./MindmapProfessionalControls";
import { isValidMindmapSummary } from "@excalidraw/mindmap";
import type {
  MindmapBoundary,
  MindmapRelation,
  MindmapSummary,
} from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";

type Entry =
  | { type: "summary"; value: MindmapSummary }
  | { type: "boundary"; value: MindmapBoundary }
  | { type: "relation"; value: MindmapRelation };
export const MindmapProfessionalPanel = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const { model, node } = controller;
  const [editing, setEditing] = useState<Entry | null>(null);
  const editBaseline = useRef<{ mapId: string; draft: Entry } | null>(null);
  const [kind, setKind] = useState<Entry["type"]>("summary");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#64748b");
  const [lineStyle, setLineStyle] = useState<"solid" | "dash" | "dot">("solid");
  const [shape, setShape] = useState<"rectangle" | "rounded-rectangle">(
    "rounded-rectangle",
  );
  const [bracket, setBracket] = useState<"square" | "curve">("square");
  const [relationStyle, setRelationStyle] = useState<
    "curve" | "round-angle" | "right-angle"
  >("curve");
  const [startArrow, setStartArrow] = useState(false),
    [endArrow, setEndArrow] = useState(true);
  const [targetId, setTargetId] = useState("");
  if (!model || !node) return null;
  const ids = controller.getSnapshot().selectedNodeIds;
  const members =
    editing && "nodeIds" in editing.value ? editing.value.nodeIds : ids;
  const validSummary = isValidMindmapSummary(model, { nodeIds: members });
  const target =
    targetId ||
    ids.find((id) => id !== node.id) ||
    model.order.find((id) => id !== node.id) ||
    "";
  const select = (entry: Entry) => {
    editBaseline.current = {
      mapId: model.id,
      draft: normalizeMindmapProfessionalDraft(entry),
    };
    setEditing(entry);
    setKind(entry.type);
    setLabel(
      entry.type === "boundary"
        ? (entry.value.title ?? "")
        : (entry.value.label ?? ""),
    );
    setColor(
      entry.type === "boundary"
        ? (entry.value.stroke ?? "#64748b")
        : (entry.value.color ?? "#64748b"),
    );
    setLineStyle(entry.value.lineStyle ?? "solid");
    if (entry.type === "summary")
      setBracket(entry.value.bracketStyle ?? "square");
    if (entry.type === "boundary")
      setShape(entry.value.shape ?? "rounded-rectangle");
    if (entry.type === "relation") {
      setTargetId(entry.value.targetId);
      setRelationStyle(entry.value.style ?? "curve");
      setStartArrow(!!entry.value.startArrow);
      setEndArrow(entry.value.endArrow !== false);
    }
  };
  const save = () => {
    const id = editing?.value.id ?? crypto.randomUUID();
    const commit = (entry: Entry) => {
      if (editing && editBaseline.current)
        commitMindmapProfessionalEdit(
          controller,
          editBaseline.current.mapId,
          editing,
          editBaseline.current.draft,
          entry,
        );
      else if (entry.type === "summary")
        controller.command({ type: entry.type, value: entry.value });
      else if (entry.type === "boundary")
        controller.command({ type: entry.type, value: entry.value });
      else controller.command({ type: entry.type, value: entry.value });
    };
    if (
      (kind !== "summary" || validSummary) &&
      (kind !== "relation" || target !== node.id)
    ) {
      commit(
        createMindmapProfessionalDraft(kind, {
          id,
          members,
          label,
          color,
          lineStyle,
          bracket,
          shape,
          sourceId:
            editing?.type === "relation" ? editing.value.sourceId : node.id,
          target,
          relationStyle,
          startArrow,
          endArrow,
        }),
      );
    }
    setEditing(null);
  };
  const entries = getMindmapProfessionalEntries(model);
  return (
    <section
      className="Courseware-mindmap-workspace-section"
      aria-label="概要外框和关联线"
    >
      <div
        className="Courseware-mindmap-workspace-tabs"
        role="tablist"
        aria-label="结构类型"
      >
        {(["summary", "boundary", "relation"] as const).map((type, index) => (
          <button
            key={type}
            role="tab"
            aria-selected={kind === type}
            onClick={() => {
              setKind(type);
              setEditing(null);
            }}
          >
            {["概要", "外框", "关联线"][index]}
          </button>
        ))}
      </div>
      <MindmapProfessionalControls
        {...{
          model,
          nodeId: node.id,
          kind,
          label,
          setLabel,
          color,
          setColor,
          lineStyle,
          setLineStyle,
          bracket,
          setBracket,
          validSummary,
          shape,
          setShape,
          target,
          setTargetId,
          relationStyle,
          setRelationStyle,
          startArrow,
          setStartArrow,
          endArrow,
          setEndArrow,
        }}
      />
      <button
        type="button"
        disabled={
          !controller.editable ||
          (kind === "summary" && !validSummary) ||
          (kind === "relation" && !target)
        }
        onClick={save}
      >
        {editing ? "保存修改" : "添加"}
      </button>
      <MindmapProfessionalList
        {...{
          entries,
          select,
          controller,
          editing,
          clearEditing: () => setEditing(null),
        }}
      />
    </section>
  );
};
