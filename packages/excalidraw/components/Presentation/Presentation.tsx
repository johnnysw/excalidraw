import React, { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from "react";
import "./Presentation.scss";
import { useApp, useAppProps, useExcalidrawAppState, useExcalidrawElements, useExcalidrawSetAppState } from "../App";
import { ArrowRightIcon, CloseIcon, pencilIcon, EraserIcon, ClearCanvasIcon, HighlighterIcon, ExitPresentationIcon } from "../icons";
import { KEYS, randomId } from "@excalidraw/common";
import type { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import { CaptureUpdateAction, getPresentationFrames } from "@excalidraw/element";
import {
    getAnimationStepConfig,
    getMaxAnimationStep,
    getPresentationAutoAdvanceDelay,
    runAnimationProgress,
    schedulePresentationAutoAdvance,
} from "../AnimationMenu/animationPlayback";

// Common presentation colors for pen
const PEN_COLORS = [
    { color: "#1e1e1e", name: "黑色" },
    { color: "#e03131", name: "红色" },
    { color: "#2f9e44", name: "绿色" },
    { color: "#1971c2", name: "蓝色" },
    { color: "#f08c00", name: "橙色" },
    { color: "#6741d9", name: "紫色" },
];

// Common presentation colors for highlighter
const HIGHLIGHTER_COLORS = [
    { color: "#ffd43b", name: "黄色" },
    { color: "#a5d8ff", name: "浅蓝" },
    { color: "#b2f2bb", name: "浅绿" },
    { color: "#ffc9c9", name: "浅红" },
    { color: "#d0bfff", name: "浅紫" },
    { color: "#ffec99", name: "浅橙" },
];

// Stroke width options
const STROKE_WIDTHS = [
    { value: 0.5, name: "细" },
    { value: 1, name: "中" },
    { value: 1.5, name: "粗" },
];

// Highlighter opacity range (20-80%)
const MIN_OPACITY = 20;
const MAX_OPACITY = 80;

const isElementInFrame = (el: any, frame: ExcalidrawFrameLikeElement) => {
    if (el.frameId === frame.id) return true;
    const elCenterX = el.x + (el.width || 0) / 2;
    const elCenterY = el.y + (el.height || 0) / 2;
    return (
        elCenterX >= frame.x &&
        elCenterX <= frame.x + frame.width &&
        elCenterY >= frame.y &&
        elCenterY <= frame.y + frame.height
    );
};

export const reconcilePresentationFrameIndex = (
    previousFrames: readonly Pick<ExcalidrawFrameLikeElement, "id">[],
    currentFrames: readonly Pick<ExcalidrawFrameLikeElement, "id">[],
    previousIndex: number,
): number | null => {
    if (currentFrames.length === 0) {
        return null;
    }

    const previousFrameId = previousFrames[previousIndex]?.id;
    if (previousFrameId) {
        const currentIndex = currentFrames.findIndex(
            (frame) => frame.id === previousFrameId,
        );
        if (currentIndex !== -1) {
            return currentIndex;
        }
    }

    return Math.min(Math.max(previousIndex, 0), currentFrames.length - 1);
};

const Presentation = () => {
    const appState = useExcalidrawAppState();
    const setAppState = useExcalidrawSetAppState();
    const elements = useExcalidrawElements();
    const app = useApp();
    const appProps = useAppProps();
    const appPropsRef = useRef(appProps);

    const frames = useMemo(
        () => getPresentationFrames(elements, appState.slideOrder),
        [appState.slideOrder, elements],
    );
    const initialSlideIndex = (appState as any).presentationSlideIndex;
    const [storedCurrentIndex, setCurrentIndex] = useState(() =>
        typeof initialSlideIndex === "number" &&
        initialSlideIndex >= 0 &&
        initialSlideIndex < frames.length
            ? initialSlideIndex
            : 0,
    );
    const previousFramesRef = useRef(frames);
    const effectiveCurrentIndex = reconcilePresentationFrameIndex(
        previousFramesRef.current,
        frames,
        storedCurrentIndex,
    );
    const currentIndex = effectiveCurrentIndex ?? 0;
    const [activePresentationTool, setActivePresentationTool] = useState<"none" | "pen" | "highlighter" | "eraser">("none");
    const [showPenColors, setShowPenColors] = useState(false);
    const [showHighlighterColors, setShowHighlighterColors] = useState(false);
    const [currentPenColor, setCurrentPenColor] = useState("#1e1e1e");
    const [currentHighlighterColor, setCurrentHighlighterColor] = useState("#ffd43b");
    const [currentPenWidth, setCurrentPenWidth] = useState(0.5);
    const [currentHighlighterWidth, setCurrentHighlighterWidth] = useState(0.5);
    const [currentHighlighterOpacity, setCurrentHighlighterOpacity] = useState(50);
    const toolSettingsRef = useRef({
        pen: { color: currentPenColor, width: currentPenWidth },
        highlighter: {
            color: currentHighlighterColor,
            width: currentHighlighterWidth,
            opacity: currentHighlighterOpacity,
        },
    });

    // Store original settings to restore on exit
    const originalFrameRenderingRef = useRef(appState.frameRendering);

    const savedViewportRef = useRef<{
        scrollX: number;
        scrollY: number;
        zoom: any;
    } | null>(null);

    // Track element IDs that existed before presentation mode started
    const presentationActiveRef = useRef(false);

    const presentationSessionIdRef = useRef<string | null>(
        appState.presentationAnnotationSessionId,
    );
    presentationSessionIdRef.current = appState.presentationAnnotationSessionId;

    // Refs for navigation state (to avoid stale closures)
    const currentIndexRef = useRef(currentIndex);
    const framesRef = useRef(frames);
    const presentationStepRef = useRef(appState.presentationStep || 0);
    const appStateRef = useRef(appState);
    const elementsRef = useRef(elements);
    const isExitingPresentationRef = useRef(false);
    const shouldDiscardPresentationInkOnCleanupRef = useRef(true);
    const cancelAnimationProgressRef = useRef<(() => void) | null>(null);
    const cancelAutoAdvanceRef = useRef<(() => void) | null>(null);
    currentIndexRef.current = currentIndex;
    framesRef.current = frames;
    presentationStepRef.current = appState.presentationStep || 0;
    appStateRef.current = appState;
    elementsRef.current = elements;
    appPropsRef.current = appProps;

    const clearPresentationPlayback = useCallback(() => {
        cancelAnimationProgressRef.current?.();
        cancelAnimationProgressRef.current = null;
        cancelAutoAdvanceRef.current?.();
        cancelAutoAdvanceRef.current = null;
    }, []);

    const exitPresentation = useCallback(async () => {
        if (isExitingPresentationRef.current) {
            return;
        }
        isExitingPresentationRef.current = true;
        clearPresentationPlayback();
        setShowPenColors(false);
        setShowHighlighterColors(false);

        const latestAppState = appStateRef.current;
        const sessionId = latestAppState.presentationAnnotationSessionId;
        const beforeStopDetail: {
            mode: "viewer";
            promises: Promise<unknown>[];
            keepPresentationInk?: boolean;
        } = {
            mode: "viewer",
            promises: [],
        };
        app.excalidrawContainerRef.current?.dispatchEvent(
            new CustomEvent("excalidraw:beforePresentationStop", {
                detail: beforeStopDetail,
                bubbles: true,
            }),
        );
        if (beforeStopDetail.promises.length > 0) {
            await Promise.allSettled(beforeStopDetail.promises);
        }

        let inkRetentionDecision: "keep" | "discard" =
            beforeStopDetail.keepPresentationInk === true ? "keep" : "discard";
        if (sessionId && appPropsRef.current.onPresentationInkRetentionRequest) {
            try {
                inkRetentionDecision = await appPropsRef.current.onPresentationInkRetentionRequest({
                    elements: app.scene.getElementsIncludingDeleted() as any,
                    appState: latestAppState,
                    files: app.files,
                    sessionId,
                });
            } catch (error) {
                console.warn("Presentation ink retention request failed:", error);
                inkRetentionDecision = "discard";
            }
        }

        shouldDiscardPresentationInkOnCleanupRef.current = inkRetentionDecision !== "keep";

        if (sessionId && inkRetentionDecision !== "keep") {
            const currentElements = app.scene.getElementsIncludingDeleted();
            const elementsToKeep = currentElements.filter(
                (el) =>
                    el.type !== "freedraw" ||
                    (el as any).customData?.annotationSessionId !== sessionId,
            );
            if (elementsToKeep.length !== currentElements.length) {
                (app as any).updateScene({
                    elements: elementsToKeep,
                    captureUpdate: CaptureUpdateAction.NEVER,
                });
            }
        }

        const savedViewport = savedViewportRef.current;
        savedViewportRef.current = null;

        setAppState((state) => ({
            presentationMode: false,
            presentationAnnotationSessionId: null,
            _keepPresentationInkOnExit: inkRetentionDecision === "keep" ? true : undefined,
            openSidebar: (state as any)._savedOpenSidebar ?? state.openSidebar,
            _savedOpenSidebar: undefined,
            ...(savedViewport
                ? {
                    scrollX: savedViewport.scrollX,
                    scrollY: savedViewport.scrollY,
                    zoom: savedViewport.zoom,
                }
                : {}),
        } as any));
    }, [setAppState, app, clearPresentationPlayback]);

    useEffect(() => {
        if (appState.presentationMode && frames.length === 0) {
            void exitPresentation();
            return;
        }
        if (appState.presentationMode && !presentationActiveRef.current) {
            presentationActiveRef.current = true;
            savedViewportRef.current = {
                scrollX: (appState as any).scrollX,
                scrollY: (appState as any).scrollY,
                zoom: (appState as any).zoom,
            };
            // Reset presentationStep when entering presentation mode
            // Save existing element IDs to prevent erasing them in presentation mode
            setAppState({
                presentationStep: 0,
                presentationAnnotationSessionId: randomId(),
            } as any);
            // Set tool to hand to prevent selecting/moving elements
            app.setActiveTool({ type: "hand" });

            app.excalidrawContainerRef.current?.dispatchEvent(
                new CustomEvent("excalidraw:presentationStart", {
                    detail: { total: frames.length },
                    bubbles: true,
                }),
            );
        } else if (!appState.presentationMode && presentationActiveRef.current) {
            presentationActiveRef.current = false;
            app.excalidrawContainerRef.current?.dispatchEvent(
                new CustomEvent("excalidraw:presentationStop", {
                    detail: { total: frames.length },
                    bubbles: true,
                }),
            );
        }
    }, [appState.presentationMode, exitPresentation, frames.length]);

    const getMaxStepsForFrame = (frame: ExcalidrawFrameLikeElement) => {
        const frameElements = elements.filter(el => isElementInFrame(el, frame) && !el.isDeleted);
        return getMaxAnimationStep(frameElements as any);
    };

    useLayoutEffect(() => {
        if (!appState.presentationMode) {
            previousFramesRef.current = frames;
            return;
        }

        const previousFrames = previousFramesRef.current;
        const previousIndex = storedCurrentIndex;
        const previousFrameId = previousFrames[previousIndex]?.id ?? null;
        const nextIndex = effectiveCurrentIndex;
        previousFramesRef.current = frames;

        if (nextIndex === null) {
            void exitPresentation();
            return;
        }

        const nextFrameId = frames[nextIndex]?.id ?? null;
        if (nextIndex !== previousIndex) {
            currentIndexRef.current = nextIndex;
            setCurrentIndex(nextIndex);
        }
        if (nextFrameId !== previousFrameId) {
            setAppState({ presentationStep: 0 });
        }
    }, [
        appState.presentationMode,
        effectiveCurrentIndex,
        exitPresentation,
        frames,
        setAppState,
        storedCurrentIndex,
    ]);

    // Zoom to fit frame with full viewport coverage when index changes
    useEffect(() => {
        if (frames.length > 0 && frames[currentIndex] && appState.presentationMode) {
            const frame = frames[currentIndex];

            app.scrollToContent(frame, {
                fitToViewport: true,
                viewportZoomFactor: 0.95, // slight padding
                maxZoom: 10,
                animate: true,
                duration: 600,
            });

            const currentFrameRendering = appStateRef.current.frameRendering;
            if (
                currentFrameRendering?.enabled !== true ||
                currentFrameRendering?.clip !== true ||
                currentFrameRendering?.outline !== false ||
                currentFrameRendering?.name !== false
            ) {
                setAppState({
                    // Hide frame border and name during presentation
                    frameRendering: {
                        enabled: true,
                        clip: true,
                        outline: false,
                        name: false,
                    },
                } as any);
            }
        }
    }, [currentIndex, frames, appState.presentationMode, appState.width, appState.height]);

    useEffect(() => {
        if (!appState.presentationMode) {
            return;
        }
        const currentFrame = frames[currentIndex];
        const nextFrame = frames[currentIndex + 1];
        app.excalidrawContainerRef.current?.dispatchEvent(
            new CustomEvent("excalidraw:presentationSlideChange", {
                bubbles: true,
                detail: {
                    frameId: currentFrame?.id ?? null,
                    frameName: currentFrame?.name,
                    index: currentIndex,
                    total: frames.length,
                    nextFrameId: nextFrame?.id ?? null,
                    nextFrameName: nextFrame?.name,
                    presentationStep: appState.presentationStep || 0,
                },
            }),
        );
    }, [currentIndex, frames, appState.presentationMode, appState.presentationStep]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!appState.presentationMode) {
                return;
            }
            if (event.key === KEYS.ARROW_RIGHT || event.key === KEYS.SPACE) {
                const currentFrame = frames[currentIndex];
                const currentStep = appState.presentationStep || 0;
                const maxSteps = currentFrame ? getMaxStepsForFrame(currentFrame) : 0;

                if (currentStep < maxSteps) {
                    setAppState({
                        presentationStep: currentStep + 1,
                    } as any);
                } else if (currentIndex < frames.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                    setAppState({
                        presentationStep: 0,
                    } as any);
                }
            } else if (event.key === KEYS.ARROW_LEFT) {
                const currentStep = appState.presentationStep || 0;
                if (currentStep > 0) {
                    setAppState({ presentationStep: currentStep - 1 });
                } else if (currentIndex > 0) {
                    // When going back to previous slide, show all content (set step to maxSteps)
                    const prevFrame = frames[currentIndex - 1];
                    const prevMaxSteps = prevFrame ? getMaxStepsForFrame(prevFrame) : 0;
                    setCurrentIndex(currentIndex - 1);
                    setAppState({ presentationStep: prevMaxSteps });
                }
            } else if (event.key === KEYS.ESCAPE) {
                setShowPenColors(false);
                setShowHighlighterColors(false);
                if (!showPenColors && !showHighlighterColors) {
                    void exitPresentation();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex, frames, setAppState, showPenColors, showHighlighterColors, appState.presentationMode, appState.presentationStep, elements, exitPresentation]);

    const playbackStep = appState.presentationStep || 0;
    const playbackConfig = useMemo(() => {
        const frame = frames[currentIndex];
        if (!frame) {
            return {
                frameId: null as string | null,
                duration: 0,
                maxStep: 0,
                nextAutoAdvanceDelay: null as number | null,
            };
        }

        const frameElements = elements.filter(
            (element) => isElementInFrame(element, frame) && !element.isDeleted,
        );
        const currentStepConfig = getAnimationStepConfig(
            frameElements as any,
            playbackStep,
        );
        const nextStepConfig = getAnimationStepConfig(
            frameElements as any,
            playbackStep + 1,
        );

        return {
            frameId: frame.id,
            duration: currentStepConfig.duration,
            maxStep: getMaxAnimationStep(frameElements as any),
            nextAutoAdvanceDelay: getPresentationAutoAdvanceDelay(
                nextStepConfig.startMode,
            ),
        };
    }, [currentIndex, elements, frames, playbackStep]);

    // Layout timing ensures the runner's synchronous progress=0 update lands before paint.
    const previousPlaybackRef = useRef({
        frameId: playbackConfig.frameId,
        step: playbackStep,
    });
    useLayoutEffect(() => {
        const previousPlayback = previousPlaybackRef.current;
        const isForwardStep =
            playbackConfig.frameId === previousPlayback.frameId &&
            playbackStep > previousPlayback.step;

        clearPresentationPlayback();
        previousPlaybackRef.current = {
            frameId: playbackConfig.frameId,
            step: playbackStep,
        };

        const scheduleNextStep = () => {
            const nextStep = playbackStep + 1;
            if (
                nextStep > playbackConfig.maxStep ||
                playbackConfig.nextAutoAdvanceDelay === null
            ) {
                return;
            }

            cancelAutoAdvanceRef.current = schedulePresentationAutoAdvance(
                playbackConfig.nextAutoAdvanceDelay,
                () => {
                    cancelAutoAdvanceRef.current = null;
                    if (
                        presentationStepRef.current === playbackStep &&
                        currentIndexRef.current === currentIndex
                    ) {
                        setAppState({ presentationStep: nextStep });
                    }
                },
            );
        };

        if (!appState.presentationMode || !playbackConfig.frameId) {
            setAppState({ animationProgress: 1 } as any);
            return clearPresentationPlayback;
        }

        if (!isForwardStep) {
            setAppState({ animationProgress: 1 } as any);
            if (playbackStep === 0) {
                scheduleNextStep();
            }
            return clearPresentationPlayback;
        }

        cancelAnimationProgressRef.current = runAnimationProgress({
            duration: playbackConfig.duration,
            onProgress: (progress) => {
                setAppState({ animationProgress: progress } as any);
            },
            onComplete: () => {
                cancelAnimationProgressRef.current = null;
                if (
                    presentationStepRef.current !== playbackStep ||
                    currentIndexRef.current !== currentIndex
                ) {
                    return;
                }

                scheduleNextStep();
            },
        });

        return clearPresentationPlayback;
    }, [
        appState.presentationMode,
        clearPresentationPlayback,
        currentIndex,
        playbackConfig.duration,
        playbackConfig.frameId,
        playbackConfig.maxStep,
        playbackConfig.nextAutoAdvanceDelay,
        playbackStep,
        setAppState,
    ]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (appStateRef.current.presentationMode && !document.fullscreenElement) {
                void exitPresentation();
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch((err) => {
                    console.error("Error attempting to exit fullscreen:", err);
                });
            }
            // Clear all presentation drawings on exit unless host retained them.
            if (shouldDiscardPresentationInkOnCleanupRef.current) {
                const sessionId = presentationSessionIdRef.current;
                if (sessionId) {
                    const currentElements = app.scene.getElementsIncludingDeleted();
                    const elementsToKeep = currentElements.filter(
                        (el) =>
                            el.type !== "freedraw" ||
                            (el as any).customData?.annotationSessionId !== sessionId,
                    );
                    if (elementsToKeep.length !== currentElements.length) {
                        (app as any).updateScene({
                            elements: elementsToKeep,
                            captureUpdate: CaptureUpdateAction.NEVER,
                        });
                    }
                }
            }
            // Restore original settings on exit
            setAppState((state) => ({
                frameRendering: originalFrameRenderingRef.current,
                openSidebar: (state as any)._savedOpenSidebar ?? state.openSidebar,
                _savedOpenSidebar: undefined,
            } as any));
            // Reset to selection tool
            app.setActiveTool({ type: "selection" });
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, [setAppState, app, exitPresentation]);

    // Hide settings panel when clicking on canvas to start drawing
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            // Check if click is outside the controls area
            if (!target.closest('.Presentation-controls')) {
                setShowPenColors(false);
                setShowHighlighterColors(false);
            }
        };

        if (appState.presentationMode && (showPenColors || showHighlighterColors)) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [appState.presentationMode, showPenColors, showHighlighterColors]);

    // Clear all drawings made during presentation
    const clearAllPresentationDrawings = (
        captureUpdate: any = CaptureUpdateAction.IMMEDIATELY,
    ) => {
        const sessionId = presentationSessionIdRef.current;
        if (!sessionId) {
            return;
        }
        const currentElements = app.scene.getElementsIncludingDeleted();

        // Find elements that were added during presentation (freedraw elements)
        const elementsToKeep = currentElements.filter(
            (el) =>
                el.type !== "freedraw" ||
                (el as any).customData?.annotationSessionId !== sessionId,
        );

        // Replace all elements with only the original ones (excluding presentation drawings)
        if (elementsToKeep.length !== currentElements.length) {
            (app as any).updateScene({
                elements: elementsToKeep,
                captureUpdate,
            });
        }
    };

    // Apply current pen settings
    const applyPenSettings = (color: string, width: number) => {
        toolSettingsRef.current.pen = { color, width };
        setCurrentPenColor(color);
        setCurrentPenWidth(width);
        setActivePresentationTool("pen");
        app.setActiveTool({ type: "freedraw" });
        setAppState({
            currentItemStrokeColor: color,
            currentItemStrokeWidth: width,
            currentItemOpacity: 100,
        });
    };

    // Apply current highlighter settings
    const applyHighlighterSettings = (color: string, width: number, opacity: number) => {
        toolSettingsRef.current.highlighter = { color, width, opacity };
        setCurrentHighlighterColor(color);
        setCurrentHighlighterWidth(width);
        setCurrentHighlighterOpacity(opacity);
        setActivePresentationTool("highlighter");
        app.setActiveTool({ type: "freedraw" });
        setAppState({
            currentItemStrokeColor: color,
            currentItemStrokeWidth: width,
            currentItemOpacity: opacity,
        });
    };

    // Handle tool activation
    const activatePenTool = (color: string) => {
        setShowPenColors(false);
        applyPenSettings(color, currentPenWidth);
    };

    const activateHighlighterTool = (color: string) => {
        setShowHighlighterColors(false);
        applyHighlighterSettings(color, currentHighlighterWidth, currentHighlighterOpacity);
    };

    const handlePenWidthChange = (width: number) => {
        applyPenSettings(currentPenColor, width);
    };

    const handleHighlighterWidthChange = (width: number) => {
        applyHighlighterSettings(currentHighlighterColor, width, currentHighlighterOpacity);
    };

    const handleHighlighterOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const opacity = parseInt(e.target.value);
        applyHighlighterSettings(currentHighlighterColor, currentHighlighterWidth, opacity);
    };

    const togglePenTool = () => {
        if (activePresentationTool === "pen") {
            // Deactivate pen, go back to selection
            setActivePresentationTool("none");
            setShowPenColors(false);
            app.setActiveTool({ type: "selection" });
        } else {
            // Activate pen with current settings and show settings panel
            setShowHighlighterColors(false);
            setShowPenColors(true);
            applyPenSettings(currentPenColor, currentPenWidth);
        }
    };

    const toggleHighlighterTool = () => {
        if (activePresentationTool === "highlighter") {
            // Deactivate highlighter, go back to selection
            setActivePresentationTool("none");
            setShowHighlighterColors(false);
            app.setActiveTool({ type: "selection" });
        } else {
            // Activate highlighter with current settings and show settings panel
            setShowPenColors(false);
            setShowHighlighterColors(true);
            applyHighlighterSettings(currentHighlighterColor, currentHighlighterWidth, currentHighlighterOpacity);
        }
    };

    const toggleEraserTool = () => {
        if (activePresentationTool === "eraser") {
            // Deactivate eraser, go back to selection
            setActivePresentationTool("none");
            app.setActiveTool({ type: "selection" });
        } else {
            // Activate eraser
            setShowPenColors(false);
            setShowHighlighterColors(false);
            setActivePresentationTool("eraser");
            app.setActiveTool({ type: "eraser" });
        }
    };

    const handleClearAllDrawings = () => {
        clearAllPresentationDrawings();
        // Reset tool to selection after clearing
        setActivePresentationTool("none");
        app.setActiveTool({ type: "selection" });
    };

    const presenterCommandRef = useRef<((event: Event) => void) | null>(null);
    presenterCommandRef.current = (event: Event) => {
        const container = app.excalidrawContainerRef.current;
        if (
            !appStateRef.current.presentationMode ||
            !container ||
            !(event.target instanceof Node) ||
            !container.contains(event.target)
        ) {
            return;
        }

        const { type, direction, tool, color, strokeWidth, opacity } =
            (event as CustomEvent).detail ?? {};
        if (type === "param-sync") {
            if (tool === "pen") {
                applyPenSettings(color, strokeWidth);
            } else if (tool === "highlighter") {
                applyHighlighterSettings(color, strokeWidth, opacity);
            }
        } else if (type === "tool-select") {
            setShowPenColors(false);
            setShowHighlighterColors(false);
            if (tool === "pen") {
                const settings = toolSettingsRef.current.pen;
                applyPenSettings(settings.color, settings.width);
            } else if (tool === "highlighter") {
                const settings = toolSettingsRef.current.highlighter;
                applyHighlighterSettings(settings.color, settings.width, settings.opacity);
            } else if (tool === "eraser" || tool === "none") {
                setActivePresentationTool(tool);
                app.setActiveTool({ type: tool === "eraser" ? "eraser" : "selection" });
            }
        } else if (type === "navigate") {
            const index = currentIndexRef.current;
            const step = presentationStepRef.current;
            const currentFrames = framesRef.current;
            const maxStep = (frame: ExcalidrawFrameLikeElement) =>
                getMaxAnimationStep(elementsRef.current.filter(
                    (element) => isElementInFrame(element, frame) && !element.isDeleted,
                ) as any);
            let nextIndex = index;
            let nextStep = step;
            if (direction === "next") {
                if (currentFrames[index] && step < maxStep(currentFrames[index])) {
                    nextStep = step + 1;
                } else if (index < currentFrames.length - 1) {
                    nextIndex = index + 1;
                    nextStep = 0;
                }
            } else if (direction === "prev") {
                if (step > 0) {
                    nextStep = step - 1;
                } else if (index > 0) {
                    nextIndex = index - 1;
                    nextStep = maxStep(currentFrames[nextIndex]);
                }
            }
            // Update refs before React commits so consecutive commands stay ordered.
            currentIndexRef.current = nextIndex;
            presentationStepRef.current = nextStep;
            if (nextIndex !== index) {
                setCurrentIndex(nextIndex);
            }
            if (nextStep !== step || nextIndex !== index) {
                setAppState({ presentationStep: nextStep });
            }
        }
    };
    useEffect(() => {
        const handleCommand = (event: Event) => presenterCommandRef.current?.(event);
        document.addEventListener("excalidraw:presenterCommand", handleCommand);
        return () => document.removeEventListener("excalidraw:presenterCommand", handleCommand);
    }, []);

    if (!appState.presentationMode || frames.length === 0) return null;

    // Get current frame for overlay calculation
    const currentFrame = frames[currentIndex];

    return (
        <>
            {/* Overlay to hide elements outside the current frame */}
            {currentFrame && (
                <div className="Presentation-overlay" />
            )}
            <div className="Presentation-controls">
                {/* Pen tool with color and width picker */}
                <div className="Presentation-controls__tool-wrapper">
                    <div
                        className={`Presentation-controls__tool ${activePresentationTool === "pen" ? "active" : ""}`}
                        onClick={togglePenTool}
                        title="画笔"
                        style={activePresentationTool === "pen" ? { borderColor: currentPenColor } : {}}
                    >
                        <div style={{ color: activePresentationTool === "pen" ? currentPenColor : "inherit" }}>
                            {pencilIcon}
                        </div>
                    </div>
                    {showPenColors && (
                        <div className="Presentation-controls__picker-panel">
                            {/* Colors */}
                            <div className="Presentation-controls__picker-row">
                                <span className="Presentation-controls__picker-label">颜色</span>
                                <div className="Presentation-controls__color-options">
                                    {PEN_COLORS.map((item) => (
                                        <div
                                            key={item.color}
                                            className={`Presentation-controls__color-option ${currentPenColor === item.color ? "active" : ""}`}
                                            style={{ backgroundColor: item.color }}
                                            onClick={() => activatePenTool(item.color)}
                                            title={item.name}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* Stroke width */}
                            <div className="Presentation-controls__picker-row">
                                <span className="Presentation-controls__picker-label">粗细</span>
                                <div className="Presentation-controls__width-options">
                                    {STROKE_WIDTHS.map((item) => (
                                        <div
                                            key={item.value}
                                            className={`Presentation-controls__width-option ${currentPenWidth === item.value ? "active" : ""}`}
                                            onClick={() => handlePenWidthChange(item.value)}
                                            title={item.name}
                                        >
                                            <div
                                                className="Presentation-controls__width-preview"
                                                style={{
                                                    height: item.value * 2,
                                                    backgroundColor: currentPenColor
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Highlighter tool with color, width, and opacity picker */}
                <div className="Presentation-controls__tool-wrapper">
                    <div
                        className={`Presentation-controls__tool ${activePresentationTool === "highlighter" ? "active" : ""}`}
                        onClick={toggleHighlighterTool}
                        title="荧光笔"
                        style={activePresentationTool === "highlighter" ? { borderColor: currentHighlighterColor } : {}}
                    >
                        <div style={{ color: activePresentationTool === "highlighter" ? currentHighlighterColor : "inherit" }}>
                            {HighlighterIcon}
                        </div>
                    </div>
                    {showHighlighterColors && (
                        <div className="Presentation-controls__picker-panel">
                            {/* Colors */}
                            <div className="Presentation-controls__picker-row">
                                <span className="Presentation-controls__picker-label">颜色</span>
                                <div className="Presentation-controls__color-options">
                                    {HIGHLIGHTER_COLORS.map((item) => (
                                        <div
                                            key={item.color}
                                            className={`Presentation-controls__color-option ${currentHighlighterColor === item.color ? "active" : ""}`}
                                            style={{ backgroundColor: item.color }}
                                            onClick={() => activateHighlighterTool(item.color)}
                                            title={item.name}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* Stroke width */}
                            <div className="Presentation-controls__picker-row">
                                <span className="Presentation-controls__picker-label">粗细</span>
                                <div className="Presentation-controls__width-options">
                                    {STROKE_WIDTHS.map((item) => (
                                        <div
                                            key={item.value}
                                            className={`Presentation-controls__width-option ${currentHighlighterWidth === item.value ? "active" : ""}`}
                                            onClick={() => handleHighlighterWidthChange(item.value)}
                                            title={item.name}
                                        >
                                            <div
                                                className="Presentation-controls__width-preview"
                                                style={{
                                                    height: item.value * 2,
                                                    backgroundColor: currentHighlighterColor,
                                                    opacity: currentHighlighterOpacity / 100,
                                                }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Opacity */}
                            <div className="Presentation-controls__picker-row">
                                <span className="Presentation-controls__picker-label">透明度</span>
                                <div className="Presentation-controls__opacity-slider-wrapper">
                                    <input
                                        type="range"
                                        min={MIN_OPACITY}
                                        max={MAX_OPACITY}
                                        value={currentHighlighterOpacity}
                                        onChange={handleHighlighterOpacityChange}
                                        className="Presentation-controls__opacity-slider"
                                    />
                                    <span className="Presentation-controls__opacity-value">{currentHighlighterOpacity}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Eraser tool */}
                <div
                    className={`Presentation-controls__tool ${activePresentationTool === "eraser" ? "active" : ""}`}
                    onClick={toggleEraserTool}
                    title="橡皮擦 (Eraser)"
                >
                    {EraserIcon}
                </div>

                {/* Clear all drawings button */}
                <div
                    className="Presentation-controls__tool"
                    onClick={handleClearAllDrawings}
                    title="清除所有笔迹"
                >
                    {ClearCanvasIcon}
                </div>

                <div className="Presentation-controls__separator" />

                {/* Navigation controls */}
                <div className="Presentation-controls__prev" onClick={() => {
                    const currentStep = appState.presentationStep || 0;
                    if (currentStep > 0) {
                        setAppState({ presentationStep: currentStep - 1 });
                    } else if (currentIndex > 0) {
                        // When going back to previous slide, show all content (set step to maxSteps)
                        const prevFrame = frames[currentIndex - 1];
                        const prevMaxSteps = prevFrame ? getMaxStepsForFrame(prevFrame) : 0;
                        setCurrentIndex(currentIndex - 1);
                        setAppState({ presentationStep: prevMaxSteps });
                    }
                }}>
                    <div style={{ transform: "rotate(180deg)" }}>
                        {ArrowRightIcon}
                    </div>
                </div>
                <div className="Presentation-controls__info">
                    {currentIndex + 1} / {frames.length}
                </div>
                <div className="Presentation-controls__next" onClick={() => {
                    const currentFrame = frames[currentIndex];
                    const currentStep = appState.presentationStep || 0;
                    const maxSteps = currentFrame ? getMaxStepsForFrame(currentFrame) : 0;

                    if (currentStep < maxSteps) {
                        setAppState({
                            presentationStep: currentStep + 1,
                        } as any);
                    } else if (currentIndex < frames.length - 1) {
                        setCurrentIndex(currentIndex + 1);
                        setAppState({
                            presentationStep: 0,
                        } as any);
                    }
                }}>
                    {ArrowRightIcon}
                </div>
                <div className="Presentation-controls__close" onClick={() => void exitPresentation()}>
                    {ExitPresentationIcon}
                </div>
            </div>
        </>
    );
};

export default Presentation;
