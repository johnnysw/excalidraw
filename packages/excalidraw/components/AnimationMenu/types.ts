/**
 * 动画配置面板类型定义
 */

import type { ExcalidrawElement } from "@excalidraw/element/types";

/** 动画类型 */
export type AnimationType =
  | "fadeIn" // 淡入
  | "slideInLeft" // 从左滑入
  | "slideInRight" // 从右滑入
  | "slideInTop" // 从上滑入
  | "slideInBottom" // 从下滑入
  | "textColor"; // 文本变色

/** 开始方式：单击时 / 与上一项同时 / 与上一项之后 */
export type StartMode = "onClick" | "withPrevious" | "afterPrevious";

/** 动画目标（用于带装饰的文字组） */
export type AnimationTarget =
  | "all"
  | "text"
  | "background"
  | "underline"
  | "strike";

/** 动画配置 */
export interface ElementAnimation {
  type: AnimationType;
  duration: number; // 动画时长 (ms)
  stepGroup: number; // 出场顺序组
  trigger: "click" | "auto";
  startMode?: StartMode; // 开始方式（保存以便恢复）
  eventId?: string; // 所属事件 ID（用于分组）
  order?: number; // 播放顺序（保存以便恢复）
  animationTarget?: AnimationTarget; // 动画目标
}

/** 带动画的元素 */
export interface AnimatedElement {
  element: ExcalidrawElement;
  animation: ElementAnimation;
}

/** 按 stepGroup 分组的动画元素 */
export interface AnimationGroup {
  stepGroup: number;
  elements: AnimatedElement[];
}

/**
 * 动画事件（UI 层抽象）
 * 一个事件 = 一次播放动作，可以包含多个元素
 */
export interface AnimationEvent {
  id: string; // 事件唯一标识
  order: number; // 播放顺序 1,2,3...
  elements: string[]; // 参与本次动画的 elementId 列表
  type: AnimationType; // 动画类型
  duration: number; // 持续时间 (ms)
  startMode: StartMode; // 开始方式
  delay?: number; // 延迟时间 (ms)
  trigger?: "click" | "auto"; // 触发方式
  animationTarget?: AnimationTarget; // 动画目标
}

/** 动画类型选项 */
export const ANIMATION_TYPE_OPTIONS: { value: AnimationType; label: string }[] =
  [
    { value: "fadeIn", label: "淡入" },
    { value: "textColor", label: "变色" },
    { value: "slideInLeft", label: "从左滑入" },
    { value: "slideInRight", label: "从右滑入" },
    { value: "slideInTop", label: "从上滑入" },
    { value: "slideInBottom", label: "从下滑入" },
  ];

/** 开始方式选项 */
export const START_MODE_OPTIONS: { value: StartMode; label: string }[] = [
  { value: "onClick", label: "单击时" },
  { value: "withPrevious", label: "与上一项同时" },
  { value: "afterPrevious", label: "在上一项之后" },
];

/** 动画目标选项 */
export const ANIMATION_TARGET_OPTIONS: {
  value: AnimationTarget;
  label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "text", label: "文字" },
  { value: "background", label: "背景" },
  { value: "underline", label: "下划线" },
  { value: "strike", label: "删除线" },
];

/** 默认动画配置 */
export const DEFAULT_ANIMATION: ElementAnimation = {
  type: "fadeIn",
  duration: 500,
  stepGroup: 1,
  trigger: "click",
};

/** 默认事件配置 */
export const DEFAULT_EVENT: Omit<AnimationEvent, "id" | "order" | "elements"> =
  {
    type: "fadeIn",
    duration: 500,
    startMode: "onClick",
    trigger: "click",
  };
