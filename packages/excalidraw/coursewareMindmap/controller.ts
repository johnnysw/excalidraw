import {
  actionCopyAsPng,
  actionDuplicateSelection,
  actionToggleElementLock,
  actionBringForward,
  actionBringToFront,
  actionSendBackward,
  actionSendToBack,
} from "../actions";
import {
  CaptureUpdateAction,
  newElementWith,
  isCursorInFrame,
} from "@excalidraw/element";
import {
  createCoursewareMindmapElement,
  createCoursewareMindmapElementFromExchange,
  getCoursewareMindmapForExchange,
  getCoursewareMindmap,
  isCoursewareMindmapElement,
  updateCoursewareMindmapElement,
  hitCoursewareMindmapNode,
  getCoursewareMindmapGeometry,
  coursewareMindmapSceneToLocal,
  coursewareMindmapLocalToScene,
} from "@excalidraw/element/coursewareMindmap";
import {
  createCoursewareMindmapTransferElements,
  finalizeCoursewareMindmapElements,
} from "@excalidraw/element/coursewareMindmapTransfer";
import {
  createMindmapTemplateObject,
  addMindmapNode,
  addMindmapParent,
  removeMindmapNode,
  toggleMindmapNode,
  resolveMindmapNavigationTarget,
  layoutMindmap,
  childrenOf,
  mindmapSubtreeNodeIds,
  applyMindmapCommand,
  moveMindmapBranchesBetween,
  splitMindmapBranches,
  mergeMindmapInto,
  createMindmapObject,
  MindmapExchangeCodec,
  duplicateMindmapObject,
  replaceMindmapSearchMatches,
  expandMindmapForSearch,
  pasteMindmapExchangeBranches,
  MindmapEditSession,
  resolveMindmapKeyboardDecision,
  isMindmapComposing,
} from "@excalidraw/mindmap";
import type {
  WhiteboardMindmapObject,
  WhiteboardMindmapNode,
  MindmapNavigationKey,
  MindmapNodeMoveTarget,
  MindmapCommand,
  MindmapTransferResult,
} from "@excalidraw/mindmap";
import type { ExcalidrawRectangleElement } from "@excalidraw/element/types";
import type App from "../components/App";
import type { AppState } from "../types";
import {
  viewportCoordsToSceneCoords,
  wrapEvent,
  EVENT,
  normalizeLink,
  isLocalLink,
} from "@excalidraw/common";
import { COURSEWARE_MINDMAP_TOOL } from "./config";
import type { MindmapSelection, MindmapToolPreference } from "./config";
import {
  changeMindmapLayout,
  patchMindmapNode,
  removeMindmapArrows,
  expandMindmapAncestors,
} from "./operations";
import { MindmapClipboard } from "./clipboard";
import { startMindmapDrag } from "./drag";
import type { MindmapDropIntent } from "./drag";
import { CoursewareMindmapHostAdapter } from "./host";
import { updateMindmapFrameMembership } from "./frameMembership";

export interface MindmapEditorState {
  selection: MindmapSelection | null;
  preview: ExcalidrawRectangleElement | null;
  editing: "label" | "summary" | null;
  searchOpen: boolean;
  dropTargetId: string | null;
  dropIntent: MindmapDropIntent | null;
  splitCandidate: boolean;
  dropWarning: string | null;
  selectedNodeIds: string[];
  selections: MindmapSelection[];
  previews: ExcalidrawRectangleElement[];
  editingValue: string | null;
  outlineOpen: boolean;
  workspacePanel:
    | "outline"
    | "objects"
    | "theme"
    | "exchange"
    | "content"
    | null;
  minimapOpen: boolean;
  multiSelectMode: boolean;
  selectedImage: boolean;
  marquee: { left: number; top: number; width: number; height: number } | null;
}
type Pointer = {
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
};
export class CoursewareMindmapController {
  private snapshot: MindmapEditorState = {
    selection: null,
    preview: null,
    editing: null,
    searchOpen: false,
    dropTargetId: null,
    dropIntent: null,
    splitCandidate: false,
    dropWarning: null,
    selectedNodeIds: [],
    selections: [],
    previews: [],
    editingValue: null,
    outlineOpen: false,
    workspacePanel: null,
    minimapOpen: false,
    multiSelectMode: false,
    selectedImage: false,
    marquee: null,
  };
  private listeners = new Set<() => void>();
  private dragCleanup?: () => void;
  private template?: ExcalidrawRectangleElement;
  private previewNodePatch: Partial<WhiteboardMindmapNode> | null = null;
  private pendingCreation: {
    model: WhiteboardMindmapObject;
    parentId: string;
    previous: MindmapSelection;
    version: number;
  } | null = null;
  private textSession: MindmapEditSession | null = null;
  private textComposing = false;
  private originalText: string | undefined;
  private rememberedPointer: {
    clientX: number;
    clientY: number;
    selection: MindmapSelection;
  } | null = null;
  get editSession() {
    return this.textSession;
  }
  setTextComposing(value: boolean) {
    this.textComposing = value;
  }
  clipboard: MindmapClipboard;
  host: CoursewareMindmapHostAdapter;
  constructor(readonly app: App) {
    this.clipboard = new MindmapClipboard(this);
    this.host = new CoursewareMindmapHostAdapter(this);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  notify = (patch: Partial<MindmapEditorState>) => {
    if (patch.preview === null) {
      this.previewNodePatch = null;
      if (!patch.previews) patch.previews = [];
    }
    if (
      patch.selectedNodeIds &&
      !patch.selections &&
      (patch.selection ?? this.snapshot.selection)
    ) {
      const selected = patch.selection ?? this.snapshot.selection!;
      patch.selections = patch.selectedNodeIds.map((nodeId) => ({
        elementId: selected!.elementId,
        nodeId,
      }));
    }
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((fn) => fn());
  };
  get element() {
    const selected = this.snapshot.selection;
    const element =
      selected &&
      this.app.scene.getNonDeletedElementsMap().get(selected.elementId);
    return element && isCoursewareMindmapElement(element) ? element : null;
  }
  get model() {
    if (this.pendingCreation && this.snapshot.editing) {
      return this.pendingCreation.model;
    }
    const element = this.element;
    return element ? getCoursewareMindmap(element) : null;
  }
  get exchangeModel() {
    const element = this.element;
    return element ? getCoursewareMindmapForExchange(element) : null;
  }
  get node() {
    const model = this.model;
    return model && this.snapshot.selection
      ? model.nodes[this.snapshot.selection.nodeId]
      : null;
  }
  get enabled() {
    return (
      this.app.props.UIOptions.toolbarLayout === "left" &&
      this.app.props.role !== "member"
    );
  }
  get documentEditable() {
    return (
      this.enabled &&
      !this.app.state.viewModeEnabled &&
      !this.app.state.presentationMode
    );
  }
  get editable() {
    return this.documentEditable && !this.element?.locked;
  }
  setPreference(value: MindmapToolPreference) {
    this.template = undefined;
    this.app.setState({ coursewareMindmap: value });
  }
  select(elementId: string, nodeId: string) {
    this.textSession?.cancel();
    this.textSession = null;
    this.textComposing = false;
    this.pendingCreation = null;
    this.previewNodePatch = null;
    this.notify({
      selection: { elementId, nodeId },
      editing: null,
      preview: null,
      selectedNodeIds: [nodeId],
      selections: [{ elementId, nodeId }],
      previews: [],
      editingValue: null,
      selectedImage: false,
    });
    this.app.setState({
      selectedElementIds: {},
      selectedGroupIds: {},
      selectedLinearElement: null,
    });
  }
  clear() {
    this.textSession?.cancel();
    this.textSession = null;
    this.textComposing = false;
    this.pendingCreation = null;
    this.previewNodePatch = null;
    this.dragCleanup?.();
    this.notify({
      selection: null,
      preview: null,
      editing: null,
      dropTargetId: null,
      dropIntent: null,
      splitCandidate: false,
      dropWarning: null,
      selectedNodeIds: [],
      selections: [],
      previews: [],
      editingValue: null,
      selectedImage: false,
      searchOpen: false,
      outlineOpen: false,
      workspacePanel: null,
      marquee: null,
      multiSelectMode: false,
    });
  }
  selectWhole(after?: () => void) {
    const element = this.element;
    this.clear();
    if (element) {
      this.app.setState({ selectedElementIds: { [element.id]: true } }, after);
    }
    this.app.focusContainer();
  }
  commit(model: WhiteboardMindmapObject, removed = new Set<string>()) {
    const element = this.element;
    if (!element || !this.editable || model === getCoursewareMindmap(element)) {
      return;
    }
    const updated = updateCoursewareMindmapElement(element, model);
    const elements = this.app.scene
      .getElementsIncludingDeleted()
      .map((item) => {
        if (item.id === element.id) {
          return updated;
        }
        if (
          item.type === "arrow" &&
          [item.startBinding, item.endBinding].some(
            (binding) =>
              binding?.elementId === element.id &&
              binding.mindmapNodeId &&
              removed.has(binding.mindmapNodeId),
          )
        ) {
          return newElementWith(item, { isDeleted: true });
        }
        return item;
      });
    this.previewNodePatch = null;
    this.app.updateScene({
      elements: finalizeCoursewareMindmapElements(
        elements,
        new Set([element.id]),
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    this.app.addFiles([]);
    this.notify({ preview: null, dropTargetId: null });
  }
  patch(patch: Partial<WhiteboardMindmapNode>) {
    if (!this.editable) return;
    const targets = this.selectionGroups();
    if (targets.size > 1) {
      const changes = new Map<string, WhiteboardMindmapObject>();
      targets.forEach((ids, elementId) => {
        const item = this.app.scene.getNonDeletedElementsMap().get(elementId);
        if (!item || !isCoursewareMindmapElement(item) || item.locked) return;
        const current = getCoursewareMindmap(item)!;
        changes.set(
          elementId,
          applyMindmapCommand(current, { type: "patch", nodeIds: ids, patch })
            .object,
        );
      });
      this.commitBatch(changes);
      return;
    }
    const model = this.model;
    const node = this.node;
    if (model && node) {
      this.commit(
        applyMindmapCommand(model, {
          type: "patch",
          nodeIds: this.snapshot.selectedNodeIds,
          patch,
        }).object,
      );
    }
  }
  /** Preview continuous controls without changing the saved scene or history. */
  previewPatch(patch: Partial<WhiteboardMindmapNode> | null) {
    const { model, element } = this;
    if (!patch || !model || !element || !this.editable) {
      this.previewNodePatch = null;
      this.notify({ preview: null });
      return;
    }
    this.previewNodePatch = { ...this.previewNodePatch, ...patch };
    if (this.selectionGroups().size > 1) {
      const previews: ExcalidrawRectangleElement[] = [];
      this.selectionGroups().forEach((ids, elementId) => {
        const item = this.app.scene.getNonDeletedElementsMap().get(elementId);
        if (!item || !isCoursewareMindmapElement(item) || item.locked) return;
        const current = getCoursewareMindmap(item)!;
        const next = applyMindmapCommand(current, {
          type: "patch",
          nodeIds: ids,
          patch: this.previewNodePatch!,
        }).object;
        previews.push(updateCoursewareMindmapElement(item, next));
      });
      this.notify({
        previews,
        preview: previews.find((item) => item.id === element.id) ?? null,
      });
      return;
    }
    const next = applyMindmapCommand(model, {
      type: "patch",
      nodeIds: this.snapshot.selectedNodeIds,
      patch: this.previewNodePatch,
    }).object;
    this.notify({ preview: updateCoursewareMindmapElement(element, next) });
  }
  commitPreviewPatch() {
    const patch = this.previewNodePatch;
    this.previewNodePatch = null;
    if (patch && this.snapshot.preview) this.patch(patch);
    else this.notify({ preview: null });
  }
  add(relation: "child" | "sibling" | "parent") {
    const model = this.model;
    const node = this.node;
    if (!model || !node || !this.editable) {
      return;
    }
    const next =
      relation === "parent"
        ? addMindmapParent(model, node.id)
        : addMindmapNode(model, node.id, relation, "分支主题");
    if (next === model) {
      return;
    }
    const added = next.order.find((id) => !model.nodes[id]);
    if (added && this.snapshot.selection) {
      const element = this.element!;
      this.pendingCreation = {
        model: next,
        previous: this.snapshot.selection,
        parentId: node.id,
        version: element.version,
      };
      this.textSession = new MindmapEditSession(model, added, "label", {
        type: "add",
        anchorId: node.id,
        relation,
        label: "分支主题",
        nodeId: added,
      });
      this.notify({
        selection: { elementId: element.id, nodeId: added },
        selectedNodeIds: [added],
        selections: [{ elementId: element.id, nodeId: added }],
        editing: "label",
        editingValue: next.nodes[added].label,
        preview: updateCoursewareMindmapElement(element, next),
      });
    }
  }
  remove() {
    const model = this.model;
    const node = this.node;
    const element = this.element;
    if (!model || !node || !element || !this.editable) return;
    const groups = this.selectionGroups();
    if (groups.size > 1) {
      const changes = new Map<string, WhiteboardMindmapObject>();
      const removed = new Map<string, Set<string>>();
      const wholeIds = new Set<string>();
      groups.forEach((ids, id) => {
        const item = this.app.scene.getNonDeletedElementsMap().get(id);
        if (!item || !isCoursewareMindmapElement(item) || item.locked) return;
        const current = getCoursewareMindmap(item)!;
        if (ids.includes(current.rootId)) wholeIds.add(id);
        else {
          removed.set(
            id,
            new Set(
              ids.flatMap((nodeId) => mindmapSubtreeNodeIds(current, nodeId)),
            ),
          );
          changes.set(
            id,
            ids.reduce(
              (next, nodeId) => removeMindmapNode(next, nodeId),
              current,
            ),
          );
        }
      });
      this.commitBatch(changes, removed, wholeIds);
      this.clear();
      return;
    }
    const selected = this.snapshot.selectedNodeIds.length
      ? this.snapshot.selectedNodeIds
      : [node.id];
    if (selected.includes(model.rootId)) {
      const elements = this.app.scene
        .getElementsIncludingDeleted()
        .map((item) =>
          item.id === element.id ||
          (item.type === "arrow" &&
            [item.startBinding, item.endBinding].some(
              (binding) => binding?.elementId === element.id,
            ))
            ? newElementWith(item, { isDeleted: true })
            : item,
        );
      this.app.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      this.clear();
      return;
    }
    const removed = new Set(
      selected.flatMap((id) => [...removeMindmapArrows(model, id)]),
    );
    const next = selected.reduce(
      (result, id) => removeMindmapNode(result, id),
      model,
    );
    this.commit(next, removed);
    this.select(
      element.id,
      next.nodes[node.parentId!] ? node.parentId! : model.rootId,
    );
  }
  toggleCollapse() {
    const model = this.model;
    const node = this.node;
    if (model && node) {
      this.commit(toggleMindmapNode(model, node.id));
    }
  }
  setLayout(value: MindmapToolPreference, preview = false) {
    const model = this.model;
    const element = this.element;
    if (!model || !element) {
      return;
    }
    const next = changeMindmapLayout(model, value);
    if (preview) {
      this.notify({ preview: updateCoursewareMindmapElement(element, next) });
    } else {
      this.commit(next);
    }
  }
  startEditing(field: "label" | "summary" = "label", initialValue?: string) {
    if (this.editable && this.node) {
      this.originalText = this.node[field];
      this.textSession = new MindmapEditSession(
        this.model!,
        this.node.id,
        field,
      );
      if (initialValue !== undefined) this.textSession.update(initialValue, []);
      this.notify({
        editing: field,
        editingValue: initialValue ?? this.node[field] ?? "",
      });
    }
  }
  previewText(value: string) {
    const { model, element, node } = this;
    const field = this.snapshot.editing;
    if (!model || !element || !node || !field || !this.editable) return;
    this.textSession?.update(value);
    let next =
      this.textSession?.preview() ??
      patchMindmapNode(model, node.id, { [field]: value });
    if (field === "label" && value !== this.originalText) {
      next = patchMindmapNode(next, node.id, {
        widthMode: "auto",
        textMaxWidth: undefined,
      });
    }
    this.notify({ preview: updateCoursewareMindmapElement(element, next) });
  }
  finishEditing(save: boolean, value: string) {
    const field = this.snapshot.editing;
    const selected = this.snapshot.selection;
    const pending = this.pendingCreation;
    const session = this.textSession;
    if (!field || !selected) return;
    const element = this.element;
    this.pendingCreation = null;
    if (save && element && this.editable) {
      const model = getCoursewareMindmap(element)!;
      if (
        (pending && !model.nodes[pending.parentId]) ||
        (!pending &&
          model.nodes[selected.nodeId]?.[field] !== this.originalText)
      ) {
        this.app.setToast({ message: "主题已发生变化，本次编辑已取消" });
      } else {
        const text = value.trim() ? value : field === "label" ? "主题" : "";
        session?.update(text);
        const result = session?.commit(model);
        if (result?.changed) {
          const next =
            field === "label" && text !== model.nodes[selected.nodeId]?.label
              ? patchMindmapNode(result.object, selected.nodeId, {
                  widthMode: "auto",
                  textMaxWidth: undefined,
                })
              : result.object;
          this.commit(next);
        } else if (!result) {
          this.app.setToast({ message: "主题或样式已发生变化，本次编辑已取消" });
        }
      }
    }
    if (!save) session?.cancel();
    this.textSession = null;
    this.textComposing = false;
    this.notify({ editing: null, editingValue: null, preview: null });
    if (
      pending &&
      (!save ||
        !element ||
        !getCoursewareMindmap(element)?.nodes[selected.nodeId])
    ) {
      this.select(pending.previous.elementId, pending.previous.nodeId);
    }
    this.app.focusContainer();
  }
  selectionGroups() {
    const groups = new Map<string, string[]>();
    const selected = this.snapshot.selections.length
      ? this.snapshot.selections
      : this.snapshot.selection
        ? this.snapshot.selectedNodeIds.map((nodeId) => ({
            ...this.snapshot.selection!,
            nodeId,
          }))
        : [];
    selected.forEach(({ elementId, nodeId }) =>
      groups.set(elementId, [...(groups.get(elementId) ?? []), nodeId]),
    );
    return groups;
  }
  /** Every affected map and external arrow enters the same host history capture. */
  commitBatch(
    changes: Map<string, WhiteboardMindmapObject>,
    removed = new Map<string, Set<string>>(),
    deletedIds = new Set<string>(),
  ) {
    if (!this.documentEditable || (!changes.size && !deletedIds.size)) return;
    const updates = new Map<string, ExcalidrawRectangleElement>();
    for (const [id, model] of changes) {
      const element = this.app.scene.getNonDeletedElementsMap().get(id);
      if (!element || !isCoursewareMindmapElement(element) || element.locked) {
        this.app.setToast({ message: "目标已改变或锁定，操作已取消" });
        return;
      }
      if (model !== getCoursewareMindmap(element))
        updates.set(id, updateCoursewareMindmapElement(element, model));
    }
    for (const id of deletedIds) {
      const element = this.app.scene.getNonDeletedElementsMap().get(id);
      if (!element || element.locked) return;
    }
    if (!updates.size && !deletedIds.size) return;
    const elements = this.app.scene
      .getElementsIncludingDeleted()
      .map((element) => {
        if (
          deletedIds.has(element.id) ||
          (element.type === "arrow" &&
            [element.startBinding, element.endBinding].some(
              (binding) => binding && deletedIds.has(binding.elementId),
            ))
        )
          return newElementWith(element, { isDeleted: true });
        if (updates.has(element.id)) return updates.get(element.id)!;
        if (
          element.type === "arrow" &&
          [element.startBinding, element.endBinding].some(
            (binding) =>
              binding?.mindmapNodeId &&
              removed.get(binding.elementId)?.has(binding.mindmapNodeId),
          )
        )
          return newElementWith(element, { isDeleted: true });
        return element;
      });
    this.app.updateScene({
      elements: finalizeCoursewareMindmapElements(
        elements,
        new Set(updates.keys()),
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    this.app.addFiles([]);
    this.notify({ preview: null, previews: [], dropTargetId: null });
  }
  selectBranch(all = false) {
    const { model, element, node } = this;
    if (!model || !element || !node) return;
    const ids = all ? model.order : mindmapSubtreeNodeIds(model, node.id);
    this.notify({
      selectedNodeIds: ids,
      selections: ids.map((nodeId) => ({ elementId: element.id, nodeId })),
    });
  }
  focusBranch() {
    const { model, element, node } = this;
    if (!model || !element || !node) return;
    const geometry = getCoursewareMindmapGeometry(element)!;
    const points = mindmapSubtreeNodeIds(model, node.id).flatMap((id) => {
      const box = geometry.nodes[id];
      return box
        ? [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x, y: box.y + box.height },
            { x: box.x + box.width, y: box.y + box.height },
          ].map((point) => coursewareMindmapLocalToScene(element, point))
        : [];
    });
    if (!points.length) return;
    const left = Math.min(...points.map((p) => p.x)),
      top = Math.min(...points.map((p) => p.y));
    this.app.scrollToContent(
      {
        ...element,
        customData: undefined,
        x: left,
        y: top,
        width: Math.max(...points.map((p) => p.x)) - left,
        height: Math.max(...points.map((p) => p.y)) - top,
      },
      { fitToViewport: true, animate: true },
    );
  }
  command(command: MindmapCommand, preview = false) {
    const { model, element } = this;
    if (!model || !element || !this.editable) return;
    const result = applyMindmapCommand(model, command);
    if (!result.changed) return;
    if (preview)
      this.notify({
        preview: updateCoursewareMindmapElement(element, result.object),
      });
    else this.commit(result.object, new Set(result.removedNodeIds));
  }
  previewTransfer(
    models: Map<string, WhiteboardMindmapObject>,
    groups: Map<string, string[]>,
    targetId: string,
    target: MindmapNodeMoveTarget,
    expanded?: WhiteboardMindmapObject,
  ) {
    const next = new Map(models);
    if (expanded) next.set(targetId, expanded);
    let changed = false;
    for (const [sourceId, ids] of groups) {
      const source = next.get(sourceId),
        receiver = next.get(targetId);
      if (!source || !receiver) return null;
      if (sourceId === targetId) {
        const result = applyMindmapCommand(source, {
          type: "move",
          nodeIds: ids,
          target,
        });
        if (!result.changed) return null;
        next.set(sourceId, result.object);
        changed = true;
      } else {
        const result = moveMindmapBranchesBetween(
          source,
          receiver,
          ids,
          target,
        );
        if (!result) return null;
        next.set(sourceId, result.source);
        next.set(targetId, result.target);
        changed = true;
      }
    }
    return changed ? next : null;
  }
  commitTranslated(previews: ExcalidrawRectangleElement[], dropPoint?: { x: number; y: number }) {
    if (!this.editable || !previews.length) return;
    const updated = new Map(
      previews.map((element) => [
        element.id,
        newElementWith(
          this.app.scene
            .getNonDeletedElementsMap()
            .get(element.id)! as ExcalidrawRectangleElement,
          {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            customData: element.customData,
          },
        ),
      ]),
    );
    if (
      [...updated].some(
        ([id]) =>
          !this.app.scene.getNonDeletedElementsMap().has(id) ||
          this.app.scene.getNonDeletedElementsMap().get(id)?.locked,
      )
    )
      return;
    const originals = this.app.scene.getElementsIncludingDeleted();
    let prepared = originals.map((item) => updated.get(item.id) ?? item);
    if (dropPoint) {
      const movedIds = new Set([...updated].filter(([id, element]) => {
        const before = this.app.scene.getNonDeletedElementsMap().get(id)!;
        return before.x !== element.x || before.y !== element.y;
      }).map(([id]) => id));
      prepared = updateMindmapFrameMembership(prepared, movedIds, dropPoint, this.app.state, this.app);
    }
    this.app.updateScene({
      elements: finalizeCoursewareMindmapElements(
        prepared,
        new Set(updated.keys()),
        new Map(originals.map((item) => [item.id, item])),
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  }
  commitTransfers(
    transfers: MindmapTransferResult[],
    additions: ExcalidrawRectangleElement[] = [],
  ) {
    if (!this.editable || !transfers.length) return false;
    const required = new Set(
      transfers.flatMap((item) => [item.source.id, item.target.id]),
    );
    const added = new Set(additions.map((item) => item.id));
    for (const id of required) {
      const element = this.app.scene.getNonDeletedElementsMap().get(id);
      if (!added.has(id) && (!element || element.locked)) {
        this.app.setToast({ message: "目标已改变或锁定，操作已取消" });
        return false;
      }
    }
    const elements = createCoursewareMindmapTransferElements(
      this.app.scene.getElementsIncludingDeleted(),
      transfers,
      additions,
    );
    this.app.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    this.app.addFiles([]);
    this.notify({
      preview: null,
      previews: [],
      dropIntent: null,
      dropTargetId: null,
      splitCandidate: false,
      dropWarning: null,
    });
    return true;
  }
  commitTransferGroups(
    models: Map<string, WhiteboardMindmapObject>,
    groups: Map<string, string[]>,
    drop: MindmapDropIntent,
    expanded: { elementId: string; nodeId: string } | null,
  ) {
    const next = new Map(models),
      transfers: MindmapTransferResult[] = [];
    let receiver = next.get(drop.elementId);
    if (!receiver) return;
    if (expanded?.elementId === drop.elementId)
      receiver = applyMindmapCommand(receiver, {
        type: "collapse",
        nodeIds: [expanded.nodeId],
        collapsed: false,
      }).object;
    next.set(drop.elementId, receiver);
    let target: MindmapNodeMoveTarget =
      drop.position === "inside"
        ? { parentId: drop.nodeId }
        : {
            parentId: receiver.nodes[drop.nodeId].parentId!,
            siblingId: drop.nodeId,
            position: drop.position,
          };
    const selected: string[] = [];
    for (const [sourceId, ids] of groups) {
      const result = moveMindmapBranchesBetween(
        next.get(sourceId)!,
        next.get(drop.elementId)!,
        ids,
        target,
      );
      if (!result) return;
      next.set(sourceId, result.source);
      next.set(drop.elementId, result.target);
      transfers.push(result);
      selected.push(...result.movedRootIds);
      if (result.movedRootIds.length)
        target = {
          ...target,
          siblingId: result.movedRootIds[result.movedRootIds.length - 1],
          position: "after",
        };
    }
    if (this.commitTransfers(transfers) && selected.length) {
      this.select(drop.elementId, selected[0]);
      this.notify({
        selectedNodeIds: selected,
        selections: selected.map((nodeId) => ({
          elementId: drop.elementId,
          nodeId,
        })),
      });
    }
  }
  splitBranches(
    groups = this.selectionGroups(),
    point?: { x: number; y: number },
  ) {
    const sourceEntries = [...groups].map(([id, ids]) => ({
      element: this.app.scene.getNonDeletedElementsMap().get(id),
      ids,
    }));
    if (
      !this.editable ||
      sourceEntries.some(
        (item) =>
          !item.element ||
          !isCoursewareMindmapElement(item.element) ||
          item.element.locked,
      )
    )
      return;
    const first = sourceEntries[0];
    if (!first || !first.element || !isCoursewareMindmapElement(first.element))
      return;
    const model = getCoursewareMindmap(first.element)!;
    const transfers: MindmapTransferResult[] = [];
    let result = splitMindmapBranches(model, first.ids);
    if (!result) return;
    if (sourceEntries.length > 1 && first.ids.length === 1) {
      const center = createMindmapObject(0, 0, "中心主题");
      const target = {
        ...model,
        id: center.id,
        rootId: center.rootId,
        nodes: center.nodes,
        order: center.order,
        summaries: [],
        boundaries: [],
        relations: [],
      };
      result = moveMindmapBranchesBetween(model, target, first.ids, {
        parentId: target.rootId,
      });
      if (!result) return;
    }
    transfers.push(result);
    let target = result.target;
    for (const item of sourceEntries.slice(1)) {
      const moved = moveMindmapBranchesBetween(
        getCoursewareMindmap(item.element!)!,
        target,
        item.ids,
        { parentId: target.rootId },
      );
      if (!moved) return;
      transfers.push(moved);
      target = moved.target;
    }
    const created = createCoursewareMindmapElement({
      mindmap: target,
      id: target.id,
    });
    const geometry = getCoursewareMindmapGeometry(created)!,
      root = geometry.nodes[geometry.rootId];
    const world = coursewareMindmapLocalToScene(created, {
      x: root.x + root.width / 2,
      y: root.y + root.height / 2,
    });
    const sourceRoot = this.host.getRootWorldCenter(first.element.id);
    const position = point ?? {
      x: sourceRoot.x + first.element.width + 48,
      y: sourceRoot.y,
    };
    const placed = {
      ...created,
      x: created.x + position.x - world.x,
      y: created.y + position.y - world.y,
    };
    if (this.commitTransfers(transfers, [placed]))
      this.select(placed.id, target.rootId);
  }
  mergeMap(sourceId: string) {
    const { model, node } = this;
    const source = this.app.scene.getNonDeletedElementsMap().get(sourceId);
    if (
      !model ||
      !node ||
      !source ||
      !isCoursewareMindmapElement(source) ||
      source.locked ||
      !this.editable
    )
      return;
    const result = mergeMindmapInto(
      getCoursewareMindmap(source)!,
      model,
      node.id,
    );
    if (!result) return;
    const elements = createCoursewareMindmapTransferElements(
      this.app.scene.getElementsIncludingDeleted(),
      [result],
    ).map((element) =>
      element.id === sourceId
        ? newElementWith(element, { isDeleted: true })
        : element,
    );
    this.app.updateScene({
      elements,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    this.select(model.id, result.movedRootIds[0]);
  }
  async importExchange(
    text: string,
    format: "json" | "markdown",
    relation: "child" | "sibling" = "child",
    placement: "auto" | "branches" | "map" = "auto",
  ) {
    const selection = this.snapshot.selection;
    if (!selection || !this.editable) return;
    const payload =
      format === "json"
        ? MindmapExchangeCodec.parse(text)
        : {
            ...MindmapExchangeCodec.parseMarkdown(text),
            resources: {},
            kind: "branches" as const,
          };
    const idMap = await this.host.prepareResources(payload.resources);
    if (!this.host.isPreparedResourcesCurrent(idMap)) throw new Error("编辑器已关闭，导入已取消");
    const originalTarget = this.app.scene
      .getNonDeletedElementsMap()
      .get(selection.elementId);
    if (
      !this.documentEditable ||
      !originalTarget ||
      !isCoursewareMindmapElement(originalTarget) ||
      originalTarget.locked ||
      !getCoursewareMindmap(originalTarget)?.nodes[selection.nodeId]
    ) {
      this.host.takePreparedResources(idMap);
      this.app.setToast({ message: "原粘贴目标已删除或锁定，操作已取消" });
      return;
    }
    const model = getCoursewareMindmap(originalTarget)!,
      node = model.nodes[selection.nodeId];
    const selectionUnchanged = selection === this.snapshot.selection;
    for (const item of Object.values(payload.object.nodes)) {
      if (
        item.imageAssetId &&
        !idMap[item.imageAssetId] &&
        !this.app.files[item.imageAssetId]
      ) {
        this.host.takePreparedResources(idMap);
        throw new Error("脑图缺少图片资源，未导入任何主题");
      }
    }
    const imported = duplicateMindmapObject(payload.object, {
      resourceIdMap: idMap,
    }).object;
    const rootIds = payload.rootNodeIds
      .map((id) => payload.object.nodes[id]?.id)
      .filter(Boolean);
    const files = this.host.takePreparedResources(idMap);
    if (
      placement === "map" ||
      (placement === "auto" && payload.kind === "map")
    ) {
      const anchor = this.host.getRootWorldCenter(selection.elementId);
      const element = createCoursewareMindmapElementFromExchange({
        mindmap: imported,
        id: imported.id,
        x: anchor.x + originalTarget.width + 48,
        y: anchor.y,
      });
      if (files.length) this.app.addFiles(files);
      this.app.updateScene({
        elements: [...this.app.scene.getElementsIncludingDeleted(), element],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      if (selectionUnchanged) this.select(element.id, imported.rootId);
    } else {
      const parentId =
        relation === "sibling" && node.parentId ? node.parentId : node.id;
      const prepared = duplicateMindmapObject(payload.object, {
        resourceIdMap: idMap,
      });
      const mappedRoots = rootIds.length
        ? rootIds.map((id) => prepared.nodeIdMap[id])
        : [prepared.object.rootId];
      const pasted = pasteMindmapExchangeBranches(
        model,
        parentId,
        prepared.object,
        mappedRoots,
        relation === "sibling" && node.parentId
          ? { siblingId: node.id, position: "after" }
          : undefined,
      );
      if (!pasted) return;
      const next = pasted.target;
      if (files.length) this.app.addFiles(files);
      this.commitBatch(new Map([[selection.elementId, next]]));
      if (selectionUnchanged) {
        this.select(selection.elementId, pasted.movedRootIds[0]);
        this.notify({
          selectedNodeIds: pasted.movedRootIds,
          selections: pasted.movedRootIds.map((nodeId) => ({
            elementId: selection.elementId,
            nodeId,
          })),
        });
      }
    }
    if (payload.warnings.length)
      this.app.setToast({ message: payload.warnings.join("；") });
  }
  revealNode(nodeId: string) {
    const { model, element } = this;
    if (!model || !element || !model.nodes[nodeId]) return;
    const expanded = expandMindmapForSearch(model, nodeId);
    this.select(element.id, nodeId);
    const revealed = updateCoursewareMindmapElement(element, expanded);
    this.notify({ preview: revealed });
    const box = getCoursewareMindmapGeometry(revealed)?.nodes[nodeId];
    const point =
      box &&
      coursewareMindmapLocalToScene(revealed, {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      });
    this.app.scrollToContent(
      point
        ? {
            ...revealed,
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
            customData: undefined,
          }
        : revealed,
      { fitToViewport: false, animate: true },
    );
  }
  replaceMatches(query: string, replacement: string, ids: string[]) {
    const model = this.model;
    if (!model || !this.editable || !query) return;
    let next = model;
    ids.forEach((nodeId) => {
      next = replaceMindmapSearchMatches(next, query, replacement, {
        nodeId,
        all: true,
      }).object;
    });
    this.commit(next);
  }
  openNodeLink(event: MouseEvent = new MouseEvent("click")) {
    const { node, element } = this;
    if (!node?.link || !element) return;
    const link = normalizeLink(node.link),
      custom = wrapEvent(EVENT.EXCALIDRAW_LINK, event);
    this.app.props.onLinkOpen?.({ ...element, link }, custom);
    if (!custom.defaultPrevented)
      window.open(
        link,
        isLocalLink(link) ? "_self" : "_blank",
        "noopener,noreferrer",
      );
  }
  completeMarquee(
    rect: { x: number; y: number; width: number; height: number },
    additive = false,
  ) {
    if (
      !this.enabled ||
      this.app.state.viewModeEnabled ||
      this.app.state.presentationMode
    )
      return false;
    const left = Math.min(rect.x, rect.x + rect.width);
    const top = Math.min(rect.y, rect.y + rect.height);
    const right = Math.max(rect.x, rect.x + rect.width);
    const bottom = Math.max(rect.y, rect.y + rect.height);
    const selected: MindmapSelection[] = additive
      ? [...this.snapshot.selections]
      : [];
    const wholeIds: string[] = [];
    for (const element of this.app.scene.getNonDeletedElements()) {
      if (!isCoursewareMindmapElement(element) || element.locked) continue;
      const geometry = getCoursewareMindmapGeometry(element);
      if (!geometry) continue;
      const ids = Object.values(geometry.nodes)
        .filter((box) => {
          const points = [
            { x: box.x, y: box.y },
            { x: box.x + box.width, y: box.y },
            { x: box.x, y: box.y + box.height },
            { x: box.x + box.width, y: box.y + box.height },
          ].map((point) => coursewareMindmapLocalToScene(element, point));
          return points.every(
            (point) =>
              point.x >= left &&
              point.x <= right &&
              point.y >= top &&
              point.y <= bottom,
          );
        })
        .map((box) => box.id);
      if (ids.length === Object.keys(geometry.nodes).length)
        wholeIds.push(element.id);
      ids.forEach((nodeId) => {
        if (
          !selected.some(
            (entry) =>
              entry.elementId === element.id && entry.nodeId === nodeId,
          )
        )
          selected.push({ elementId: element.id, nodeId });
      });
    }
    if (!selected.length) return false;
    const ordinary = this.app.scene
      .getNonDeletedElements()
      .some(
        (item) =>
          this.app.state.selectedElementIds[item.id] &&
          !isCoursewareMindmapElement(item),
      );
    if (ordinary || wholeIds.length) {
      this.clear();
      this.app.setState({
        selectedElementIds: {
          ...(ordinary ? this.app.state.selectedElementIds : {}),
          ...Object.fromEntries(
            (ordinary
              ? [...new Set(selected.map((item) => item.elementId))]
              : wholeIds
            ).map((id) => [id, true]),
          ),
        },
      });
    } else {
      const primary = selected[selected.length - 1];
      this.app.setState({
        selectedElementIds: {},
        selectedGroupIds: {},
        selectedLinearElement: null,
      });
      this.notify({
        selection: primary,
        selections: selected,
        selectedNodeIds: selected
          .filter((item) => item.elementId === primary.elementId)
          .map((item) => item.nodeId),
        editing: null,
        preview: null,
        selectedImage: false,
      });
    }
    return true;
  }
  /** Commit a focused control against the old node without losing the visible click target. */
  rememberPointerNode(event: PointerEvent) {
    this.rememberedPointer = null;
    if (!(event.target instanceof HTMLCanvasElement)) return;
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    const previews = new Map(
      [
        ...this.snapshot.previews,
        ...(this.snapshot.preview ? [this.snapshot.preview] : []),
      ].map((element) => [element.id, element]),
    );
    for (const element of [
      ...this.app.scene.getNonDeletedElements(),
    ].reverse()) {
      if (!isCoursewareMindmapElement(element) || element.locked) continue;
      const nodeId = hitCoursewareMindmapNode(
        previews.get(element.id) ?? element,
        point,
      );
      if (nodeId) {
        this.rememberedPointer = {
          clientX: event.clientX,
          clientY: event.clientY,
          selection: { elementId: element.id, nodeId },
        };
        break;
      }
    }
  }
  pointerMove(event: Pick<Pointer, "clientX" | "clientY">) {
    if (
      this.app.state.activeTool.customType !== COURSEWARE_MINDMAP_TOOL ||
      !this.enabled ||
      this.app.state.viewModeEnabled
    ) {
      if (this.snapshot.preview && !this.snapshot.selection) {
        this.notify({ preview: null });
      }
      return;
    }
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    const pref = this.app.state.coursewareMindmap;
    this.template ??= createCoursewareMindmapElement({
      mindmap: createMindmapTemplateObject(
        0,
        0,
        pref.family,
        pref.direction,
        pref.branchStyle,
      ),
    });
    const geometry = getCoursewareMindmapGeometry(this.template);
    if (!geometry) {
      return;
    }
    this.notify({
      preview: {
        ...this.template,
        x: point.x + geometry.bounds.x - geometry.rootPosition.x,
        y: point.y + geometry.bounds.y - geometry.rootPosition.y,
      },
    });
  }
  pointerDown(event: Pointer): boolean {
    if (
      !this.enabled ||
      this.app.state.viewModeEnabled ||
      this.app.state.presentationMode ||
      event.button !== 0
    ) {
      return false;
    }
    // Commit before canvas selection can cancel the editor and unmount its blur handler.
    if (this.snapshot.editing) {
      if (this.textComposing) return true;
      this.finishEditing(
        true,
        this.textSession?.value ?? this.snapshot.editingValue ?? "",
      );
    }
    // Canvas selection can dismiss the toolbar before the popover closes.
    if (this.previewNodePatch) this.commitPreviewPatch();
    if (this.app.state.activeTool.customType === COURSEWARE_MINDMAP_TOOL) {
      this.pointerMove(event);
      const element = this.snapshot.preview;
      if (!element) {
        return false;
      }
      this.dragCleanup?.();
      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== event.pointerId) return;
        cleanup();
        if (ev.type === "pointercancel") {
          this.notify({ preview: null });
          return;
        }
        this.pointerMove(ev);
        const draft = this.snapshot.preview;
        if (
          !draft ||
          this.app.state.activeTool.customType !== COURSEWARE_MINDMAP_TOOL ||
          this.app.state.viewModeEnabled
        )
          return;
        const created = createCoursewareMindmapElement({
          mindmap: getCoursewareMindmap(draft)!,
          x: draft.x,
          y: draft.y,
        });
        const point = viewportCoordsToSceneCoords(ev, this.app.state);
        const frame = [...this.app.scene.getNonDeletedFramesLikes()]
          .reverse()
          .find(
            (frame) =>
              !frame.locked &&
              isCursorInFrame(
                point,
                frame,
                this.app.scene.getNonDeletedElementsMap(),
              ),
          );
        const next = frame
          ? newElementWith(created, { frameId: frame.id })
          : created;
        this.app.updateScene({
          elements: [...this.app.scene.getElementsIncludingDeleted(), next],
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        this.template = undefined;
        this.notify({ preview: null });
        if (!this.app.state.activeTool.locked) {
          this.app.setActiveTool({ type: "selection" });
          this.select(next.id, getCoursewareMindmap(next)!.rootId);
        }
        this.app.focusContainer();
      };
      const cleanup = () => {
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        this.dragCleanup = undefined;
      };
      this.dragCleanup = cleanup;
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      event.preventDefault();
      return true;
    }
    if (this.app.state.activeTool.type !== "selection") {
      return false;
    }
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    const candidates = [...this.app.scene.getNonDeletedElements()].reverse();
    const remembered =
      this.rememberedPointer &&
      this.rememberedPointer.clientX === event.clientX &&
      this.rememberedPointer.clientY === event.clientY
        ? this.rememberedPointer.selection
        : null;
    this.rememberedPointer = null;
    for (const element of candidates) {
      if (!isCoursewareMindmapElement(element) || element.locked) {
        continue;
      }
      const nodeId =
        remembered?.elementId === element.id &&
        getCoursewareMindmap(element)?.nodes[remembered.nodeId]
          ? remembered.nodeId
          : hitCoursewareMindmapNode(element, point);
      if (!nodeId) {
        if (this.snapshot.selection?.elementId === element.id) {
          const local = coursewareMindmapSceneToLocal(element, point);
          const bounds = getCoursewareMindmapGeometry(element)!.bounds;
          if (
            local.x >= bounds.x &&
            local.x <= bounds.x + bounds.width &&
            local.y >= bounds.y &&
            local.y <= bounds.y + bounds.height
          ) {
            this.startMarquee(event, element);
            event.preventDefault();
            return true;
          }
        }
        continue;
      }
      if (event.altKey && this.app.state.selectedElementIds[element.id])
        return false;
      // A single click returns from whole-object transforms to node editing.
      // Dragging the root moves the whole map without moving its children independently.
      if (event.shiftKey || this.snapshot.multiSelectMode) {
        const previous = this.snapshot.selections.length
          ? this.snapshot.selections
          : this.snapshot.selection
            ? this.snapshot.selectedNodeIds.map((id) => ({
                elementId: this.snapshot.selection!.elementId,
                nodeId: id,
              }))
            : [];
        const selected = previous.some(
          (entry) => entry.elementId === element.id && entry.nodeId === nodeId,
        )
          ? previous.filter(
              (entry) =>
                entry.elementId !== element.id || entry.nodeId !== nodeId,
            )
          : [...previous, { elementId: element.id, nodeId }];
        if (!selected.length) {
          const multiSelectMode = this.snapshot.multiSelectMode;
          this.clear();this.notify({multiSelectMode});event.preventDefault();return true;
        }
        const selections = selected;
        const primary = selections[selections.length - 1];
        const selectedNodeIds = selections
          .filter((entry) => entry.elementId === primary.elementId)
          .map((entry) => entry.nodeId);
        this.notify({
          selectedNodeIds,
          selections,
          selection: primary,
          selectedImage: false,
        });
        event.preventDefault();
        return true;
      }
      if (
        !this.snapshot.selections.some(
          (entry) => entry.elementId === element.id && entry.nodeId === nodeId,
        )
      )
        this.select(element.id, nodeId);
      this.startDrag(event, element, nodeId);
      this.app.focusContainer();
      event.preventDefault();
      return true;
    }
    this.clear();
    return false;
  }
  doubleClick(event: {
    clientX: number;
    clientY: number;
    preventDefault(): void;
  }) {
    const point = viewportCoordsToSceneCoords(event, this.app.state);
    const element = [...this.app.scene.getNonDeletedElements()]
      .reverse()
      .find(
        (item) =>
          isCoursewareMindmapElement(item) &&
          hitCoursewareMindmapNode(item, point),
      );
    if (!element || !isCoursewareMindmapElement(element)) {
      return false;
    }
    this.select(element.id, hitCoursewareMindmapNode(element, point)!);
    if (!element.locked && !this.app.state.viewModeEnabled) {
      this.startEditing();
    }
    event.preventDefault();
    return true;
  }
  private startMarquee(event: Pointer, element: ExcalidrawRectangleElement) {
    this.dragCleanup?.();
    const start = coursewareMindmapSceneToLocal(
      element,
      viewportCoordsToSceneCoords(event, this.app.state),
    );
    const geometry = getCoursewareMindmapGeometry(element)!;
    const original = event.shiftKey ? this.snapshot.selectedNodeIds : [];
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== event.pointerId) return;
      const end = coursewareMindmapSceneToLocal(
        element,
        viewportCoordsToSceneCoords(ev, this.app.state),
      );
      const left = Math.min(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const right = Math.max(start.x, end.x);
      const bottom = Math.max(start.y, end.y);
      const ids = Object.values(geometry.nodes)
        .filter(
          (box) =>
            box.x >= left &&
            box.y >= top &&
            box.x + box.width <= right &&
            box.y + box.height <= bottom,
        )
        .map((box) => box.id);
      const selected = [...new Set([...original, ...ids])];
      if (selected.length)
        this.notify({
          selectedNodeIds: selected,
          selection: { elementId: element.id, nodeId: selected[0] },
        });
      this.notify({
        marquee: {
          left: Math.min(event.clientX, ev.clientX) - this.app.state.offsetLeft,
          top: Math.min(event.clientY, ev.clientY) - this.app.state.offsetTop,
          width: Math.abs(ev.clientX - event.clientX),
          height: Math.abs(ev.clientY - event.clientY),
        },
      });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId === event.pointerId) {
        cleanup();
        this.notify({ marquee: null });
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      this.dragCleanup = undefined;
    };
    this.dragCleanup = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
  private startDrag(
    event: Pointer,
    element: ExcalidrawRectangleElement,
    nodeId: string,
  ) {
    this.dragCleanup?.();
    this.dragCleanup = startMindmapDrag(this, event, element, nodeId);
  }
  toggleAll() {
    if (!this.model) return;
    const ids = this.model.order.filter(
      (id) => id !== this.model!.rootId && childrenOf(this.model!, id).length,
    );
    const collapse = ids.some((id) => !this.model!.nodes[id].collapsed);
    const nodes = { ...this.model.nodes };
    ids.forEach((id) => {
      nodes[id] = { ...nodes[id], collapsed: collapse };
    });
    this.commit(layoutMindmap({ ...this.model, nodes }));
  }
  async wholeAction(
    action: Parameters<typeof this.app.actionManager.executeAction>[0],
  ) {
    const element = this.element;
    if (!element || !this.editable) return;
    const elements = this.app.scene.getElementsIncludingDeleted();
    const appState: AppState = {
      ...this.app.state,
      selectedElementIds: { [element.id]: true },
      selectedGroupIds: {},
      selectedLinearElement: null,
    };
    if (
      action.predicate &&
      !action.predicate(elements, appState, this.app.props, this.app)
    )
      return;
    // Supply the map as the action target without entering whole-map selection.
    // Copying, flipping and layer changes must not dismiss the node toolbar.
    const result = await action.perform(elements, appState, null, this.app);
    if (!result) return;
    if (
      action.name === "duplicateSelection" ||
      action.name === "toggleElementLock"
    ) {
      this.clear();
      this.app.syncActionResult(result);
    } else {
      this.app.syncActionResult({
        ...result,
        appState: {
          ...result.appState,
          selectedElementIds: this.app.state.selectedElementIds,
          selectedGroupIds: this.app.state.selectedGroupIds,
          selectedLinearElement: this.app.state.selectedLinearElement,
        },
      });
      this.notify({});
    }
  }
  keyDown(event: React.KeyboardEvent | KeyboardEvent): boolean {
    if (
      event.defaultPrevented ||
      isMindmapComposing("nativeEvent" in event ? event.nativeEvent : event) ||
      (event.target instanceof HTMLElement &&
        event.target.closest(
          "input:not([data-mindmap-input-capture]),textarea:not([data-mindmap-input-capture]),[contenteditable=true]",
        ))
    )
      return false;
    if (
      event.key === "Escape" &&
      (this.snapshot.selection || this.snapshot.preview)
    ) {
      this.clear();
      this.app.setActiveTool({ type: "selection" });
      event.preventDefault();
      return true;
    }
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "f" && !this.node) {
      const selected = this.app.scene
        .getNonDeletedElements()
        .find(
          (element) =>
            this.app.state.selectedElementIds[element.id] &&
            isCoursewareMindmapElement(element),
        );
      if (selected && isCoursewareMindmapElement(selected))
        this.select(selected.id, getCoursewareMindmap(selected)!.rootId);
    }
    if (!this.node || !this.model) return false;
    const decision = !mod
      ? resolveMindmapKeyboardDecision({
          key: event.key,
          shiftKey: event.shiftKey,
          isRoot: this.node.id === this.model.rootId,
        })
      : "none";
    if (mod && key === "f") {
      this.notify({ searchOpen: true });
    } else if (!this.editable) return false;
    else if (mod && event.altKey && event.shiftKey && key === "c")
      this.toggleAll();
    else if (mod && event.shiftKey && key === "c") {
      if (this.node.id === this.model.rootId)
        void this.wholeAction(actionCopyAsPng);
      else void this.clipboard.copyAsImage();
    } else if (mod && event.altKey && key === "c") this.clipboard.copyStyle();
    else if (mod && event.altKey && key === "v") this.clipboard.pasteStyle();
    else if (mod && event.altKey && key === "l")
      this.wholeAction(actionToggleElementLock);
    else if (mod && key === "d") {
      if (this.node.id === this.model.rootId)
        this.wholeAction(actionDuplicateSelection);
      else this.clipboard.duplicateBranch();
    } else if (
      mod &&
      (event.code === "BracketLeft" || event.code === "BracketRight")
    ) {
      const toEdge = event.altKey || event.shiftKey;
      void this.wholeAction(
        event.code === "BracketLeft"
          ? toEdge
            ? actionSendToBack
            : actionSendBackward
          : toEdge
            ? actionBringToFront
            : actionBringForward,
      );
    } else if (
      decision === "add-child" ||
      decision === "add-parent" ||
      decision === "add-sibling"
    )
      this.add(
        decision === "add-child"
          ? "child"
          : decision === "add-parent"
            ? "parent"
            : "sibling",
      );
    else if (decision === "edit") this.startEditing();
    else if (decision === "edit-description") this.startEditing("summary");
    else if (event.key === "Delete" || event.key === "Backspace") {
      if (this.snapshot.selectedImage) {
        this.patch({
          imageAssetId: undefined,
          imageWidth: undefined,
          imageHeight: undefined,
        });
        this.notify({ selectedImage: false });
      } else this.remove();
    } else if (mod && event.key === ".") this.toggleCollapse();
    else if (event.key.startsWith("Arrow")) {
      const id = resolveMindmapNavigationTarget(
        this.model,
        this.node.id,
        event.key as MindmapNavigationKey,
      );
      if (id) this.select(this.element!.id, id);
    } else return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  dispose() {
    this.host.dispose();
    this.dragCleanup?.();
    this.listeners.clear();
  }
  activate() {
    this.host.activate();
  }
  /** Text input supports keyboard layouts and IME instead of guessing characters. */
  beforeInput(event: InputEvent) {
    if (
      !this.editable ||
      !this.node ||
      this.snapshot.editing ||
      event.defaultPrevented ||
      (event.target instanceof HTMLElement &&
        event.target.closest(
          "input:not([data-mindmap-input-capture]),textarea:not([data-mindmap-input-capture]),[contenteditable=true]",
        ))
    )
      return false;
    if (event.inputType === "insertText" && event.data) {
      this.startEditing("label", event.data);
      event.preventDefault();
      return true;
    }
    return false;
  }
  beginComposition(event?: CompositionEvent) {
    if (
      event?.target instanceof HTMLElement &&
      event.target.closest(
        "input:not([data-mindmap-input-capture]),textarea:not([data-mindmap-input-capture]),[contenteditable=true]",
      )
    )
      return;
    if (this.editable && this.node && !this.snapshot.editing)
      this.startEditing("label", "");
  }
}
