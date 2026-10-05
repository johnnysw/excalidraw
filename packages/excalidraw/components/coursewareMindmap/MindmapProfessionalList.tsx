import React from "react";
import type { MindmapProfessionalEntry } from "../../coursewareMindmap/professionalEdit";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapProfessionalList = ({
  entries,
  select,
  controller,
  editing,
  clearEditing,
}: {
  entries: MindmapProfessionalEntry[];
  select: (entry: MindmapProfessionalEntry) => void;
  controller: CoursewareMindmapController;
  editing: MindmapProfessionalEntry | null;
  clearEditing: () => void;
}) => (
  <div className="Courseware-mindmap-structure-list">
    {entries.map((entry) => (
      <div key={entry.value.id}>
        <button onClick={() => select(entry)}>
          {entry.type === "summary"
            ? "概要"
            : entry.type === "boundary"
              ? "外框"
              : "关联线"}{" "}
          ·{" "}
          {entry.type === "boundary"
            ? entry.value.title || "未命名"
            : entry.value.label || "未命名"}
        </button>
        <button
          aria-label="删除结构对象"
          disabled={!controller.editable}
          onClick={() => {
            controller.command({
              type: "remove-professional",
              id: entry.value.id,
            });
            if (editing?.value.id === entry.value.id) clearEditing();
          }}
        >
          ×
        </button>
      </div>
    ))}
  </div>
);
