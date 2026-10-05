import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  coursewareMindmapLocalToScene,
  coursewareMindmapSceneToLocal,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
  isCoursewareMindmapElement,
  updateCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import {
  applyMindmapCommand,
  normalizeMindmapSelectionRoots,
  mindmapSubtreeNodeIds,
  resolveMindmapDropIntent,
  resolveMindmapSplitCandidate,
  resolveMindmapEdgePan,
} from "@excalidraw/mindmap";
import type {
  MindmapNodeMoveTarget,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "@excalidraw/element/types";
import type { CoursewareMindmapController } from "./controller";

export interface MindmapDragPointer {
  clientX: number;
  clientY: number;
  pointerId: number;
  altKey: boolean;
}
export interface MindmapDropIntent {
  elementId: string;
  nodeId: string;
  position: "inside" | "before" | "after";
}
/** Pointer state owns drafts; the host performs exactly one final document transaction. */
export function startMindmapDrag(
  controller: CoursewareMindmapController,
  event: MindmapDragPointer,
  source: ExcalidrawRectangleElement,
  nodeId: string,
) {
  const { app } = controller;
  const models = new Map<string, WhiteboardMindmapObject>();
  const elements = new Map<string, ExcalidrawRectangleElement>();
  app.scene.getNonDeletedElements().forEach((element) => {
    if (isCoursewareMindmapElement(element) && !element.locked) {
      elements.set(element.id, element);
      models.set(element.id, getCoursewareMindmap(element)!);
    }
  });
  const model = models.get(source.id)!;
  const groups = controller.selectionGroups();
  if (!groups.has(source.id)) groups.set(source.id, [nodeId]);
  if ([...groups.keys()].some((id) => !models.has(id))) {
    app.setToast({ message: "选中内容包含已删除或锁定导图，拖动已取消" });
    return () => {};
  }
  const roots = new Map(
    [...groups].map(([id, ids]) => [
      id,
      normalizeMindmapSelectionRoots(models.get(id)!, ids),
    ]),
  );
  const startWorld = viewportCoordsToSceneCoords(event, app.state);
  let moved = false,
    cancelled = false,
    intent: MindmapDropIntent | null = null;
  let latest = event,
    frame = 0,
    hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverKey = "",
    expanded: { elementId: string; nodeId: string } | null = null;
  let structuralCache: {
    key: string;
    models: Map<string, WhiteboardMindmapObject>;
  } | null = null;
  let expandedModel: WhiteboardMindmapObject | null = null;
  let next = new Map(models),
    translated: ExcalidrawRectangleElement[] = [];
  const manual = event.altKey && nodeId !== model.rootId;
  const manualDrafts = new Map<
    string,
    { object: WhiteboardMindmapObject; ids: string[] }
  >();
  const manualPreview = (id: string, dx: number, dy: number) => {
    const original = models.get(id)!;
    let draft = manualDrafts.get(id);
    if (!draft) {
      const object = applyMindmapCommand(original, {
        type: "manual-position",
        nodeIds: roots.get(id)!,
        dx,
        dy,
      }).object;
      if (object === original) return original;
      draft = {
        object,
        ids: roots
          .get(id)!
          .flatMap((nodeId) => mindmapSubtreeNodeIds(original, nodeId)),
      };
      manualDrafts.set(id, draft);
    }
    // These nodes belong exclusively to the gesture draft; the document retains every original reference.
    draft.ids.forEach((nodeId) => {
      draft!.object.nodes[nodeId].x = (original.nodes[nodeId].x ?? 0) + dx;
      draft!.object.nodes[nodeId].y = (original.nodes[nodeId].y ?? 0) + dy;
    });
    return { ...draft.object };
  };
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", blur);
    cancelAnimationFrame(frame);
    clearTimeout(hoverTimer);
    controller.notify({
      preview: null,
      previews: [],
      dropTargetId: null,
      dropIntent: null,
      splitCandidate: false,
      dropWarning: null,
    });
  };
  const valid = () =>
    controller.editable &&
    [...elements]
      .filter(([id]) => groups.has(id) || intent?.elementId === id)
      .every(
        ([id, element]) =>
          app.scene.getNonDeletedElementsMap().get(id)?.version ===
          element.version,
      );
  const render = (ev: MindmapDragPointer) => {
    if (!valid()) {
      cancelled = true;
      stop();
      return;
    }
    if (
      !moved &&
      Math.hypot(ev.clientX - event.clientX, ev.clientY - event.clientY) < 4
    )
      return;
    moved = true;
    next = new Map(models);
    translated = [];
    intent = null;
    let invalidTarget = false;
    const point = viewportCoordsToSceneCoords(ev, app.state);

    if (nodeId === model.rootId || manual) {
      roots.forEach((ids, id) => {
        const element = elements.get(id)!,
          current = models.get(id)!;
        if (ids.includes(current.rootId)) {
          const start = startWorld;
          translated.push({
            ...element,
            x: element.x + point.x - start.x,
            y: element.y + point.y - start.y,
          });
        } else {
          const local = coursewareMindmapSceneToLocal(element, point);
          const origin = coursewareMindmapSceneToLocal(element, startWorld);
          next.set(
            id,
            manualPreview(id, local.x - origin.x, local.y - origin.y),
          );
        }
      });
    } else {
      for (const [id, element] of [...elements].reverse()) {
        let current = models.get(id)!;
        if (expanded?.elementId === id && expandedModel)
          current = expandedModel;
        const display =
          current === models.get(id)
            ? element
            : updateCoursewareMindmapElement(element, current);
        const geometry = getCoursewareMindmapGeometry(display)!;
        const cursor = coursewareMindmapSceneToLocal(display, point);
        const scale =
          (app.state.zoom.value * display.width) /
          Math.max(1, geometry.bounds.width);
        const drop = Object.values(geometry.nodes)
          .map((box) =>
            resolveMindmapDropIntent({
              point: { x: cursor.x * scale, y: cursor.y * scale },
              node: box,
              bounds: {
                x: box.x * scale,
                y: box.y * scale,
                width: box.width * scale,
                height: box.height * scale,
              },
              rootId: current.rootId,
              minHitSize: 24,
            }),
          )
          .find(Boolean);
        if (!drop) continue;
        const hit = geometry.nodes[drop.nodeId];
        const position = drop.kind;
        const target: MindmapNodeMoveTarget = drop.target;
        const cacheKey = `${id}:${drop.nodeId}:${position}:${expanded?.elementId ?? ""}:${expanded?.nodeId ?? ""}`;
        const proposed =
          structuralCache?.key === cacheKey
            ? structuralCache.models
            : controller.previewTransfer(models, roots, id, target, current);
        if (proposed) structuralCache = { key: cacheKey, models: proposed };
        if (!proposed) {
          invalidTarget = true;
          continue;
        }
        next = proposed;
        intent = { elementId: id, nodeId: hit.id, position };
        break;
      }
      const key = intent ? `${intent.elementId}:${intent.nodeId}` : "";
      if (key !== hoverKey) {
        clearTimeout(hoverTimer);
        hoverKey = key;
        if (
          intent &&
          models.get(intent.elementId)?.nodes[intent.nodeId]?.collapsed
        ) {
          const target = intent;
          hoverTimer = setTimeout(() => {
            expanded = target;
            expandedModel = applyMindmapCommand(models.get(target.elementId)!, {
              type: "collapse",
              nodeIds: [target.nodeId],
              collapsed: false,
            }).object;
            structuralCache = null;
            render(latest);
          }, 600);
        }
      }
    }
    const mapBounds = [...elements.values()].map((element) => {
      const geometry = getCoursewareMindmapGeometry(element)!;
      const corners = [
        { x: geometry.bounds.x, y: geometry.bounds.y },
        { x: geometry.bounds.x + geometry.bounds.width, y: geometry.bounds.y },
        { x: geometry.bounds.x, y: geometry.bounds.y + geometry.bounds.height },
        {
          x: geometry.bounds.x + geometry.bounds.width,
          y: geometry.bounds.y + geometry.bounds.height,
        },
      ].map((p) => coursewareMindmapLocalToScene(element, p));
      const xs = corners.map(
        (p) =>
          (p.x + app.state.scrollX) * app.state.zoom.value +
          app.state.offsetLeft,
      );
      const ys = corners.map(
        (p) =>
          (p.y + app.state.scrollY) * app.state.zoom.value +
          app.state.offsetTop,
      );
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    });
    const split =
      !intent &&
      !manual &&
      nodeId !== model.rootId &&
      resolveMindmapSplitCandidate(
        { x: ev.clientX, y: ev.clientY },
        { x: event.clientX, y: event.clientY },
        mapBounds,
      );
    if (!intent && !manual && nodeId !== model.rootId) {
      // A complete moving branch remains visible even when the drop has no valid target.
      roots.forEach((ids, id) => {
        const element = elements.get(id)!;
        const local = coursewareMindmapSceneToLocal(element, point);
        const origin = coursewareMindmapSceneToLocal(element, startWorld);
        next.set(id, manualPreview(id, local.x - origin.x, local.y - origin.y));
      });
    }
    const previews = [
      ...translated,
      ...[...next]
        .filter(([id, current]) => current !== models.get(id))
        .map(([id, current]) =>
          updateCoursewareMindmapElement(elements.get(id)!, current),
        ),
    ];
    const remainingSummaries = new Set(
      [...next.values()].flatMap((item) =>
        (item.summaries ?? []).map((summary) => summary.id),
      ),
    );
    const removedSummaries = intent
      ? [...models.values()]
          .flatMap((item) => item.summaries ?? [])
          .filter((summary) => !remainingSummaries.has(summary.id)).length
      : 0;
    controller.notify({
      dropWarning: removedSummaries
        ? `此移动会移除 ${removedSummaries} 个不再连续的概要`
        : invalidTarget && !intent
          ? "无法移动到当前主题"
          : null,
      previews,
      preview:
        previews.find((item) => item.id === source.id) ?? previews[0] ?? null,
      dropTargetId: intent?.nodeId ?? null,
      dropIntent: intent,
      splitCandidate: split,
    });
  };
  const tick = () => {
    if (moved && !cancelled) {
      const pan = resolveMindmapEdgePan(
        { x: latest.clientX, y: latest.clientY },
        {
          x: app.state.offsetLeft,
          y: app.state.offsetTop,
          width: app.state.width,
          height: app.state.height,
        },
      );
      if (pan.x || pan.y) {
        app.setState({
          scrollX: app.state.scrollX - pan.x / app.state.zoom.value,
          scrollY: app.state.scrollY - pan.y / app.state.zoom.value,
        });
        render(latest);
      }
    }
    frame = requestAnimationFrame(tick);
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId === event.pointerId) {
      latest = ev;
      render(ev);
    }
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== event.pointerId) return;
    const split = controller.getSnapshot().splitCandidate;
    const drop = intent;
    const previews = controller.getSnapshot().previews;
    stop();
    if (!moved || cancelled || ev.type === "pointercancel" || !valid()) return;
    if (translated.length || manual) controller.commitTranslated(previews, translated.length ? viewportCoordsToSceneCoords(ev, app.state) : undefined);
    else if (drop)
      controller.commitTransferGroups(models, roots, drop, expanded);
    else if (split)
      controller.splitBranches(
        roots,
        viewportCoordsToSceneCoords(ev, app.state),
      );
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      cancelled = true;
      stop();
    }
  };
  const blur = () => {
    cancelled = true;
    stop();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", blur);
  frame = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    stop();
  };
}
