import React, { useEffect, useState, useRef } from "react";
import "./Presentation.scss";
import { useApp, useExcalidrawAppState, useExcalidrawElements, useExcalidrawSetAppState } from "../App";
import { ArrowRightIcon, CloseIcon, pencilIcon, EraserIcon, ClearCanvasIcon, HighlighterIcon, ExitPresentationIcon } from "../icons";
import { KEYS } from "@excalidraw/common";
import { ExcalidrawFrameLikeElement } from "@excalidraw/element/types";
import { zoomToFitBounds } from "../../actions/actionCanvas";


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
    const [currentHighlighterWidth, setCurrentHighlighterWidth] = useState(4);
    const [currentHighlighterOpacity, setCurrentHighlighterOpacity] = useState(50);

    // Store original settings to restore on exit
    const originalFrameRenderingRef = useRef(appState.frameRendering);

    // Track element IDs that existed before presentation mode started
    const originalElementIdsRef = useRef<Set<string>>(new Set());
    const presentationActiveRef = useRef(false);

    // Save original element IDs when presentation mode starts
    useEffect(() => {
        if (appState.presentationMode) {
            originalElementIdsRef.current = new Set(elements.map(el => el.id));
        }
    }, [appState.presentationMode]);

    useEffect(() => {
        if (appState.presentationMode && !presentationActiveRef.current) {
            presentationActiveRef.current = true;
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
                },
            }),
        );
    }, [currentIndex, frames, appState.presentationMode]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === KEYS.ARROW_RIGHT || event.key === KEYS.SPACE) {
                if (currentIndex < frames.length - 1) {
                    setCurrentIndex(currentIndex + 1);
                }
            } else if (event.key === KEYS.ARROW_LEFT) {
                if (currentIndex > 0) {
                    setCurrentIndex(currentIndex - 1);
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
    }, [currentIndex, frames, setAppState, showPenColors, showHighlighterColors]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setAppState({ presentationMode: false });
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
            setAppState({
                frameRendering: originalFrameRenderingRef.current,
            });
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
                    className="Presentation-controls__tool Presentation-controls__tool--danger"
                    onClick={handleClearAllDrawings}
                    title="清除所有笔迹"
                >
                    {ClearCanvasIcon}
                </div>

                <div className="Presentation-controls__separator" />

                {/* Navigation controls */}
                <div className="Presentation-controls__prev" onClick={() => currentIndex > 0 && setCurrentIndex(currentIndex - 1)}>
                    <div style={{ transform: "rotate(180deg)" }}>
                        {ArrowRightIcon}
                    </div>
                </div>
                <div className="Presentation-controls__info">
                    {currentIndex + 1} / {frames.length}
                </div>
                <div className="Presentation-controls__next" onClick={() => currentIndex < frames.length - 1 && setCurrentIndex(currentIndex + 1)}>
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
