import React, { useEffect, useRef } from "react";
import {
  MindmapEditSession,
  isMindmapComposing,
  resolveMindmapKeyboardDecision,
} from "@excalidraw/mindmap";
import type {
  MindmapLabelStyleRange,
  WhiteboardMindmapNode,
} from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
import { patchMindmapNode } from "../../coursewareMindmap/operations";
/** Outline input shares the same draft/rebase rules while keeping focus in the outline. */
export const MindmapOutlineEditor = ({
  controller,
  node,
  mapId,
}: {
  controller: CoursewareMindmapController;
  node: WhiteboardMindmapNode;
  mapId: string;
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inlineSession =
    controller.getSnapshot().editing === "label" &&
    controller.getSnapshot().selection?.nodeId === node.id;
  const inline = useRef(inlineSession);
  inline.current = inlineSession;
  const session = useRef<MindmapEditSession | null>(null);
  const cancelled = useRef(false);
  const history = useRef<{ value: string; ranges: MindmapLabelStyleRange[] }[]>(
      [],
    ),
    cursor = useRef(0);
  useEffect(() => {
    if (!inlineSession || !controller.editSession || !inputRef.current) return;
    session.current = controller.editSession;
    cancelled.current = false;
    history.current = [
      {
        value: session.current.value,
        ranges: [...session.current.labelStyleRanges],
      },
    ];
    cursor.current = 0;
    inputRef.current.value = session.current.value;
    inputRef.current.focus();
    inputRef.current.select();
  }, [inlineSession, controller]);
  const focus = () => {
    if (inline.current && controller.editSession) {
      session.current = controller.editSession;
      return;
    }
    controller.select(mapId, node.id);
    const latest = controller.host.readLatest()[mapId];
    if (!latest?.nodes[node.id] || !controller.editable) return;
    session.current = new MindmapEditSession(latest, node.id, "label");
    cancelled.current = false;
    history.current = [
      {
        value: session.current.value,
        ranges: [...session.current.labelStyleRanges],
      },
    ];
    cursor.current = 0;
  };
  const preview = (input: HTMLTextAreaElement) => {
    const current = session.current;
    if (!current) return;
    const draft = current.preview();
    controller.host.showPreview({
      [mapId]:
        current.value !== node.label
          ? patchMindmapNode(draft, node.id, {
              widthMode: "auto",
              textMaxWidth: undefined,
            })
          : draft,
    });
    input.style.height = "auto";
    input.style.height = `${Math.max(28, input.scrollHeight)}px`;
  };
  const finish = (save: boolean) => {
    const current = session.current;
    session.current = null;
    if (!current) return;
    if (inline.current) {
      controller.finishEditing(save && !cancelled.current, current.value);
      return;
    }
    if (!save || cancelled.current) current.cancel();
    else {
      const latest = controller.host.readLatest()[mapId];
      const element = controller.app.scene
        .getNonDeletedElementsMap()
        .get(mapId);
      if (
        !latest?.nodes[node.id] ||
        !controller.documentEditable ||
        element?.locked
      )
        controller.app.setToast({ message: "原主题已删除或锁定，编辑已取消" });
      else {
        if (!current.value.trim()) current.update("主题", []);
        try {
          const result = current.commit(latest);
          if (result?.changed) {
            const next =
              current.value !== latest.nodes[node.id].label
                ? patchMindmapNode(result.object, node.id, {
                    widthMode: "auto",
                    textMaxWidth: undefined,
                  })
                : result.object;
            controller.commitBatch(new Map([[mapId, next]]));
          } else if (!result)
            controller.app.setToast({
              message: "主题已发生变化，本次编辑已取消",
            });
        } catch {
          controller.app.setToast({
            message: "主题已发生变化，本次编辑已取消",
          });
        }
      }
    }
    controller.host.showPreview(null);
  };
  return (
    <textarea
      ref={inputRef}
      rows={1}
      aria-label={`大纲主题 ${node.label}`}
      defaultValue={node.label}
      readOnly={!controller.editable}
      onFocus={focus}
      onChange={(event) => {
        const current = session.current;
        if (!current) return;
        current.update(event.currentTarget.value);
        history.current = history.current.slice(0, cursor.current + 1);
        history.current.push({
          value: current.value,
          ranges: [...current.labelStyleRanges],
        });
        cursor.current = history.current.length - 1;
        preview(event.currentTarget);
      }}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (isMindmapComposing(event.nativeEvent)) return;
        const current = session.current;
        if (
          (event.ctrlKey || event.metaKey) &&
          ["z", "y"].includes(event.key.toLowerCase()) &&
          current
        ) {
          event.preventDefault();
          cursor.current = Math.max(
            0,
            Math.min(
              history.current.length - 1,
              cursor.current +
                (event.shiftKey || event.key.toLowerCase() === "y" ? 1 : -1),
            ),
          );
          const entry = history.current[cursor.current];
          current.update(entry.value, entry.ranges);
          event.currentTarget.value = entry.value;
          preview(event.currentTarget);
          return;
        }
        const decision = resolveMindmapKeyboardDecision({
          key: event.key,
          shiftKey: event.shiftKey,
          editing: "label",
          isRoot: !node.parentId,
        });
        if (decision === "cancel") {
          event.preventDefault();
          cancelled.current = true;
          event.currentTarget.value = node.label;
          event.currentTarget.blur();
        } else if (
          decision === "commit" ||
          decision === "commit-add-child" ||
          decision === "commit-add-parent"
        ) {
          event.preventDefault();
          event.currentTarget.blur();
          if (decision === "commit")
            event.currentTarget
              .closest<HTMLElement>("[role=treeitem]")
              ?.focus();
          else {
            controller.select(mapId, node.id);
            controller.add(
              decision === "commit-add-child" ? "child" : "parent",
            );
          }
        }
      }}
    />
  );
};
