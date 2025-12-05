/**
 * RichText 工具交互 Hook
 * 处理 RichText 工具的创建、编辑逻辑
 */

import { useState, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AppState } from "@excalidraw/excalidraw/types";

import {
  createRichTextNodeElementsAsync,
  isRichTextNodeBackground,
  getRichTextNodeConfig,
  deleteRichTextNode,
} from "./createElement";

export interface RichTextEditorState {
  isOpen: boolean;
  initialHtml: string;
  nodeId?: string;
  /** 创建新节点时的位置 */
  createPosition?: { x: number; y: number };
}

export interface UseRichTextToolOptions {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export function useRichTextTool({ excalidrawAPI }: UseRichTextToolOptions) {
  const [editorState, setEditorState] = useState<RichTextEditorState>({
    isOpen: false,
    initialHtml: "",
  });

  /**
   * 打开编辑器创建新节点
   */
  const openEditorForCreate = useCallback((x: number, y: number) => {
    setEditorState({
      isOpen: true,
      initialHtml: "",
      nodeId: undefined,
      createPosition: { x, y },
    });
  }, []);

  /**
   * 打开编辑器编辑已有节点
   */
  const openEditorForEdit = useCallback(
    (nodeId: string, html: string) => {
      setEditorState({
        isOpen: true,
        initialHtml: html,
        nodeId,
        createPosition: undefined,
      });
    },
    []
  );

  /**
   * 关闭编辑器
   */
  const closeEditor = useCallback(() => {
    setEditorState({
      isOpen: false,
      initialHtml: "",
      nodeId: undefined,
      createPosition: undefined,
    });

    // 切换回选择工具
    excalidrawAPI?.setActiveTool({ type: "selection" });
  }, [excalidrawAPI]);

  /**
   * 提交编辑器内容
   */
  const handleSubmit = useCallback(
    async (html: string, nodeId?: string) => {
      if (!excalidrawAPI) {
        closeEditor();
        return;
      }

      // 如果内容为空，直接关闭
      if (!html.trim()) {
        closeEditor();
        return;
      }

      const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const currentFiles = excalidrawAPI.getFiles();

      let position = editorState.createPosition;

      // 如果是编辑模式，获取原节点位置并删除旧元素
      if (nodeId) {
        // 找到背景元素获取位置
        const bgElement = currentElements.find(
          (el) =>
            isRichTextNodeBackground(el) && el.customData?.nodeId === nodeId
        );

        if (bgElement) {
          position = {
            x: bgElement.x + bgElement.width / 2,
            y: bgElement.y + bgElement.height / 2,
          };
        }

        // 删除旧元素
        const updatedElements = deleteRichTextNode(currentElements, nodeId);
        excalidrawAPI.updateScene({ elements: updatedElements });
      }

      if (!position) {
        // 默认位置：视口中心
        const appState = excalidrawAPI.getAppState();
        position = {
          x: -appState.scrollX + appState.width / 2,
          y: -appState.scrollY + appState.height / 2,
        };
      }

      try {
        // 创建新元素
        const { elements: newElements, files: newFiles } =
          await createRichTextNodeElementsAsync({
            x: position.x,
            y: position.y,
            html,
            nodeId, // 编辑模式保留原 nodeId
          });

        // 更新场景
        const allElements = [
          ...excalidrawAPI.getSceneElementsIncludingDeleted(),
          ...newElements,
        ];

        excalidrawAPI.updateScene({ elements: allElements });

        // 添加文件
        if (Object.keys(newFiles).length > 0) {
          excalidrawAPI.addFiles(
            Object.values(newFiles).map((f) => ({
              id: f.id,
              dataURL: f.dataURL,
              mimeType: f.mimeType,
              created: f.created,
            }))
          );
        }

        // 选中新创建的元素
        const newElementIds = newElements.map((el) => el.id);
        excalidrawAPI.updateScene({
          appState: {
            selectedElementIds: Object.fromEntries(
              newElementIds.map((id) => [id, true])
            ),
          },
        });
      } catch (error) {
        console.error("[useRichTextTool] Failed to create elements:", error);
      }

      closeEditor();
    },
    [excalidrawAPI, editorState.createPosition, closeEditor]
  );

  /**
   * 处理 pointerDown 事件
   * 当 richText 工具激活时，点击画布创建新节点
   */
  const handlePointerDown = useCallback(
    (
      activeTool: AppState["activeTool"],
      pointerDownState: { origin: { x: number; y: number } }
    ) => {
      console.log(
        "[hook] handlePointerDown",
        activeTool.type,
        pointerDownState.origin,
      );
      if (activeTool.type === "richText") {
        openEditorForCreate(pointerDownState.origin.x, pointerDownState.origin.y);
      }
    },
    [openEditorForCreate]
  );

  /**
   * 处理双击事件
   * 双击 RichTextNode 进入编辑模式
   */
  const handleDoubleClick = useCallback(
    (element: any) => {
      if (isRichTextNodeBackground(element)) {
        const config = getRichTextNodeConfig(element);
        if (config) {
          openEditorForEdit(config.nodeId, config.html);
        }
      }
    },
    [openEditorForEdit]
  );

  return {
    editorState,
    openEditorForCreate,
    openEditorForEdit,
    closeEditor,
    handleSubmit,
    handlePointerDown,
    handleDoubleClick,
  };
}

export default useRichTextTool;
