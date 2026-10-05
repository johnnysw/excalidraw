/** File references are shared by scene, clipboard, persistence and workers. */
export const getReferencedFileIds = (element: unknown): string[] => {
  if (!element || typeof element !== "object") {
    return [];
  }
  const value = element as {
    fileId?: unknown;
    customData?: {
      coursewareObjectType?: unknown;
      mindmap?: { nodes?: unknown };
    };
  };
  const ids = new Set<string>();
  const add = (id: unknown) => {
    if (typeof id === "string" && id.length) {
      ids.add(id);
    }
  };
  add(value.fileId);
  if (value.customData?.coursewareObjectType === "mindmap") {
    const nodes = value.customData.mindmap?.nodes;
    if (nodes && typeof nodes === "object" && !Array.isArray(nodes)) {
      for (const node of Object.values(nodes)) {
        if (node && typeof node === "object") {
          add((node as { imageAssetId?: unknown }).imageAssetId);
        }
      }
    }
  }
  return [...ids];
};
