import React, { useState } from "react";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export const MindmapNodeContentSettings = ({
  controller,
}: {
  controller: CoursewareMindmapController;
}) => {
  const { node, model } = controller;
  const [mergeSource, setMergeSource] = useState("");
  if (!node || !model) return null;
  const otherMaps = Object.values(controller.host.readLatest()).filter(
    (item) => item.id !== model.id && !item.locked,
  );
  return (
    <section
      className="Courseware-mindmap-workspace-section"
      aria-label="主题内容与位置"
    >
      <label>
        链接
        <input
          key={`${node.id}:${node.link}`}
          aria-label="主题链接"
          type="url"
          defaultValue={node.link ?? ""}
          readOnly={!controller.editable}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value !== node.link)
              controller.command({
                type: "patch",
                nodeIds: [node.id],
                patch: { link: value || undefined },
              });
          }}
        />
      </label>
      {node.link && (
        <button onClick={(event) => controller.openNodeLink(event.nativeEvent)}>
          打开链接
        </button>
      )}
      <label>
        标签
        <input
          key={`${node.id}:${node.tags?.join(",")}`}
          aria-label="主题标签"
          defaultValue={node.tags?.join(", ") ?? ""}
          placeholder="以逗号分隔"
          readOnly={!controller.editable}
          onBlur={(event) =>
            controller.command({
              type: "patch",
              nodeIds: [node.id],
              patch: {
                tags: [
                  ...new Set(
                    event.target.value
                      .split(/[,，]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  ),
                ],
              },
            })
          }
        />
      </label>
      {node.id !== model.rootId && (
        <fieldset disabled={!controller.editable}>
          <legend>手动调整分支位置</legend>
          <div
            className="Courseware-mindmap-manual-position"
            role="group"
            aria-label="移动当前分支"
          >
            {[
              { label: "向左移动分支", dx: -16, dy: 0, icon: "←" },
              { label: "向上移动分支", dx: 0, dy: -16, icon: "↑" },
              { label: "向下移动分支", dx: 0, dy: 16, icon: "↓" },
              { label: "向右移动分支", dx: 16, dy: 0, icon: "→" },
            ].map((item) => (
              <button
                key={item.label}
                aria-label={item.label}
                onClick={() =>
                  controller.command({
                    type: "manual-position",
                    nodeIds: controller.getSnapshot().selectedNodeIds,
                    dx: item.dx * (model.layoutScale ?? 1),
                    dy: item.dy * (model.layoutScale ?? 1),
                  })
                }
              >
                {item.icon}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <button
        disabled={!controller.editable}
        onClick={() =>
          controller.command({
            type: "reset-position",
            nodeIds: controller.getSnapshot().selectedNodeIds,
          })
        }
      >
        恢复分支自动布局
      </button>
      <button
        disabled={!controller.editable || node.id === model.rootId}
        onClick={() => controller.splitBranches()}
      >
        拆为独立导图
      </button>
      {!!otherMaps.length && (
        <>
          <label>
            合并导图
            <select
              aria-label="选择待合并导图"
              value={mergeSource}
              onChange={(event) => setMergeSource(event.target.value)}
            >
              <option value="">选择导图</option>
              {otherMaps.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nodes[item.rootId].label}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!controller.editable || !mergeSource}
            onClick={() => {
              controller.mergeMap(mergeSource);
              setMergeSource("");
            }}
          >
            合并到当前主题
          </button>
        </>
      )}
    </section>
  );
};
