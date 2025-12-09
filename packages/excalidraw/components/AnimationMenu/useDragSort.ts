/**
 * 通用拖拽排序 Hook
 *
 * 用于列表项的拖拽重排序，基于 HTML5 原生拖拽 API
 */

import { useState, useCallback } from "react";

interface UseDragSortOptions<T> {
  /** 列表项数组 */
  items: T[];
  /** 获取项的唯一标识 */
  getItemId: (item: T) => string;
  /** 重排序回调，参数为新的 ID 顺序数组 */
  onReorder: (newOrder: string[]) => void;
}

interface UseDragSortReturn {
  /** 当前正在拖拽的项 ID */
  draggedId: string | null;
  /** 当前悬停目标的项 ID */
  dragOverId: string | null;
  /** 判断指定项是否正在被拖拽 */
  isDragging: (id: string) => boolean;
  /** 判断指定项是否是拖拽目标 */
  isDragOver: (id: string) => boolean;
  /** 获取拖拽相关的 props */
  getDragProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: () => void;
    onDragEnd: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

export function useDragSort<T>({
  items,
  getItemId,
  onReorder,
}: UseDragSortOptions<T>): UseDragSortReturn {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, itemId: string) => {
      setDraggedId(itemId);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", itemId);
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, itemId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedId && draggedId !== itemId) {
        setDragOverId(itemId);
      }
    },
    [draggedId],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      if (!draggedId || draggedId === targetId) return;

      const oldIndex = items.findIndex((item) => getItemId(item) === draggedId);
      const newIndex = items.findIndex((item) => getItemId(item) === targetId);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = [...items];
      const [removed] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, removed);

      onReorder(newOrder.map((item) => getItemId(item)));

      setDraggedId(null);
      setDragOverId(null);
    },
    [draggedId, items, getItemId, onReorder],
  );

  const isDragging = useCallback(
    (id: string) => draggedId === id,
    [draggedId],
  );

  const isDragOver = useCallback((id: string) => dragOverId === id, [dragOverId]);

  const getDragProps = useCallback(
    (id: string) => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => handleDragStart(e, id),
      onDragOver: (e: React.DragEvent) => handleDragOver(e, id),
      onDragLeave: handleDragLeave,
      onDragEnd: handleDragEnd,
      onDrop: (e: React.DragEvent) => handleDrop(e, id),
    }),
    [handleDragStart, handleDragOver, handleDragLeave, handleDragEnd, handleDrop],
  );

  return {
    draggedId,
    dragOverId,
    isDragging,
    isDragOver,
    getDragProps,
  };
}
