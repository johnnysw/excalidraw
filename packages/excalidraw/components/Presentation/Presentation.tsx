import React, { useEffect, useState, useRef } from "react";
import "./Presentation.scss";
import { useApp, useExcalidrawAppState, useExcalidrawElements, useExcalidrawSetAppState } from "../App";
import { ArrowRightIcon, CloseIcon, pencilIcon, EraserIcon, ClearCanvasIcon, HighlighterIcon, ExitPresentationIcon } from "../icons";
import { KEYS, randomId } from "@excalidraw/common";
import { ExcalidrawFrameLikeElement, ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import { newFreeDrawElement, syncInvalidIndices } from "@excalidraw/element";
import type { LocalPoint } from "@excalidraw/math";

const PRESENTER_CHANNEL_NAME = 'presenter-drawing';

interface PresenterStroke {
    id: string;
    tool: 'pen' | 'highlighter';
    color: string;
    strokeWidth: number;
    opacity: number;
    points: Array<{ x: number; y: number }>;
    frameId: string;
}


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
    { value: 1, name: "细" },
    { value: 2, name: "中" },
    { value: 3, name: "粗" },
];

// Highlighter opacity range (20-80%)
const MIN_OPACITY = 20;
const MAX_OPACITY = 80;

const Presentation = () => {
    const appState = useExcalidrawAppState();
    const setAppState = useExcalidrawSetAppState();
    const elements = useExcalidrawElements();
    const app = useApp();

    const [frames, setFrames] = useState<ExcalidrawFrameLikeElement[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [activePresentationTool, setActivePresentationTool] = useState<"none" | "pen" | "highlighter" | "eraser">("none");
    const [showPenColors, setShowPenColors] = useState(false);
    const [showHighlighterColors, setShowHighlighterColors] = useState(false);
    const [currentPenColor, setCurrentPenColor] = useState("#1e1e1e");
    const [currentHighlighterColor, setCurrentHighlighterColor] = useState("#ffd43b");
    const [currentPenWidth, setCurrentPenWidth] = useState(1);
    const [currentHighlighterWidth, setCurrentHighlighterWidth] = useState(1);
    const [currentHighlighterOpacity, setCurrentHighlighterOpacity] = useState(50);

    // Store original settings to restore on exit
    const originalFrameRenderingRef = useRef(appState.frameRendering);

    // Track element IDs that existed before presentation mode started
    const originalElementIdsRef = useRef<Set<string>>(new Set());
    const presentationActiveRef = useRef(false);
    // Track if we've applied the initial slide index
    const initialSlideAppliedRef = useRef(false);

    // BroadcastChannel ref for receiving drawing data from presenter view
    const presenterChannelRef = useRef<BroadcastChannel | null>(null);

    // Refs for navigation state (to avoid stale closures)
    const currentIndexRef = useRef(currentIndex);
    const framesLengthRef = useRef(frames.length);
    const framesRef = useRef(frames);
    const presentationStepRef = useRef(appState.presentationStep || 0);
    currentIndexRef.current = currentIndex;
    framesLengthRef.current = frames.length;
    framesRef.current = frames;
    presentationStepRef.current = appState.presentationStep || 0;

    // Save original element IDs when presentation mode starts
    useEffect(() => {
        if (appState.presentationMode) {
            originalElementIdsRef.current = new Set(elements.map(el => el.id));
        }
    }, [appState.presentationMode]);

    useEffect(() => {
        if (appState.presentationMode && !presentationActiveRef.current) {
            presentationActiveRef.current = true;
            initialSlideAppliedRef.current = false; // Reset for new presentation
            // Reset presentationStep when entering presentation mode
            setAppState({ presentationStep: 0 });

            document.dispatchEvent(
                new CustomEvent("excalidraw:presentationStart", {
                    detail: { total: frames.length },
                }),
            );
        } else if (!appState.presentationMode && presentationActiveRef.current) {
            presentationActiveRef.current = false;
            document.dispatchEvent(
                new CustomEvent("excalidraw:presentationStop", {
                    detail: { total: frames.length },
                }),
            );
        }
    }, [appState.presentationMode, frames.length]);

    // Get custom slide order from appState
    const customSlideOrder = (appState as any).slideOrder as string[] | undefined;

    // Check if element is inside frame bounds (fallback when frameId is not set)
    const isElementInFrame = (el: any, frame: ExcalidrawFrameLikeElement) => {
        if (el.frameId === frame.id) return true;
        // Geometric check: element center point within frame bounds
        const elCenterX = el.x + (el.width || 0) / 2;
        const elCenterY = el.y + (el.height || 0) / 2;
        return (
            elCenterX >= frame.x &&
            elCenterX <= frame.x + frame.width &&
            elCenterY >= frame.y &&
            elCenterY <= frame.y + frame.height
        );
    };

    const getMaxStepsForFrame = (frame: ExcalidrawFrameLikeElement) => {
        const frameElements = elements.filter(el => isElementInFrame(el, frame) && !el.isDeleted);
        let max = 0;
        for (const el of frameElements) {
            if (el.animation && el.animation.stepGroup) {
                max = Math.max(max, el.animation.stepGroup);
            }
        }
        return max;
    };

    // Get the startMode for a specific step in a frame
    const getStepStartMode = (frame: ExcalidrawFrameLikeElement, step: number): string => {
        const frameElements = elements.filter(el => isElementInFrame(el, frame) && !el.isDeleted);
        // Find an element with this stepGroup and get its startMode
        for (const el of frameElements) {
            if (el.animation && el.animation.stepGroup === step) {
                return (el.animation as any).startMode || 'onClick';
            }
        }
        return 'onClick';
    };

    useEffect(() => {
        const allFrames = elements.filter((el) => el.type === "frame" && !el.isDeleted) as ExcalidrawFrameLikeElement[];

        if (customSlideOrder && customSlideOrder.length > 0) {
            // Use custom order from PresentationMenu
            const orderedFrames = customSlideOrder
                .map(id => allFrames.find(f => f.id === id))
                .filter((f): f is ExcalidrawFrameLikeElement => f != null);

            // Add any new frames that weren't in the custom order (at the end)
            const remainingFrames = allFrames.filter(f => !customSlideOrder.includes(f.id));
            remainingFrames.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
                return a.x - b.x;
            });

            setFrames([...orderedFrames, ...remainingFrames]);
        } else {
            // Default: sort by Y position
            allFrames.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
                return a.x - b.x;
            });
            setFrames(allFrames);
        }
    }, [elements, customSlideOrder]);

    // Apply initial slide index when frames are ready and presentation starts
    useEffect(() => {
        if (appState.presentationMode && frames.length > 0 && !initialSlideAppliedRef.current) {
            const startIndex = (appState as any).presentationSlideIndex;
            if (typeof startIndex === 'number' && startIndex >= 0 && startIndex < frames.length) {
                setCurrentIndex(startIndex);
                currentIndexRef.current = startIndex;
            }
            initialSlideAppliedRef.current = true;
        }
    }, [appState.presentationMode, frames.length, appState]);

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

            setAppState((state) => ({
                ...state,
                // Hide frame border and name during presentation
                frameRendering: {
                    enabled: true,
                    clip: true,
                    outline: false,
                    name: false,
                },
            }));
        }
    }, [currentIndex, frames, appState.presentationMode, appState.width, appState.height]);

    useEffect(() => {
        if (!appState.presentationMode) {
            return;
        }
        const currentFrame = frames[currentIndex];
        const nextFrame = frames[currentIndex + 1];
        document.dispatchEvent(
            new CustomEvent("excalidraw:presentationSlideChange", {
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
            if (event.key === KEYS.ARROW_RIGHT || event.key === KEYS.SPACE) {
                const currentFrame = frames[currentIndex];
                const currentStep = appState.presentationStep || 0;
                const maxSteps = currentFrame ? getMaxStepsForFrame(currentFrame) : 0;

                if (currentStep < maxSteps) {
                    setAppState({
                        presentationStep: currentStep + 1,
                        animationProgress: 0 // Reset animation progress immediately to prevent flash
                    } as any);
                } else if (currentIndex < frames.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                    setAppState({
                        presentationStep: 0,
                        animationProgress: 0
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
                    setAppState({ presentationMode: false });
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex, frames, setAppState, showPenColors, showHighlighterColors, appState.presentationStep, elements]);

    // Animation progress effect - animate from 0 to 1 when presentationStep changes
    const prevStepRef = useRef(appState.presentationStep);
    useEffect(() => {
        const currentStep = appState.presentationStep || 0;
        const currentFrame = frames[currentIndex];

        // Only animate forward (new step appearing)
        if (currentStep > prevStepRef.current) {
            // Start animation from 0
            setAppState({ animationProgress: 0 } as any);

            const startTime = performance.now();
            const duration = 400; // ms

            const animate = (now: number) => {
                const elapsed = now - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function (ease-out)
                const eased = 1 - Math.pow(1 - progress, 3);

                setAppState({ animationProgress: eased } as any);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Animation complete - check if next step should auto-play
                    if (currentFrame) {
                        const maxSteps = getMaxStepsForFrame(currentFrame);
                        const nextStep = currentStep + 1;
                        if (nextStep <= maxSteps) {
                            const nextStartMode = getStepStartMode(currentFrame, nextStep);
                            if (nextStartMode === 'afterPrevious') {
                                // Auto-advance to next step after a brief delay
                                setTimeout(() => {
                                    setAppState({
                                        presentationStep: nextStep,
                                        animationProgress: 0
                                    } as any);
                                }, 50);
                            }
                        }
                    }
                }
            };

            requestAnimationFrame(animate);
        } else {
            // Going backward or staying same - no animation
            setAppState({ animationProgress: 1 } as any);
        }

        prevStepRef.current = currentStep;
    }, [appState.presentationStep, setAppState, currentIndex, frames]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                // 退出演示模式时恢复保存的侧边栏状态
                setAppState((state) => ({
                    presentationMode: false,
                    openSidebar: (state as any)._savedOpenSidebar ?? state.openSidebar,
                    _savedOpenSidebar: undefined, // 清除保存的状态
                } as any));
            }
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);

        return () => {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch((err) => {
                    console.error("Error attempting to exit fullscreen:", err);
                });
            }
            // Clear all presentation drawings on exit
            clearAllPresentationDrawings();
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
    }, [appState.presentationMode, setAppState, app]);

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
    const clearAllPresentationDrawings = () => {
        const originalIds = originalElementIdsRef.current;
        const currentElements = app.scene.getNonDeletedElements();

        // Find elements that were added during presentation (freedraw elements)
        const elementsToKeep = currentElements.filter(
            (el) => originalIds.has(el.id) || el.type !== "freedraw"
        );

        // Replace all elements with only the original ones (excluding presentation drawings)
        if (elementsToKeep.length !== currentElements.length) {
            app.scene.replaceAllElements(elementsToKeep);
        }
    };

    // Apply current pen settings
    const applyPenSettings = (color: string, width: number) => {
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

    // 监听来自演讲者视图的工具指令（放在工具函数定义之后，避免提升问题）
    useEffect(() => {
        const handleTool = (event: Event) => {
            const detail = (event as CustomEvent).detail || {};
            const tool = detail?.tool as "pen" | "highlighter" | "eraser" | "clear" | undefined;
            if (!tool) return;

            if (tool === "pen") {
                setShowHighlighterColors(false);
                setShowPenColors(false);
                applyPenSettings(currentPenColor, currentPenWidth);
            } else if (tool === "highlighter") {
                setShowHighlighterColors(false);
                setShowPenColors(false);
                applyHighlighterSettings(currentHighlighterColor, currentHighlighterWidth, currentHighlighterOpacity);
            } else if (tool === "eraser") {
                setShowHighlighterColors(false);
                setShowPenColors(false);
                setActivePresentationTool("eraser");
                app.setActiveTool({ type: "eraser" });
            } else if (tool === "clear") {
                clearAllPresentationDrawings();
                setActivePresentationTool("none");
                app.setActiveTool({ type: "selection" });
            }
        };

        document.addEventListener("excalidraw:presentationTool", handleTool as any);
        return () => {
            document.removeEventListener("excalidraw:presentationTool", handleTool as any);
        };
    }, [
        applyHighlighterSettings,
        applyPenSettings,
        clearAllPresentationDrawings,
        app,
        currentPenColor,
        currentPenWidth,
        currentHighlighterColor,
        currentHighlighterWidth,
        currentHighlighterOpacity,
    ]);

    // 监听来自演讲者视图的笔迹数据 - 使用 ref 避免重复创建 channel
    useEffect(() => {
        if (!appState.presentationMode) {
            // 关闭 channel
            if (presenterChannelRef.current) {
                presenterChannelRef.current.close();
                presenterChannelRef.current = null;
            }
            return;
        }

        // 如果 channel 已存在，不重复创建
        if (presenterChannelRef.current) {
            return;
        }

        const channel = new BroadcastChannel(PRESENTER_CHANNEL_NAME);
        presenterChannelRef.current = channel;

        channel.onmessage = (event: MessageEvent) => {
            const { type, stroke, frameId, tool, color, strokeWidth, opacity, direction } = event.data || {};

            // 处理参数同步消息
            if (type === 'param-sync') {
                if (tool === 'pen') {
                    setActivePresentationTool('pen');
                    setCurrentPenColor(color);
                    setCurrentPenWidth(strokeWidth);
                    applyPenSettings(color, strokeWidth);
                } else if (tool === 'highlighter') {
                    setActivePresentationTool('highlighter');
                    setCurrentHighlighterColor(color);
                    setCurrentHighlighterWidth(strokeWidth);
                    setCurrentHighlighterOpacity(opacity);
                    applyHighlighterSettings(color, strokeWidth, opacity);
                }
                return;
            }

            // 处理工具选择消息
            if (type === 'tool-select') {
                if (tool === 'eraser') {
                    setActivePresentationTool('eraser');
                } else if (tool === 'none') {
                    setActivePresentationTool('none');
                }
                return;
            }

            if (type === 'stroke-complete' && stroke) {
                // 从演讲者视图接收笔迹，创建 freedraw 元素
                const presenterStroke = stroke as PresenterStroke;
                const points = presenterStroke.points;
                if (!points || points.length < 2) return;

                // 计算笔迹的边界
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of points) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }

                // 将点转换为相对于元素原点的坐标
                const relativePoints: [number, number][] = points.map(p => [
                    p.x - minX,
                    p.y - minY,
                ]);

                // 创建 freedraw 元素
                // 启用 simulatePressure 使笔迹效果与主窗口直接绘画一致
                const freedrawElement = newFreeDrawElement({
                    type: "freedraw",
                    x: minX,
                    y: minY,
                    strokeColor: presenterStroke.color,
                    strokeWidth: presenterStroke.strokeWidth,
                    opacity: presenterStroke.opacity,
                    points: relativePoints as unknown as LocalPoint[],
                    simulatePressure: true,
                    pressures: [],
                });

                // 将元素添加到场景
                const currentElements = app.scene.getNonDeletedElements();
                const mergedElements = [...currentElements, freedrawElement];
                // 修复新元素缺少的 fractional index，避免 InvalidFractionalIndexError
                syncInvalidIndices(mergedElements);
                app.scene.replaceAllElements(mergedElements);
            } else if (type === 'erase-stroke') {
                // 删除指定的笔迹
                const currentElements = app.scene.getNonDeletedElements();
                // 查找演示期间添加的 freedraw 元素
                const freedrawElements = currentElements.filter((el) => el.type === 'freedraw' && !originalElementIdsRef.current.has(el.id));
                if (freedrawElements.length > 0) {
                    // 删除最后一个 freedraw 元素
                    const elementToRemove = freedrawElements[freedrawElements.length - 1];
                    const elementsToKeep = currentElements.filter((el) => el.id !== elementToRemove.id);
                    app.scene.replaceAllElements(elementsToKeep);
                }
            } else if (type === 'clear' && frameId) {
                // 清除所有演示笔迹
                const originalIds = originalElementIdsRef.current;
                const currentElements = app.scene.getNonDeletedElements();
                const elementsToKeep = currentElements.filter(
                    (el) => originalIds.has(el.id) || el.type !== "freedraw"
                );
                if (elementsToKeep.length !== currentElements.length) {
                    app.scene.replaceAllElements(elementsToKeep);
                }
            } else if (type === 'navigate') {
                // 处理翻页命令 (使用 refs 获取最新值)，支持动画步骤
                const idx = currentIndexRef.current;
                const len = framesLengthRef.current;
                const currentStep = presentationStepRef.current;
                const currentFrameNav = framesRef.current[idx];
                const maxSteps = currentFrameNav ? getMaxStepsForFrame(currentFrameNav) : 0;

                if (direction === 'next') {
                    // 先播放动画步骤，再切换幻灯片
                    if (currentStep < maxSteps) {
                        setAppState({
                            presentationStep: currentStep + 1,
                            animationProgress: 0
                        } as any);
                    } else if (idx < len - 1) {
                        setCurrentIndex(idx + 1);
                        setAppState({
                            presentationStep: 0,
                            animationProgress: 0
                        } as any);
                    }
                } else if (direction === 'prev') {
                    // 先回退动画步骤，再切换幻灯片
                    if (currentStep > 0) {
                        setAppState({ presentationStep: currentStep - 1 });
                    } else if (idx > 0) {
                        // 返回上一页时，显示全部内容（设置 step 为 maxSteps）
                        const prevFrame = framesRef.current[idx - 1];
                        const prevMaxSteps = prevFrame ? getMaxStepsForFrame(prevFrame) : 0;
                        setCurrentIndex(idx - 1);
                        setAppState({ presentationStep: prevMaxSteps });
                    }
                }
            }
        };

        return () => {
            // 清理函数：只在组件卸载时关闭
            if (presenterChannelRef.current) {
                presenterChannelRef.current.close();
                presenterChannelRef.current = null;
            }
        };
    }, [appState.presentationMode, app]);

    if (!appState.presentationMode) return null;

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
                            animationProgress: 0
                        } as any);
                    } else if (currentIndex < frames.length - 1) {
                        setCurrentIndex(currentIndex + 1);
                        setAppState({
                            presentationStep: 0,
                            animationProgress: 0
                        } as any);
                    }
                }}>
                    {ArrowRightIcon}
                </div>
                <div className="Presentation-controls__close" onClick={() => setAppState({ presentationMode: false })}>
                    {ExitPresentationIcon}
                </div>
            </div>
        </>
    );
};

export default Presentation;
