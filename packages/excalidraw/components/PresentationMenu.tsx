import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useApp, useExcalidrawElements, useExcalidrawSetAppState } from "./App";
import { isFrameLikeElement } from "@excalidraw/element";
import { exportToCanvas } from "../scene/export";
import { PlayIcon, save } from "./icons";
import "./PresentationMenu.scss";

import type { ExcalidrawFrameLikeElement, ExcalidrawElement } from "@excalidraw/element/types";

interface SlideItem {
    id: string;
    name: string;
    thumbnail: string | null;
    element: ExcalidrawFrameLikeElement;
}

export const PresentationMenu: React.FC = () => {
    const app = useApp();
    const elements = useExcalidrawElements();
    const setAppState = useExcalidrawSetAppState();
    const slideNotes = useMemo(() => {
        const notes = (app.state as any).slideNotes;
        return notes && typeof notes === "object" ? notes as Record<string, string> : {};
    }, [app.state]);

    const [slides, setSlides] = useState<SlideItem[]>([]);
    const [slideOrder, setSlideOrder] = useState<string[]>(() => {
        const order = (app.state as any).slideOrder as string[] | undefined;
        return Array.isArray(order) ? order.filter((id) => typeof id === "string") : [];
    });
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const thumbnailCache = useRef<Map<string, string>>(new Map());
    const initialSlideOrderRef = useRef<string[]>(slideOrder);

    // Get all frame elements
    const frameElements = useMemo(() => {
        return elements.filter((el): el is ExcalidrawFrameLikeElement =>
            isFrameLikeElement(el) && !el.isDeleted
        );
    }, [elements]);

    // Initialize slide order when frames change
    useEffect(() => {
        const frameIds = frameElements.map(f => f.id);

        // Keep existing order for frames that still exist, add new ones at end
        setSlideOrder(prevOrder => {
            const existingOrder = prevOrder.filter(id => frameIds.includes(id));
            const newFrames = frameIds.filter(id => !prevOrder.includes(id));

            // Sort new frames by Y position
            const sortedNewFrames = newFrames.sort((a, b) => {
                const frameA = frameElements.find(f => f.id === a);
                const frameB = frameElements.find(f => f.id === b);
                return (frameA?.y ?? 0) - (frameB?.y ?? 0);
            });

            return [...existingOrder, ...sortedNewFrames];
        });
    }, [frameElements]);

    // Persist slide order into appState so host apps can store it
    useEffect(() => {
        setAppState((prevAppState: any) => ({
            ...prevAppState,
            slideOrder,
        }));
    }, [slideOrder, setAppState]);

    // Track unsaved changes by comparing with initial order
    useEffect(() => {
        const initialOrder = initialSlideOrderRef.current;
        const hasChanges = slideOrder.length !== initialOrder.length ||
            slideOrder.some((id, index) => id !== initialOrder[index]);
        setHasUnsavedChanges(hasChanges);
    }, [slideOrder]);

    // Handle save button click - dispatch custom event for host app to handle
    const handleSaveSlideOrder = useCallback(() => {
        setSaving(true);
        // Dispatch custom event that host app (teaching-system/web) can listen to
        const event = new CustomEvent('excalidraw:saveSlideOrder', {
            detail: { slideOrder },
            bubbles: true,
        });
        document.dispatchEvent(event);
        // Reset state after a short delay (host app should handle actual saving)
        setTimeout(() => {
            setSaving(false);
            initialSlideOrderRef.current = slideOrder;
            setHasUnsavedChanges(false);
        }, 500);
    }, [slideOrder]);

    // Generate thumbnails for frames
    useEffect(() => {
        const generateThumbnails = async () => {
            const newSlides: SlideItem[] = [];

            for (const frame of frameElements) {
                let thumbnail = thumbnailCache.current.get(frame.id) || null;

                if (!thumbnail) {
                    try {
                        // Get elements inside this frame
                        const elementsInFrame = elements.filter(
                            el => el.frameId === frame.id && !el.isDeleted
                        );

                        // exportToCanvas signature: (elements, appState, files, options, createCanvas?, loadFonts?)
                        const canvas = await exportToCanvas(
                            [frame, ...elementsInFrame] as any,
                            {
                                ...app.state,
                                exportScale: 1,
                                exportWithDarkMode: false,
                            } as any,
                            app.files,
                            {
                                exportBackground: true,
                                viewBackgroundColor: "#ffffff",
                                exportingFrame: frame,
                            }
                        );

                        thumbnail = canvas.toDataURL("image/png", 0.7);
                        thumbnailCache.current.set(frame.id, thumbnail);
                    } catch (error) {
                        console.error("Failed to generate thumbnail:", error);
                    }
                }

                newSlides.push({
                    id: frame.id,
                    name: frame.name || `幻灯片 ${newSlides.length + 1}`,
                    thumbnail,
                    element: frame,
                });
            }

            setSlides(newSlides);
        };

        generateThumbnails();
    }, [frameElements, elements, app.state, app.files]);

    // Get ordered slides
    const orderedSlides = useMemo(() => {
        return slideOrder
            .map(id => slides.find(s => s.id === id))
            .filter((s): s is SlideItem => s != null);
    }, [slides, slideOrder]);

    // Drag and drop handlers
    const handleDragStart = useCallback((e: React.DragEvent, slideId: string) => {
        setDraggedId(slideId);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", slideId);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, slideId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedId !== slideId) {
            setDragOverId(slideId);
        }
    }, [draggedId]);

    const handleDragLeave = useCallback(() => {
        setDragOverId(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const draggedSlideId = e.dataTransfer.getData("text/plain");

        if (draggedSlideId && draggedSlideId !== targetId) {
            setSlideOrder(prevOrder => {
                const newOrder = [...prevOrder];
                const draggedIndex = newOrder.indexOf(draggedSlideId);
                const targetIndex = newOrder.indexOf(targetId);

                if (draggedIndex !== -1 && targetIndex !== -1) {
                    newOrder.splice(draggedIndex, 1);
                    newOrder.splice(targetIndex, 0, draggedSlideId);
                }

                return newOrder;
            });
        }

        setDraggedId(null);
        setDragOverId(null);
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedId(null);
        setDragOverId(null);
    }, []);

    const handleEditNote = useCallback((slideId: string) => {
        const event = new CustomEvent("excalidraw:editSlideNote", {
            detail: {
                frameId: slideId,
                note: slideNotes?.[slideId] || "",
            },
            bubbles: true,
        });
        document.dispatchEvent(event);
    }, [slideNotes]);

    // Start presentation
    const startPresentation = useCallback(() => {
        if (orderedSlides.length === 0) return;

        // Store the custom order in appState or trigger presentation with the order
        if (app.excalidrawContainerRef.current) {
            app.excalidrawContainerRef.current
                .requestFullscreen()
                .catch((e) => console.error(e));
        }

        // Pass the ordered frame IDs to presentation mode
        setAppState({
            presentationMode: true,
            openSidebar: null,
            // Store custom slide order
            slideOrder: slideOrder,
        } as any);
    }, [orderedSlides, slideOrder, setAppState, app.excalidrawContainerRef]);

    // Click on slide to scroll to it
    const handleSlideClick = useCallback((slide: SlideItem) => {
        app.scrollToContent(slide.element, {
            fitToViewport: true,
            viewportZoomFactor: 0.9,
            animate: true,
        });
    }, [app]);

    if (frameElements.length === 0) {
        return (
            <div className="PresentationMenu">
                <div className="PresentationMenu__empty">
                    <p>画布中没有幻灯片</p>
                    <p className="PresentationMenu__empty-hint">
                        使用 Frame 工具创建幻灯片
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="PresentationMenu">
            {/* Header with hint and save button */}
            <div className="PresentationMenu__header">
                <span className="PresentationMenu__hint">
                    拖拽幻灯片可以修改播放顺序
                </span>
                <button
                    className={`PresentationMenu__save-btn ${hasUnsavedChanges ? 'has-changes' : ''}`}
                    onClick={handleSaveSlideOrder}
                    disabled={saving || !hasUnsavedChanges}
                    title={hasUnsavedChanges ? '保存顺序' : '顺序未修改'}
                >
                    <span className="PresentationMenu__save-icon">{save}</span>
                    <span>{saving ? '保存中...' : '保存'}</span>
                </button>
            </div>

            <div className="PresentationMenu__list">
                {orderedSlides.map((slide, index) => (
                    <div
                        key={slide.id}
                        className={`PresentationMenu__slide ${draggedId === slide.id ? "dragging" : ""
                            } ${dragOverId === slide.id ? "drag-over" : ""}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, slide.id)}
                        onDragOver={(e) => handleDragOver(e, slide.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, slide.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleSlideClick(slide)}
                        title={slide.name}
                    >
                        <div className="PresentationMenu__slide-thumbnail">
                            {slide.thumbnail ? (
                                <img src={slide.thumbnail} alt={slide.name} />
                            ) : (
                                <div className="PresentationMenu__slide-placeholder" />
                            )}
                        </div>
                        <div className="PresentationMenu__slide-footer">
                            <div className="PresentationMenu__slide-name">{slide.name}</div>
                            <button
                                className="PresentationMenu__note-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditNote(slide.id);
                                }}
                                title={slideNotes?.[slide.id] ? "查看/编辑注释" : "添加注释"}
                            >
                                <span
                                    className={slideNotes?.[slide.id] ? "has-note-dot" : "no-note-dot"}
                                    aria-hidden
                                />
                                注释
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="PresentationMenu__footer">
                <div className="PresentationMenu__count">
                    {orderedSlides.length} 张
                </div>
                <button
                    className="PresentationMenu__start-btn"
                    onClick={startPresentation}
                    disabled={orderedSlides.length === 0}
                >
                    <span className="PresentationMenu__start-icon">{PlayIcon}</span>
                    <span>开始播放</span>
                </button>
            </div>
        </div>
    );
};
