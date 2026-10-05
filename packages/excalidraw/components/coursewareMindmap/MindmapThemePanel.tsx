import React, { useState } from "react";
import { MINDMAP_THEMES } from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapThemePanel = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const [scope, setScope] = useState<"node" | "branch" | "map">("node");
  const { model, node } = controller;
  if (!model || !node) return null;
  return (
    <section
      className="Courseware-mindmap-workspace-section"
      aria-label="脑图主题和样式范围"
    >
      <div className="Courseware-mindmap-theme-grid">
        {MINDMAP_THEMES.map((theme) => (
          <button
            key={theme.id}
            aria-pressed={model.theme?.id === theme.id}
            disabled={!controller.editable}
            onClick={() => controller.command({ type: "theme", theme })}
          >
            <span
              style={{
                background: theme.root.fill,
                color: theme.root.color,
                borderColor: theme.root.stroke,
              }}
            >
              {theme.name}
            </span>
            <i style={{ color: theme.connector }}>— 分支主题</i>
          </button>
        ))}
      </div>
      <label>
        应用范围
        <select
          aria-label="节点样式应用范围"
          value={scope}
          onChange={(event) => setScope(event.target.value as typeof scope)}
        >
          <option value="node">当前节点</option>
          <option value="branch">当前分支</option>
          <option value="map">整张导图</option>
        </select>
      </label>
      <button
        disabled={!controller.editable}
        onClick={() =>
          controller.command({
            type: "patch",
            nodeIds: controller.getSnapshot().selectedNodeIds,
            patch: controller.clipboard.currentStyle(),
            scope,
          })
        }
      >
        应用当前节点样式
      </button>
      <button
        disabled={!controller.editable}
        onClick={() =>
          controller.command({
            type: "reset-style",
            nodeIds: controller.getSnapshot().selectedNodeIds,
            scope,
          })
        }
      >
        重置为主题样式
      </button>
      <p>切换主题保留手工设置；重置将清除所选范围的样式覆盖。</p>
    </section>
  );
};
