import React, { useState } from "react";
import { buildMindmapTreeIndex, childrenOf } from "@excalidraw/mindmap";
import { useMindmapOutlineDrag } from "./useMindmapOutlineDrag";
import { MindmapOutlineEditor } from "./MindmapOutlineEditor";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapOutlinePanel = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const drag = useMindmapOutlineDrag(controller);
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState("");
  const model = drag.state?.expanded ?? controller.model;
  if (!model) return null;
  const index = buildMindmapTreeIndex(model);
  const selected = controller.getSnapshot().selectedNodeIds;
  return (
    <section
      aria-label="脑图大纲"
      className="Courseware-mindmap-workspace-section"
    >
      <div
        className="Courseware-mindmap-outline"
        role="tree"
        aria-label="主题大纲"
      >
        {index.visibleIds.map((id) => {
          const node = model.nodes[id],
            depth = index.depth.get(id) ?? 0;
          return (
            <div
              key={id}
              role="treeitem"
              aria-selected={selected.includes(id)}
              aria-level={depth + 1}
              tabIndex={0}
              onFocus={(event) => {
                if (event.target === event.currentTarget)
                  controller.select(model.id, id);
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget) {
                  controller.select(model.id, id);
                  controller.keyDown(event);
                }
              }}
              aria-expanded={
                childrenOf(model, id).length ? !node.collapsed : undefined
              }
              className={[
                selected.includes(id) ? "is-selected" : "",
                drag.state?.intent?.nodeId === id
                  ? `is-drop-${drag.state.invalid ? "invalid" : drag.state.intent.kind}`
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ paddingLeft: depth * 16 }}
              draggable={controller.editable && id !== model.rootId}
              onDragStart={(event) => {
                event.dataTransfer?.setData("text/plain", id);
                drag.start(id);
              }}
              onDragEnd={drag.clear}
              onDragOver={(event) => drag.over(event, id)}
              onDrop={drag.drop}
            >
              <button
                aria-label={node.collapsed ? "展开大纲分支" : "折叠大纲分支"}
                disabled={!childrenOf(model, id).length || !controller.editable}
                onClick={() => {
                  controller.select(model.id, id);
                  controller.toggleCollapse();
                }}
              >
                {childrenOf(model, id).length
                  ? node.collapsed
                    ? "▸"
                    : "▾"
                  : "·"}
              </button>
              <MindmapOutlineEditor
                key={`${id}:${node.label}`}
                controller={controller}
                node={node}
                mapId={model.id}
              />
              <button
                aria-label={`定位主题 ${node.label}`}
                onClick={() => controller.revealNode(id)}
              >
                ◎
              </button>
            </div>
          );
        })}
      </div>
      {drag.state?.invalid && <p role="status">无法移动到当前主题</p>}
      {drag.state?.warning && <p role="status">{drag.state.warning}</p>}
      <label>
        批量录入
        <textarea
          aria-label="批量录入大纲"
          rows={5}
          value={bulk}
          placeholder={"主题一\n  子主题\n主题二"}
          onChange={(event) => setBulk(event.target.value)}
        />
      </label>
      <button
        disabled={!controller.editable || !bulk.trim()}
        onClick={() => {
          setError("");
          void controller
            .importExchange(bulk, "markdown", "child", "branches")
            .then(() => setBulk(""))
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : "导入失败"),
            );
        }}
      >
        插入当前主题
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
};
