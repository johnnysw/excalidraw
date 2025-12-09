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
import {
  elementsToEvents,
  eventsToElements,
  createEvent,
  reorderEvents,
} from "./animationEventUtils";

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

  // 为选中元素创建新事件（含 text-decoration-group 扩展）
  const createEventFromSelection = useCallback(() => {
    if (selectedElements.length === 0) return;

    const maxOrder =
      events.length > 0 ? Math.max(...events.map((e) => e.order)) : 0;

    const selectedIds = selectedElements.map((el) => el.id);

    // 扩展：如果选中的是带 text-decoration-group 的元素，则自动把同组的元素一并纳入事件
    const decorationGroupIds = new Set<string>();
    for (const el of selectedElements) {
      const groupIds = (el as any).groupIds as string[] | undefined;
      if (!groupIds) continue;
      for (const gid of groupIds) {
        if (gid.includes("text-decoration-group")) {
          decorationGroupIds.add(gid);
        }
      }
    }

    let finalElementIds = selectedIds;
    if (decorationGroupIds.size > 0) {
      const extraIds: string[] = [];
      for (const el of elements) {
        const groupIds = (el as any).groupIds as string[] | undefined;
        if (!groupIds) continue;
        for (const gid of groupIds) {
          if (decorationGroupIds.has(gid)) {
            extraIds.push(el.id);
            break;
          }
        }
      }

      const idSet = new Set<string>([...selectedIds, ...extraIds]);
      finalElementIds = Array.from(idSet);
    }

    const newEvent = createEvent(finalElementIds, maxOrder);

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

  // 删除事件（并重新整理 order）
  const deleteEvent = useCallback(
    (eventId: string) => {
      const remainingEvents = events.filter((e) => e.id !== eventId);
      const reordered = reorderEvents(remainingEvents);
      const updatedElements = eventsToElements(
        reordered,
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

  // 更新事件属性（修改 startMode 时重新计算顺序）
  const updateEvent = useCallback(
    (eventId: string, updates: Partial<AnimationEvent>) => {
      const updatedEvents = events.map((e) =>
        e.id === eventId ? { ...e, ...updates } : e,
      );

      const finalEvents =
        updates.startMode !== undefined
          ? reorderEvents(updatedEvents)
          : updatedEvents;

      const updatedElements = eventsToElements(
        finalEvents,
        elements as any,
        currentFrame?.id,
      );

      app.scene.replaceAllElements(syncInvalidIndices(updatedElements as any));
    },
    [events, elements, currentFrame?.id, app],
  );

  // 重排事件顺序（首个事件不能是 withPrevious）
  const reorderEventList = useCallback(
    (newOrder: string[]) => {
      const orderedEvents = newOrder
        .map((id) => events.find((e) => e.id === id))
        .filter((e): e is AnimationEvent => e !== undefined)
        .map((e, index) => {
          const startMode =
            index === 0 && e.startMode === "withPrevious"
              ? "onClick"
              : e.startMode;
          return { ...e, order: index + 1, startMode };
        });

      const updatedElements = eventsToElements(
        orderedEvents,
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

  // 获取可用的动画目标选项（根据装饰组与 customData.role 精细过滤）
  const getAvailableAnimationTargets = useCallback(
    (eventId: string): AnimationTarget[] | null => {
      const event = events.find((e) => e.id === eventId);
      if (!event || event.elements.length === 0) return null;

      // 事件中的元素
      const eventElements = event.elements
        .map((id) => elements.find((el) => el.id === id))
        .filter((el): el is ExcalidrawElement => el !== undefined);

      // 收集所有 text-decoration-group
      const decorationGroupIds = new Set<string>();
      for (const el of eventElements) {
        const groupIds = (el as any).groupIds as string[] | undefined;
        if (groupIds) {
          for (const gid of groupIds) {
            if (gid.includes("text-decoration-group")) {
              decorationGroupIds.add(gid);
            }
          }
        }
      }

      if (decorationGroupIds.size === 0) return null;

      // 收集角色信息
      const roles = new Set<string>();
      for (const el of eventElements) {
        const customData = (el as any).customData;
        if (customData?.role) {
          roles.add(customData.role);
        }
        if (el.type === "text") {
          roles.add("text");
        }
      }

      const targets: AnimationTarget[] = ["all"];
      if (roles.has("text") || roles.has("option") || roles.has("stem")) {
        targets.push("text");
      }
      if (roles.has("text-background")) {
        targets.push("background");
      }
      if (roles.has("text-underline")) {
        targets.push("underline");
      }
      if (roles.has("text-strike")) {
        targets.push("strike");
      }

      if (targets.length <= 1) return null;

      return targets;
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
