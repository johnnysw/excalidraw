import { useEffect, useRef, useState } from "react";
import type React from "react";
import {
  applyMindmapCommand,
  expandMindmapForSearch,
  resolveMindmapDropIntent,
  resolveMindmapEdgePan,
  resolveMindmapObjectGeometry,
} from "@excalidraw/mindmap";
import type {
  MindmapDropIntent,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { CoursewareMindmapController } from "../../coursewareMindmap/controller";
export function useMindmapOutlineDrag(controller: CoursewareMindmapController) {
  const [state, setState] = useState<{
    sourceId: string;
    intent: MindmapDropIntent | null;
    invalid: boolean;
    warning: string | null;
    expanded: WhiteboardMindmapObject | null;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    hovered = useRef("");
  const initial = useRef<WhiteboardMindmapObject | null>(null);
  const clear = () => {
    clearTimeout(timer.current);
    hovered.current = "";
    initial.current = null;
    setState(null);
    controller.host.showPreview(null);
  };
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      controller.host.showPreview(null);
    },
    [controller],
  );
  useEffect(() => {
    if (!state) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
    };
    const blur = () => clear();
    window.addEventListener("keydown", cancel, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", cancel, true);
      window.removeEventListener("blur", blur);
    };
  }, [Boolean(state)]);
  const start = (id: string) => {
    initial.current = controller.model;
    setState({
      sourceId: id,
      intent: null,
      invalid: false,
      warning: null,
      expanded: null,
    });
  };
  const over = (event: React.DragEvent<HTMLElement>, id: string) => {
    if (!state || !initial.current) return;
    event.preventDefault();
    const latest = controller.host.readLatest()[initial.current.id];
    const element = controller.app.scene
      .getNonDeletedElementsMap()
      .get(initial.current.id);
    if (
      !controller.documentEditable ||
      !latest?.nodes[state.sourceId] ||
      !latest.nodes[id] ||
      element?.locked
    ) {
      clear();
      return;
    }
    const current = state.expanded ?? latest,
      rect = event.currentTarget.getBoundingClientRect();
    const intent =
      resolveMindmapDropIntent({
        point: { x: event.clientX, y: event.clientY },
        node: resolveMindmapObjectGeometry(current).nodes[id],
        bounds: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        rootId: current.rootId,
        axis: "y",
      }) ?? null;
    const result =
      intent &&
      applyMindmapCommand(current, {
        type: "move",
        nodeIds: [state.sourceId],
        target: intent.target,
      });
    const invalid = !result?.changed;
    try {
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = invalid ? "none" : "move";
    } catch {
      /* Some clipboard adapters expose a read-only dropEffect; the visible intent remains authoritative. */
    }
    setState({
      ...state,
      intent,
      invalid,
      warning: result?.removedSummaryIds.length
        ? `此移动会移除 ${result.removedSummaryIds.length} 个不再连续的概要`
        : null,
    });
    if (!invalid && result)
      controller.host.showPreview({ [current.id]: result.object });
    else controller.host.showPreview(null);
    const tree = event.currentTarget.closest<HTMLElement>("[role=tree]");
    if (tree) {
      const b = tree.getBoundingClientRect(),
        pan = resolveMindmapEdgePan(
          { x: event.clientX, y: event.clientY },
          { x: b.left, y: b.top, width: b.width, height: b.height },
        );
      tree.scrollTop += pan.y;
    }
    if (hovered.current !== id) {
      clearTimeout(timer.current);
      hovered.current = id;
      if (!invalid && latest.nodes[id].collapsed)
        timer.current = setTimeout(() => {
          setState((previous) =>
            previous
              ? {
                  ...previous,
                  expanded: expandMindmapForSearch(
                    applyMindmapCommand(latest, {
                      type: "collapse",
                      nodeIds: [id],
                      collapsed: false,
                    }).object,
                    id,
                  ),
                }
              : null,
          );
        }, 600);
    }
  };
  const drop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!state?.intent || state.invalid || !initial.current) {
      clear();
      return;
    }
    const latest = controller.host.readLatest()[initial.current.id];
    const element = controller.app.scene
      .getNonDeletedElementsMap()
      .get(initial.current.id);
    if (!latest || element?.locked || !controller.documentEditable) {
      clear();
      return;
    }
    const expanded = state.expanded
      ? applyMindmapCommand(latest, {
          type: "collapse",
          nodeIds: [state.intent.nodeId],
          collapsed: false,
        }).object
      : latest;
    const result = applyMindmapCommand(expanded, {
      type: "move",
      nodeIds: [state.sourceId],
      target: state.intent.target,
    });
    if (result.changed)
      controller.commitBatch(new Map([[latest.id, result.object]]));
    else controller.app.setToast({ message: "目标已改变，移动已取消" });
    clear();
  };
  return { state, start, over, drop, clear };
}
