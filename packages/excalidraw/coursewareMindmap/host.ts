import {
  coursewareMindmapLocalToScene,
  coursewareMindmapSceneToLocal,
  getCoursewareMindmap,
  getCoursewareMindmapGeometry,
  getCoursewareMindmapForExchange,
  isCoursewareMindmapElement,
  updateCoursewareMindmapElement,
} from "@excalidraw/element/coursewareMindmap";
import type {
  MindmapHostAdapter,
  MindmapResource,
  WhiteboardMindmapObject,
} from "@excalidraw/mindmap";
import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData } from "../types";
import type { CoursewareMindmapController } from "./controller";

/** Scene/history/assets remain owned by Excalidraw, never by the shared core. */
export class CoursewareMindmapHostAdapter implements MindmapHostAdapter {
  private prepared = new Map<Record<string, string>, BinaryFileData[]>();
  private reservedFileIds = new Set<string>();
  private disposed = false;
  private generation = 0;
  constructor(private controller: CoursewareMindmapController) {}
  captureSessionGuard = () => {
    const generation = this.generation;
    return () => !this.disposed && generation === this.generation;
  };
  readLatest = () =>
    Object.fromEntries(
      this.controller.app.scene
        .getNonDeletedElements()
        .filter(isCoursewareMindmapElement)
        .map((element) => [element.id, getCoursewareMindmap(element)!]),
    );
  readExchangeLatest = (): Record<string, WhiteboardMindmapObject> => Object.fromEntries(
    this.controller.app.scene.getNonDeletedElements()
      .flatMap((element) => isCoursewareMindmapElement(element)
        ? [[element.id, getCoursewareMindmapForExchange(element)!]]
        : []),
  );
  private element(id: string) {
    const element = this.controller.app.scene
      .getNonDeletedElementsMap()
      .get(id);
    if (!element || !isCoursewareMindmapElement(element))
      throw new Error("目标导图不存在");
    return element;
  }
  localToWorld = (id: string, point: { x: number; y: number }) =>
    coursewareMindmapLocalToScene(this.element(id), point);
  worldToLocal = (id: string, point: { x: number; y: number }) =>
    coursewareMindmapSceneToLocal(this.element(id), point);
  getRootWorldCenter = (id: string) => {
    const element = this.element(id),
      geometry = getCoursewareMindmapGeometry(element)!;
    const root = geometry.nodes[geometry.rootId];
    return this.localToWorld(id, {
      x: root.x + root.width / 2,
      y: root.y + root.height / 2,
    });
  };
  showPreview = (
    objects: Readonly<Record<string, WhiteboardMindmapObject>> | null,
  ) => {
    const previews = objects
      ? Object.entries(objects).map(([id, model]) =>
          updateCoursewareMindmapElement(this.element(id), model),
        )
      : [];
    this.controller.notify({
      previews,
      preview:
        previews.find((item) => item.id === this.controller.element?.id) ??
        previews[0] ??
        null,
    });
  };
  prepareResources = async (resources: Record<string, MindmapResource>) => {
    if (this.disposed) throw new Error("编辑器已关闭，导入已取消");
    const generation = this.generation;
    const files = this.controller.app.files,
      mapping: Record<string, string> = {},
      prepared: BinaryFileData[] = [];
    try {
      for (const [id, resource] of Object.entries(resources)) {
        if (
          !resource.mimeType.startsWith("image/") ||
          !resource.dataURL.startsWith("data:image/")
        )
          throw new Error("脑图图片资源无效");
        const existing = Object.values(files).find(
          (file) => file.dataURL === resource.dataURL,
        );
        if (existing) {
          mapping[id] = existing.id;
          continue;
        }
        const image = new Image();
        image.src = resource.dataURL;
        if (typeof image.decode === "function") await image.decode();
        if (this.disposed || this.generation !== generation)
          throw new Error("编辑器已关闭，导入已取消");
        const targetId =
          this.controller.app.files[id] || this.reservedFileIds.has(id)
            ? crypto.randomUUID()
            : id;
        this.reservedFileIds.add(targetId);
        mapping[id] = targetId;
        prepared.push({
          ...resource,
          id: targetId as FileId,
          created: Date.now(),
          lastRetrieved: Date.now(),
        } as BinaryFileData);
      }
    } catch (error) {
      prepared.forEach((file) => this.reservedFileIds.delete(file.id));
      throw error;
    }
    this.prepared.set(mapping, prepared);
    return mapping;
  };
  takePreparedResources(mapping: Record<string, string>) {
    const files = this.prepared.get(mapping) ?? [];
    this.prepared.delete(mapping);
    files.forEach((file) => this.reservedFileIds.delete(file.id));
    return files;
  }
  isPreparedResourcesCurrent(mapping: Record<string, string>) {
    return !this.disposed && this.prepared.has(mapping);
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.prepared.clear();
    this.reservedFileIds.clear();
  }
  activate() {
    this.disposed = false;
  }
  commit: MindmapHostAdapter["commit"] = async (operation) => {
    if (!this.controller.editable) {
      this.prepared.clear();
      this.reservedFileIds.clear();
      return false;
    }
    const references = new Set(
      Object.values(operation.objects).flatMap((object) =>
        Object.values(object.nodes)
          .map((node) => node.imageAssetId)
          .filter(Boolean),
      ),
    );
    for (const [mapping, files] of this.prepared) {
      if (files.length && files.every((file) => references.has(file.id)))
        this.controller.app.addFiles(this.takePreparedResources(mapping));
    }
    this.controller.commitBatch(
      new Map(Object.entries(operation.objects)),
      new Map(),
      new Set(operation.removedMapIds ?? []),
    );
    if (operation.selection?.nodeIds.length) {
      const { mapId, nodeIds } = operation.selection;
      this.controller.select(mapId, nodeIds[0]);
      this.controller.notify({
        selectedNodeIds: nodeIds,
        selections: nodeIds.map((nodeId) => ({ elementId: mapId, nodeId })),
      });
    }
    return true;
  };
}
