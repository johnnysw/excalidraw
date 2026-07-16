/**
 * 动画预览 Hook
 *
 * 用于在编辑模式下预览当前 Frame 的动画效果
 */

import { useCallback, useRef, useEffect, useState } from "react";
import { useApp, useExcalidrawSetAppState } from "../App";
import { elementsToEvents } from "./animationEventUtils";
import {
  buildAnimationPlaybackSteps,
  getAnimationPreviewInitialDelay,
  runAnimationProgress,
} from "./animationPlayback";

interface UseAnimationPreviewReturn {
  /** 开始预览动画，可选传入 stepGroup 只预览该步 */
  handleAnimationPreview: (targetStepGroup?: number) => void;
  /** 停止当前预览 */
  stopPreview: () => void;
  /** 当前是否正在预览 */
  isPlaying: boolean;
}

export function useAnimationPreview(): UseAnimationPreviewReturn {
  const app = useApp();
  const setAppState = useExcalidrawSetAppState();
  const [isPlaying, setIsPlaying] = useState(false);

  // 预览状态管理
  const previewRef = useRef<{
    isPlaying: boolean;
    cancelProgress: (() => void) | null;
    timeoutIds: number[];
  }>({ isPlaying: false, cancelProgress: null, timeoutIds: [] });

  // 停止预览
  const stopPreview = useCallback(() => {
    previewRef.current.isPlaying = false;
    setIsPlaying(false);
    previewRef.current.cancelProgress?.();
    previewRef.current.cancelProgress = null;
    previewRef.current.timeoutIds.forEach(clearTimeout);
    previewRef.current.timeoutIds = [];

    // 重置到初始状态
    setAppState({
      presentationStep: 0,
      animationProgress: 0,
      isPlayingAnimation: false,
      isPlayingAnimationFrameId: null,
    } as any);
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

      const playSteps = buildAnimationPlaybackSteps(events);

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
      const runStepAnimation = (
        step: (typeof playSteps)[number],
        onComplete: () => void,
      ) => {
        previewRef.current.cancelProgress = runAnimationProgress({
          duration: step.duration,
          onProgress: (progress) => {
            if (!previewRef.current.isPlaying) return;
            setAppState({
              presentationStep: step.stepGroup,
              animationProgress: progress,
              isPlayingAnimation: true,
              isPlayingAnimationFrameId: currentFrameId,
            } as any);
          },
          onComplete: () => {
            previewRef.current.cancelProgress = null;
            if (!previewRef.current.isPlaying) return;
            onComplete();
          },
        });
      };

      // 如果指定了 stepGroup，只播放该步
      if (targetStepGroup !== undefined) {
        const targetStep = playSteps.find(
          (step) => step.stepGroup === targetStepGroup,
        );
        if (targetStep) {
          const tid = window.setTimeout(() => {
            runStepAnimation(targetStep, () => {
              stopPreview();
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
          stopPreview();
          return;
        }

        const step = playSteps[currentPlayIndex];
        currentPlayIndex++;

        runStepAnimation(step, () => {
          if (currentPlayIndex < playSteps.length) {
            const nextStep = playSteps[currentPlayIndex];
            const tid = window.setTimeout(
              playNextStep,
              nextStep.previewGap,
            );
            previewRef.current.timeoutIds.push(tid);
          } else {
            stopPreview();
          }
        });
      };

      const tid = window.setTimeout(
        playNextStep,
        getAnimationPreviewInitialDelay(playSteps),
      );
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
