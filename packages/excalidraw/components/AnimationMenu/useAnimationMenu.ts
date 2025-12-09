/**
 * 动画配置面板逻辑 Hook
 */

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import {
  useApp,
  useExcalidrawElements,
  useExcalidrawSetAppState,
} from "../App";
import { getSelectedElements } from "../../scene";
import { isFrameLikeElement, syncInvalidIndices } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/element/types";
import type {
  AnimationEvent,
  AnimationType,
  ElementAnimation,
  AnimationTarget,
} from "./types";
import { DEFAULT_EVENT } from "./types";
import { elementsToEvents, eventsToElements, createEvent } from "./animationEventUtils";

interface UseAnimationMenuReturn {
  /** 当前选中的 Frame */
  currentFrame: ExcalidrawFrameLikeElement | null;
  /** 当前 Frame 内的元素 */
  frameElements: ExcalidrawElement[];
  /** 当前选中的元素 */
  selectedElements: ExcalidrawElement[];
  /** 动画事件列表 */
  events: AnimationEvent[];
  /** 当前选中的事件 */
  selectedEvent: AnimationEvent | null;
  /** 选中一个事件 */
  selectEvent: (eventId: string | null) => void;
  /** 为选中元素创建新事件 */
  createEventFromSelection: () => void;
  /** 删除事件 */
  deleteEvent: (eventId: string) => void;
  /** 更新事件属性 */
  updateEvent: (eventId: string, updates: Partial<AnimationEvent>) => void;
  /** 重排事件顺序 */
  reorderEventList: (newOrder: string[]) => void;
  /** 根据 elementId 获取元素对象 */
  getElementById: (elementId: string) => ExcalidrawElement | undefined;
  /** 获取事件对应的 stepGroup */
  getEventStepGroup: (eventId: string) => number | null;
  /** 获取可用的动画目标选项 */
  getAvailableAnimationTargets: (eventId: string) => AnimationTarget[] | null;
}

export function useAnimationMenu(): UseAnimationMenuReturn {
  const app = useApp();
  const elements = useExcalidrawElements();
  const setAppState = useExcalidrawSetAppState();
  const appState = app.state;

  // 当前选中的事件 ID
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // 防止循环触发
  const isSelectingFromCanvas = useRef(false);
  const isSelectingFromPanel = useRef(false);

  // 获取当前选中的 Frame
  const currentFrame = useMemo(() => {
    const selectedIds = Object.keys(appState.selectedElementIds || {});

    // 查找第一个选中的 Frame
    for (const id of selectedIds) {
      const el = elements.find((e) => e.id === id);
      if (el && isFrameLikeElement(el)) {
        return el as ExcalidrawFrameLikeElement;
      }
    }

    // 如果没有选中 Frame，查找选中元素所在的 Frame
    for (const id of selectedIds) {
      const el = elements.find((e) => e.id === id);
      if (el?.frameId) {
        const frame = elements.find((e) => e.id === el.frameId);
        if (frame && isFrameLikeElement(frame)) {
          return frame as ExcalidrawFrameLikeElement;
        }
      }
    }

    return null;
  }, [appState.selectedElementIds, elements]);

  // 获取当前 Frame 内的所有元素
  const frameElements = useMemo(() => {
    if (!currentFrame) return [];

    return elements.filter((el) => {
      if (el.isDeleted) return false;
      if (el.frameId === currentFrame.id) return true;

      // 几何检查：元素中心点是否在 Frame 内
      const elCenterX = el.x + (el.width || 0) / 2;
      const elCenterY = el.y + (el.height || 0) / 2;
      return (
        elCenterX >= currentFrame.x &&
        elCenterX <= currentFrame.x + currentFrame.width &&
        elCenterY >= currentFrame.y &&
        elCenterY <= currentFrame.y + currentFrame.height
      );
    });
  }, [currentFrame, elements]);

  // 当前选中的元素
  const selectedElements = useMemo(() => {
    return getSelectedElements(elements, appState).filter(
      (el) => !isFrameLikeElement(el),
    );
  }, [elements, appState]);

  // 从元素组装动画事件列表
  const events = useMemo(() => {
    return elementsToEvents(frameElements as any, currentFrame?.id);
  }, [frameElements, currentFrame?.id]);

  // 当前选中的事件
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // 选中一个事件
  const selectEvent = useCallback(
    (eventId: string | null) => {
      if (isSelectingFromCanvas.current) return;

      setSelectedEventId(eventId);

      if (!eventId) return;

      const event = events.find((e) => e.id === eventId);
      if (!event || event.elements.length === 0) return;

      // 选中画布中对应的元素
      isSelectingFromPanel.current = true;
      const newSelectedIds: Record<string, true> = {};
      event.elements.forEach((id) => {
        newSelectedIds[id] = true;
      });

      setAppState({
        selectedElementIds: newSelectedIds,
      } as any);

      setTimeout(() => {
        isSelectingFromPanel.current = false;
      }, 50);
    },
    [events, setAppState],
  );

  // 监听画布选中元素变化
  useEffect(() => {
    if (isSelectingFromPanel.current) return;
    if (selectedElements.length === 0) return;

    const selectedElementIds = selectedElements.map((el) => el.id);
    const matchedEvent = events.find((event) =>
      event.elements.some((id) => selectedElementIds.includes(id)),
    );

    if (matchedEvent && matchedEvent.id !== selectedEventId) {
      isSelectingFromCanvas.current = true;
      setSelectedEventId(matchedEvent.id);
      setTimeout(() => {
        isSelectingFromCanvas.current = false;
      }, 50);
    }
  }, [selectedElements, events, selectedEventId]);

  // 为选中元素创建新事件
  const createEventFromSelection = useCallback(() => {
    if (selectedElements.length === 0) return;

    const maxOrder =
      events.length > 0 ? Math.max(...events.map((e) => e.order)) : 0;

    const selectedIds = selectedElements.map((el) => el.id);
    const newEvent = createEvent(selectedIds, maxOrder);

    // 更新元素
    const updatedEvents = [...events, newEvent];
    const updatedElements = eventsToElements(
      updatedEvents,
      elements as any,
      currentFrame?.id,
    );

    app.scene.replaceAllElements(syncInvalidIndices(updatedElements as any));
    setSelectedEventId(newEvent.id);
  }, [selectedElements, events, elements, currentFrame?.id, app]);

  // 删除事件
  const deleteEvent = useCallback(
    (eventId: string) => {
      const updatedEvents = events.filter((e) => e.id !== eventId);
      const updatedElements = eventsToElements(
        updatedEvents,
        elements as any,
        currentFrame?.id,
      );

      app.scene.replaceAllElements(syncInvalidIndices(updatedElements as any));

      if (selectedEventId === eventId) {
        setSelectedEventId(null);
      }
    },
    [events, elements, currentFrame?.id, selectedEventId, app],
  );

  // 更新事件属性
  const updateEvent = useCallback(
    (eventId: string, updates: Partial<AnimationEvent>) => {
      const updatedEvents = events.map((e) =>
        e.id === eventId ? { ...e, ...updates } : e,
      );
      const updatedElements = eventsToElements(
        updatedEvents,
        elements as any,
        currentFrame?.id,
      );

      app.scene.replaceAllElements(syncInvalidIndices(updatedElements as any));
    },
    [events, elements, currentFrame?.id, app],
  );

  // 重排事件顺序
  const reorderEventList = useCallback(
    (newOrder: string[]) => {
      const reorderedEvents = newOrder
        .map((id, index) => {
          const event = events.find((e) => e.id === id);
          if (!event) return null;
          return { ...event, order: index + 1 };
        })
        .filter((e): e is AnimationEvent => e !== null);

      const updatedElements = eventsToElements(
        reorderedEvents,
        elements as any,
        currentFrame?.id,
      );

      app.scene.replaceAllElements(syncInvalidIndices(updatedElements as any));
    },
    [events, elements, currentFrame?.id, app],
  );

  // 根据 elementId 获取元素对象
  const getElementById = useCallback(
    (elementId: string) => {
      return elements.find((e) => e.id === elementId);
    },
    [elements],
  );

  // 获取事件对应的 stepGroup
  const getEventStepGroup = useCallback(
    (eventId: string) => {
      const event = events.find((e) => e.id === eventId);
      if (!event) return null;

      const firstElementId = event.elements[0];
      if (!firstElementId) return null;

      const element = elements.find((e) => e.id === firstElementId);
      if (!element) return null;

      const animation = (element as any).animation as
        | ElementAnimation
        | undefined;
      return animation?.stepGroup || null;
    },
    [events, elements],
  );

  // 获取可用的动画目标选项
  const getAvailableAnimationTargets = useCallback(
    (eventId: string): AnimationTarget[] | null => {
      const event = events.find((e) => e.id === eventId);
      if (!event) return null;

      // 检查是否包含带装饰的文字组
      let hasDecorationGroup = false;
      for (const elementId of event.elements) {
        const el = elements.find((e) => e.id === elementId);
        if (!el) continue;

        const groupIds = (el as any).groupIds as string[] | undefined;
        if (groupIds?.some((gid) => gid.includes("text-decoration-group"))) {
          hasDecorationGroup = true;
          break;
        }
      }

      if (!hasDecorationGroup) return null;

      return ["all", "text", "background", "underline", "strike"];
    },
    [events, elements],
  );

  return {
    currentFrame,
    frameElements,
    selectedElements,
    events,
    selectedEvent,
    selectEvent,
    createEventFromSelection,
    deleteEvent,
    updateEvent,
    reorderEventList,
    getElementById,
    getEventStepGroup,
    getAvailableAnimationTargets,
  };
}
