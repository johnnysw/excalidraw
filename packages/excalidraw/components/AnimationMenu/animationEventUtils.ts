/**
 * AnimationEvent <-> ElementAnimation 转换工具
 *
 * 用于在 UI 层的事件模型与底层元素动画数据之间进行转换。
 * - elementsToEvents: 从 elements 组装 AnimationEvent[]
 * - eventsToElements: 把 AnimationEvent[] 写回到 elements
 */

import type {
  AnimationEvent,
  AnimationType,
  StartMode,
  ElementAnimation,
  AnimationTarget,
} from "./types";
import { DEFAULT_EVENT } from "./types";

/**
 * 带动画字段的元素类型
 */
type ElementWithAnimation = {
  id: string;
  type: string;
  isDeleted?: boolean;
  frameId?: string | null;
  animation?: ElementAnimation;
  [key: string]: any;
};

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * 从元素列表中组装动画事件列表
 */
export function elementsToEvents(
  elements: readonly ElementWithAnimation[],
  frameId?: string,
): AnimationEvent[] {
  // 筛选有动画的元素
  const animatedElements = elements.filter((el) => {
    if (el.isDeleted) return false;
    if (!el.animation || !el.animation.stepGroup) return false;
    if (frameId && el.frameId !== frameId) return false;
    return true;
  });

  if (animatedElements.length === 0) {
    return [];
  }

  // 按 eventId 分组（优先），如果没有 eventId 则按 stepGroup 分组
  const groupMap = new Map<string, ElementWithAnimation[]>();
  for (const el of animatedElements) {
    const animation = el.animation!;
    const groupKey = animation.eventId || `stepGroup-${animation.stepGroup}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, []);
    }
    groupMap.get(groupKey)!.push(el);
  }

  // 按保存的 order 排序
  const sortedGroups = Array.from(groupMap.entries()).sort((a, b) => {
    const aOrder = a[1][0].animation!.order;
    const bOrder = b[1][0].animation!.order;
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder;
    }
    const aStepGroup = a[1][0].animation!.stepGroup;
    const bStepGroup = b[1][0].animation!.stepGroup;
    if (aStepGroup !== bStepGroup) {
      return aStepGroup - bStepGroup;
    }
    return a[0].localeCompare(b[0]);
  });

  // 转换为 AnimationEvent
  const events: AnimationEvent[] = [];

  for (let i = 0; i < sortedGroups.length; i++) {
    const [groupKey, groupElements] = sortedGroups[i];
    const firstEl = groupElements[0];
    const animation = firstEl.animation!;

    let startMode: StartMode;
    const savedStartMode = animation.startMode as StartMode | undefined;
    if (savedStartMode) {
      startMode = savedStartMode;
    } else if (i === 0) {
      startMode = "onClick";
    } else {
      startMode = "afterPrevious";
    }

    const eventId =
      animation.eventId ||
      (frameId
        ? `event-${frameId}-${groupKey}`
        : `event-global-${groupKey}`);

    const event: AnimationEvent = {
      id: eventId,
      order: i + 1,
      elements: groupElements.map((el) => el.id),
      type: (animation.type as AnimationType) || "fadeIn",
      duration: animation.duration || 500,
      startMode,
      trigger: animation.trigger || "click",
      animationTarget: animation.animationTarget,
    };

    events.push(event);
  }

  return events;
}

/**
 * 把动画事件列表写回到元素
 */
export function eventsToElements(
  events: AnimationEvent[],
  elements: readonly ElementWithAnimation[],
  frameId?: string,
): ElementWithAnimation[] {
  const sortedEvents = [...events].sort((a, b) => a.order - b.order);

  // 计算每个事件对应的 stepGroup
  const eventStepGroups = new Map<string, number>();
  let currentStepGroup = 0;

  for (const event of sortedEvents) {
    if (event.startMode === "withPrevious" && currentStepGroup > 0) {
      eventStepGroups.set(event.id, currentStepGroup);
    } else {
      currentStepGroup++;
      eventStepGroups.set(event.id, currentStepGroup);
    }
  }

  // 建立 elementId -> event 的映射
  const elementEventMap = new Map<string, AnimationEvent>();
  for (const event of sortedEvents) {
    for (const elementId of event.elements) {
      elementEventMap.set(elementId, event);
    }
  }

  // 更新元素
  return elements.map((el) => {
    const event = elementEventMap.get(el.id);

    if (!event) {
      if (frameId && el.frameId !== frameId) {
        return el;
      }
      if (el.animation) {
        return {
          ...el,
          animation: undefined,
        };
      }
      return el;
    }

    const stepGroup = eventStepGroups.get(event.id)!;
    return {
      ...el,
      animation: {
        type: event.type,
        duration: event.duration,
        stepGroup,
        trigger: event.trigger || "click",
        startMode: event.startMode,
        eventId: event.id,
        order: event.order,
        animationTarget: event.animationTarget,
      },
    };
  });
}

/**
 * 创建一个新的动画事件
 */
export function createEvent(
  elementIds: string[],
  insertAfterOrder: number,
): AnimationEvent {
  const newOrder = insertAfterOrder + 1;

  const newEvent: AnimationEvent = {
    id: generateId(),
    order: newOrder,
    elements: elementIds,
    ...DEFAULT_EVENT,
    startMode: insertAfterOrder === 0 ? "onClick" : "afterPrevious",
  };

  return newEvent;
}

/**
 * 重新计算事件列表的 order
 */
export function reorderEvents(events: AnimationEvent[]): AnimationEvent[] {
  const sorted = [...events].sort((a, b) => a.order - b.order);
  return sorted.map((event, index) => ({
    ...event,
    order: index + 1,
  }));
}

/**
 * 从事件中移除指定元素
 */
export function removeElementFromEvent(
  event: AnimationEvent,
  elementId: string,
): AnimationEvent | null {
  const newElements = event.elements.filter((id) => id !== elementId);

  if (newElements.length === 0) {
    return null;
  }

  return {
    ...event,
    elements: newElements,
  };
}

/**
 * 将元素添加到现有事件中
 */
export function addElementsToEvent(
  event: AnimationEvent,
  elementIds: string[],
): AnimationEvent {
  const newIds = elementIds.filter((id) => !event.elements.includes(id));

  return {
    ...event,
    elements: [...event.elements, ...newIds],
  };
}

/**
 * 根据动画目标过滤元素 ID 列表
 */
export function filterElementsByAnimationTarget(
  elementIds: string[],
  elements: readonly ElementWithAnimation[],
  animationTarget?: AnimationTarget,
): string[] {
  if (!animationTarget || animationTarget === "all") {
    return elementIds;
  }

  return elementIds.filter((id) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return false;

    const customData = (el as any).customData;
    const role = customData?.role as string | undefined;

    switch (animationTarget) {
      case "text":
        return el.type === "text" || role === "option" || role === "stem";
      case "background":
        return role === "text-background";
      case "underline":
        return role === "text-underline";
      case "strike":
        return role === "text-strike";
      default:
        return true;
    }
  });
}

/**
 * 获取元素的摘要文本
 */
export function getElementSummary(
  element: ElementWithAnimation,
  maxLength: number = 20,
): string {
  if (element.type === "text" && "text" in element) {
    const text = (element as any).text as string;
    if (text.length > maxLength) {
      return text.slice(0, maxLength) + "…";
    }
    return text;
  }

  const typeLabels: Record<string, string> = {
    rectangle: "矩形",
    ellipse: "椭圆",
    diamond: "菱形",
    line: "线条",
    arrow: "箭头",
    freedraw: "手绘",
    image: "图片",
    frame: "画框",
    text: "文本",
  };

  return typeLabels[element.type] || element.type;
}

/**
 * 获取动画类型的图标/颜色
 */
export function getAnimationTypeIcon(type: AnimationType): {
  icon: string;
  color: string;
} {
  const icons: Record<AnimationType, { icon: string; color: string }> = {
    fadeIn: { icon: "✨", color: "#52c41a" },
    slideInLeft: { icon: "→", color: "#1890ff" },
    slideInRight: { icon: "←", color: "#1890ff" },
    slideInTop: { icon: "↓", color: "#1890ff" },
    slideInBottom: { icon: "↑", color: "#1890ff" },
    textColor: { icon: "A", color: "#f97316" },
  };

  return icons[type] || { icon: "✨", color: "#52c41a" };
}
