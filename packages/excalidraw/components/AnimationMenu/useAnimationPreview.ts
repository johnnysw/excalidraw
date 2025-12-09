/**
 * 动画预览 Hook
 *
 * 用于在编辑模式下预览当前 Frame 的动画效果
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { useApp, useExcalidrawSetAppState } from "../App";
import { elementsToEvents } from "./animationEventUtils";

interface UseAnimationPreviewReturn {
  /** 开始预览动画，可选传入 stepGroup 只预览该步 */
  handleAnimationPreview: (targetStepGroup?: number) => void;
  /** 停止当前预览 */
  stopPreview: () => void;
  /** 当前是否正在预览 */
  isPlaying: boolean;
}

interface PlayStep {
  stepIndex: number;
  duration: number;
  startMode: string;
}

export function useAnimationPreview(): UseAnimationPreviewReturn {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();
  const [isPlaying, setIsPlaying] = useState(false);

  // 预览状态管理
  const previewRef = useRef<{
    isPlaying: boolean;
    rafId: number;
    timeoutIds: number[];
  }>({ isPlaying: false, rafId: 0, timeoutIds: [] });

  // 停止预览
  const stopPreview = useCallback(() => {
    if (previewRef.current.isPlaying) {
      previewRef.current.isPlaying = false;
      setIsPlaying(false);
      cancelAnimationFrame(previewRef.current.rafId);
      previewRef.current.timeoutIds.forEach(clearTimeout);
      previewRef.current.timeoutIds = [];

      // 重置到初始状态
      setAppState({
        presentationStep: 0,
        animationProgress: 0,
        isPlayingAnimation: false,
        isPlayingAnimationFrameId: null,
      } as any);
    }
  }, [setAppState]);

  // 动画预览逻辑
  const handleAnimationPreview = useCallback(
    (targetStepGroup?: number) => {
      const elements = app.scene.getNonDeletedElements();
      const appState = app.state;
      const selectedIds = Object.keys(appState.selectedElementIds);

      // 确定当前 Frame
      let currentFrameId: string | null = null;

      const selectedFrame = elements.find(
        (el) => selectedIds.includes(el.id) && el.type === "frame",
      );
      if (selectedFrame) {
        currentFrameId = selectedFrame.id;
      } else if (selectedIds.length > 0) {
        const firstSelected = elements.find((el) => el.id === selectedIds[0]);
        if (firstSelected && firstSelected.frameId) {
          currentFrameId = firstSelected.frameId;
        }
      }

      if (!currentFrameId) {
        return;
      }

      // 获取动画事件并按顺序排序
      const events = elementsToEvents(elements as any, currentFrameId);
      if (events.length === 0) return;

      events.sort((a, b) => a.order - b.order);

      // 构建播放步骤
      const playSteps: PlayStep[] = [];
      let currentPlayStep: PlayStep | null = null;
      let stepCounter = 1;

      events.forEach((event, index) => {
        if (index === 0 || event.startMode !== "withPrevious") {
          currentPlayStep = {
            stepIndex: stepCounter++,
            duration: event.duration,
            startMode: event.startMode,
          };
          playSteps.push(currentPlayStep);
        } else {
          if (currentPlayStep) {
            currentPlayStep.duration = Math.max(
              currentPlayStep.duration,
              event.duration,
            );
          }
        }
      });

      // 停止之前的预览并开始新预览
      stopPreview();
      previewRef.current.isPlaying = true;
      setIsPlaying(true);

      // 初始重置
      setAppState({
        presentationStep: 0,
        animationProgress: 0,
        isPlayingAnimation: true,
        isPlayingAnimationFrameId: currentFrameId,
      } as any);

      // 执行单步动画
      const runStepAnimation = (step: PlayStep, onComplete: () => void) => {
        const startTime = performance.now();
        const { duration, stepIndex } = step;

        const tick = (now: number) => {
          if (!previewRef.current.isPlaying) return;
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / duration, 1);

          setAppState({
            presentationStep: stepIndex,
            animationProgress: progress,
            isPlayingAnimation: true,
            isPlayingAnimationFrameId: currentFrameId,
          } as any);

          if (progress < 1) {
            previewRef.current.rafId = requestAnimationFrame(tick);
          } else {
            onComplete();
          }
        };

        previewRef.current.rafId = requestAnimationFrame(tick);
      };

      // 如果指定了 stepGroup，只播放该步
      if (targetStepGroup !== undefined) {
        const targetStep = playSteps.find(
          (p) => p.stepIndex === targetStepGroup,
        );
        if (targetStep) {
          const tid = window.setTimeout(() => {
            runStepAnimation(targetStep, () => {
              previewRef.current.isPlaying = false;
              setIsPlaying(false);
            });
          }, 50);
          previewRef.current.timeoutIds.push(tid);
        }
        return;
      }

      // 播放全部
      let currentPlayIndex = 0;
      const playNextStep = () => {
        if (!previewRef.current.isPlaying) return;
        if (currentPlayIndex >= playSteps.length) {
          previewRef.current.isPlaying = false;
          setIsPlaying(false);
          return;
        }

        const step = playSteps[currentPlayIndex];
        currentPlayIndex++;

        runStepAnimation(step, () => {
          if (currentPlayIndex < playSteps.length) {
            const nextStep = playSteps[currentPlayIndex];
            const delay = nextStep.startMode === "afterPrevious" ? 0 : 500;
            const tid = window.setTimeout(playNextStep, delay);
            previewRef.current.timeoutIds.push(tid);
          } else {
            previewRef.current.isPlaying = false;
            setIsPlaying(false);
          }
        });
      };

      const tid = window.setTimeout(playNextStep, 100);
      previewRef.current.timeoutIds.push(tid);
    },
    [app, stopPreview, setAppState],
  );

  // 组件卸载时停止预览
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  return {
    handleAnimationPreview,
    stopPreview,
    isPlaying,
  };
}
