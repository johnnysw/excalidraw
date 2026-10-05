import { exportCanvas } from "../data";
import type { ExportedElements } from "../data";
import { createCoursewareMindmapElement } from "@excalidraw/element/coursewareMindmap";
import {
  layoutMindmap,
  MindmapExchangeCodec,
  MINDMAP_EXCHANGE_MIME,
  pasteMindmapExchangeBranches,
  applyMindmapCommand,
  collectMindmapResourceIds,
} from "@excalidraw/mindmap";
import type {
  MindmapExchangePayload,
  MindmapResource,
} from "@excalidraw/mindmap";
import {
  copyTextToSystemClipboard,
  createPasteEvent,
  readSystemClipboard,
} from "../clipboard";
import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";
import { resolveMindmapNodeInitialImageSize } from "@excalidraw/mindmap";
import type { WhiteboardMindmapNode } from "@excalidraw/mindmap";
import type { FileId } from "@excalidraw/element/types";
import type { BinaryFiles, BinaryFileData } from "../types";
import type { CoursewareMindmapController } from "./controller";
import { copyMindmapNodeStyle } from "./operations";
import { prepareMindmapExchangeResources } from "./exchangeResources";

const CLIPBOARD_TYPE = MINDMAP_EXCHANGE_MIME;
export class MindmapClipboard {
  private style?: Partial<WhiteboardMindmapNode>;
  constructor(private controller: CoursewareMindmapController) {}
  get canPasteStyle() {
    return !!this.style;
  }
  private reportError(error: unknown, fallback: string) {
    this.controller.app.setState({
      errorMessage:
        error instanceof Error ? `${fallback}：${error.message}` : fallback,
    });
  }
  copy(event?: ClipboardEvent, cut = false) {
    const { model, node, app, element } = this.controller;
    if (
      !model ||
      !node ||
      !element ||
      this.controller.getSnapshot().editing ||
      (cut && !this.controller.editable)
    )
      return false;
    const groups = this.controller.selectionGroups();
    const exchangeObjects = this.controller.host.readExchangeLatest();
    const objects = [...groups.keys()]
      .map((id) => exchangeObjects[id])
      .filter(Boolean);
    const selection = this.controller.getSnapshot().selection;
    const sameSession = this.controller.host.captureSessionGuard();
    const selectedGroups = JSON.stringify([...groups]);
    const versions = [...groups.keys()].map(
      (id) =>
        [id, app.scene.getNonDeletedElementsMap().get(id)?.version] as const,
    );
    const finishCut = () => {
      if (!cut || !sameSession()) return;
      const changed =
        !this.controller.editable ||
        selection !== this.controller.getSnapshot().selection ||
        selectedGroups !==
          JSON.stringify([...this.controller.selectionGroups()]) ||
        versions.some(([id, version]) => {
          const latest = app.scene.getNonDeletedElementsMap().get(id);
          return !latest || latest.locked || latest.version !== version;
        });
      if (changed) {
        app.setToast({ message: "已复制；主题或选择已变化，未执行剪切" });
        return;
      }
      this.controller.remove();
    };
    const skeleton =
      objects.length === 1 && groups.get(element.id)?.includes(model.rootId)
        ? MindmapExchangeCodec.serialize(exchangeObjects[element.id])
        : MindmapExchangeCodec.serializeSelection(
            objects,
            Object.fromEntries(groups),
          );
    const payload = JSON.parse(skeleton) as MindmapExchangePayload;
    const ids = collectMindmapResourceIds(payload.object);
    const ready = ids.every(
      (id) =>
        app.files[id]?.dataURL.startsWith("data:image/") &&
        app.files[id]?.mimeType.startsWith("image/"),
    );
    const serialize = (resources: Record<string, MindmapResource>) =>
      JSON.stringify({ ...payload, resources });
    event?.preventDefault();
    if (event?.clipboardData && ready) {
      try {
        const serialized = serialize(
          Object.fromEntries(
            ids.map((id) => [
              id,
              {
                id,
                dataURL: app.files[id].dataURL,
                mimeType: app.files[id].mimeType,
              },
            ]),
          ),
        );
        event.clipboardData.setData("text/plain", serialized);
        event.clipboardData.setData(CLIPBOARD_TYPE, serialized);
        finishCut();
      } catch (error) {
        this.reportError(error, "无法写入剪贴板");
      }
    } else {
      void prepareMindmapExchangeResources([payload.object], app.files)
        .then((resources) => copyTextToSystemClipboard(serialize(resources)))
        .then(finishCut)
        .catch((error: unknown) => this.reportError(error, "无法写入剪贴板"));
    }
    return true;
  }
  async pasteFromMenu(relation: "child" | "sibling" = "child") {
    const selection = this.controller.getSnapshot().selection;
    try {
      const types = await readSystemClipboard();
      if (
        selection !== this.controller.getSnapshot().selection ||
        !this.controller.editable
      )
        return;
      this.controller.app.focusContainer();
      const event = Object.assign(createPasteEvent({ types }), {
        fromMindmapMenu: true,
      });
      if (!(await this.paste(event, relation)))
        await this.controller.app.pasteFromClipboard(event);
    } catch (error) {
      this.reportError(error, "无法读取剪贴板，请允许剪贴板访问后重试");
    }
  }
  async paste(event?: ClipboardEvent, relation: "child" | "sibling" = "child") {
    const { model, node } = this.controller;
    if (
      !model ||
      !node ||
      !this.controller.editable ||
      this.controller.getSnapshot().editing
    )
      return false;
    const image =
      event &&
      [...(event.clipboardData?.files ?? [])].find((file) =>
        file.type.startsWith("image/"),
      );
    if (image) {
      event.preventDefault();
      try {
        await this.addImage(image);
      } catch (error) {
        this.reportError(error, "图片无法读取，请重试");
      }
      return true;
    }
    const typedPayload = event?.clipboardData?.getData(CLIPBOARD_TYPE);
    const serialized =
      typedPayload ||
      event?.clipboardData?.getData("text/plain") ||
      (!event ? await navigator.clipboard?.readText().catch(() => "") : "");
    if (!serialized) return false;
    try {
      const candidate: unknown = JSON.parse(serialized);
      if (
        !candidate ||
        typeof candidate !== "object" ||
        !("format" in candidate) ||
        candidate.format !== "mindmap"
      )
        return false;
    } catch (error) {
      if (!typedPayload && !/"format"\s*:\s*"mindmap"/.test(serialized))
        return false;
      event?.preventDefault();
      this.reportError(error, "脑图剪贴板内容无效，未粘贴任何主题");
      return true;
    }
    event?.preventDefault();
    try {
      await this.controller.importExchange(serialized, "json", relation);
    } catch (error) {
      this.reportError(error, "无法粘贴脑图");
    }
    return true;
  }
  duplicateBranch() {
    const { model, node } = this.controller;
    if (!model || !node || !this.controller.editable) return;
    const ids = this.controller.getSnapshot().selectedNodeIds;
    const payload = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(model, {}, ids),
    );
    const result = pasteMindmapExchangeBranches(
      model,
      node.parentId ?? model.rootId,
      payload.object,
      payload.rootNodeIds,
      node.parentId ? { siblingId: node.id, position: "after" } : undefined,
    );
    if (!result) return;
    this.controller.commit(result.target);
    this.controller.select(this.controller.element!.id, result.movedRootIds[0]);
    this.controller.notify({ selectedNodeIds: result.movedRootIds });
  }
  async copyAsImage() {
    const { model, node, app, element } = this.controller;
    if (!model || !node || !element) return;
    const branch = MindmapExchangeCodec.parse(
      MindmapExchangeCodec.serialize(
        model,
        {},
        this.controller.getSnapshot().selectedNodeIds,
      ),
    ).object;
    const isolated = createCoursewareMindmapElement({
      mindmap: layoutMindmap({ ...branch, rotation: 0 }),
    });
    try {
      await exportCanvas(
        "clipboard",
        [isolated] as unknown as ExportedElements,
        app.state,
        app.files,
        {
          exportBackground: false,
          viewBackgroundColor: app.state.viewBackgroundColor,
          exportingFrame: null,
        },
      );
      app.setToast({ message: "已复制为图片" });
    } catch (error) {
      app.setState({
        errorMessage: error instanceof Error ? error.message : "无法复制图片",
      });
    }
  }
  copyStyle() {
    if (this.controller.node) {
      this.style = copyMindmapNodeStyle(this.controller.node);
      this.controller.notify({});
    }
  }
  currentStyle() {
    return this.controller.node
      ? copyMindmapNodeStyle(this.controller.node)
      : {};
  }
  pasteStyle() {
    if (this.style) {
      this.controller.patch(this.style);
    }
  }
  async addImage(file: File) {
    if (!this.controller.editable || !file.type.startsWith("image/")) {
      return;
    }
    const selection = this.controller.getSnapshot().selection;
    if (!selection) return;
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const image = new Image();
    image.src = dataURL;
    await image.decode();
    const model = this.controller.host.readLatest()[selection.elementId];
    const target = this.controller.app.scene
      .getNonDeletedElementsMap()
      .get(selection.elementId);
    if (
      !this.controller.documentEditable ||
      !target ||
      target.locked ||
      !model?.nodes[selection.nodeId]
    ) {
      this.controller.app.setToast({
        message: "原图片目标已删除或锁定，操作已取消",
      });
      return;
    }
    const id = crypto.randomUUID() as FileId;
    this.controller.app.addFiles([
      {
        id,
        dataURL,
        mimeType: file.type,
        created: Date.now(),
      } as BinaryFileData,
    ]);
    const size = resolveMindmapNodeInitialImageSize(
      image.naturalWidth,
      image.naturalHeight,
      model.layoutScale,
    );
    const next = applyMindmapCommand(model, {
      type: "patch",
      nodeIds: [selection.nodeId],
      patch: {
        imageAssetId: id,
        imageWidth: size.width,
        imageHeight: size.height,
        imagePlacement: "right",
      },
    }).object;
    this.controller.commitBatch(new Map([[selection.elementId, next]]));
  }
}
