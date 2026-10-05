import { randomId } from "@excalidraw/common";

import { remapMindmapProfessionalObjects } from "@excalidraw/mindmap";

import type { WhiteboardMindmapObject } from "@excalidraw/mindmap";
import type { ExcalidrawElement, ExcalidrawRectangleElement } from "./types";

export type CoursewareMindmapElement = ExcalidrawRectangleElement & {
  customData: {
    coursewareObjectType: "mindmap";
    mindmap: WhiteboardMindmapObject;
    [key: string]: any;
  };
};

const duplicatedNodeIds = new WeakMap<ExcalidrawElement, Map<string, string>>();

export const getDuplicatedMindmapNodeId = (
  element: ExcalidrawElement,
  originalId: string,
) => duplicatedNodeIds.get(element)?.get(originalId);

export const isCoursewareMindmapElement = (
  element: Pick<ExcalidrawElement, "type" | "customData"> | null | undefined,
): element is CoursewareMindmapElement =>
  element?.type === "rectangle" &&
  element.customData?.coursewareObjectType === "mindmap";

export const getCoursewareMindmap = (
  element: Pick<ExcalidrawElement, "type" | "customData"> | null | undefined,
): WhiteboardMindmapObject | null => {
  if (!isCoursewareMindmapElement(element)) {
    return null;
  }
  const model = element.customData.mindmap;
  return model &&
    typeof model === "object" &&
    model.nodes &&
    typeof model.nodes === "object" &&
    typeof model.rootId === "string" &&
    model.nodes[model.rootId] &&
    Array.isArray(model.order)
    ? model
    : null;
};

/** Native duplicate operations must also allocate independent semantic IDs. */
export const cloneCoursewareMindmapForDuplication = (
  element: ExcalidrawElement,
  nextElementId: string,
  duplicate?: ExcalidrawElement,
): ExcalidrawElement["customData"] => {
  const model = getCoursewareMindmap(element);
  if (!model) {
    return element.customData;
  }
  const ids = new Map(Object.keys(model.nodes).map((id) => [id, randomId()]));
  if (duplicate) {
    duplicatedNodeIds.set(duplicate, ids);
  }
  const nodes: WhiteboardMindmapObject["nodes"] = {};
  for (const node of Object.values(model.nodes)) {
    const id = ids.get(node.id);
    if (id) {
      nodes[id] = {
        ...structuredClone(node),
        id,
        parentId: node.parentId ? ids.get(node.parentId) ?? null : null,
      };
    }
  }
  return {
    ...element.customData,
    mindmap: {
      ...model,
      ...remapMindmapProfessionalObjects(model, Object.fromEntries(ids), () => randomId()),
      id: nextElementId,
      nodes,
      rootId: ids.get(model.rootId)!,
      order: model.order
        .map((id) => ids.get(id))
        .filter((id): id is string => !!id),
    },
  };
};
