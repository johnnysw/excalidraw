import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useApp, useExcalidrawElements, useExcalidrawSetAppState } from "./App";
import { isFrameLikeElement } from "@excalidraw/element";
import { exportToCanvas } from "../scene/export";
import { PlayIcon, PresenterModeIcon, Presentation05Icon, Comment01Icon, save } from "./icons";
import "./PresentationMenu.scss";

import type { ExcalidrawFrameLikeElement, ExcalidrawElement } from "@excalidraw/element/types";

type ThumbnailCacheEntry = {
    thumbnail: string;
    key: string;
};

const SLIDE_THUMBNAIL_CACHE = new Map<string, ThumbnailCacheEntry>();
const SLIDE_THUMBNAIL_INFLIGHT = new Map<string, Promise<string | null>>();

const THUMBNAIL_CACHE_VERSION = "v2";
const THUMBNAIL_BASE_SCALE = 0.35;
const THUMBNAIL_MAX_SCALE = 0.6;

const getEffectiveThumbnailScale = () => {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return Math.min(THUMBNAIL_MAX_SCALE, THUMBNAIL_BASE_SCALE * dpr);
};

interface SlideItem {
    id: string;
    name: string;
    thumbnail: string | null;
    element: ExcalidrawFrameLikeElement;
}

export const PresentationMenu: React.FC = () => {
    // 用于延迟渲染完整内容，确保 Tab 切换动画先完成
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // 使用 requestAnimationFrame 延迟到下一帧再渲染完整内容
        const rafId = requestAnimationFrame(() => {
            setIsReady(true);
        });
        return () => cancelAnimationFrame(rafId);
    }, []);

    // 首次挂载时先显示 loading，让 Tab 切换立即响应
    if (!isReady) {
        return (
            <div className="PresentationMenu">
                <div className="PresentationMenu__initializing">
                    <span className="PresentationMenu__loading-spinner" />
                    <span>加载中...</span>
                </div>
            </div>
        );
    }

    return <PresentationMenuContent />;
};

const PresentationMenuContent: React.FC = () => {
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
    const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
    const initialSlideOrderRef = useRef<string[]>(slideOrder);
    const slideRefs = useRef<Map<string, HTMLDivElement>>(new Map());

    const appStateRef = useRef(app.state);
    const filesRef = useRef(app.files);
    useEffect(() => {
        appStateRef.current = app.state;
        filesRef.current = app.files;
    }, [app.state, app.files]);

    const generationRef = useRef(0);
    const queueHighRef = useRef<string[]>([]);
    const queueLowRef = useRef<string[]>([]);
    const queuedRef = useRef<Set<string>>(new Set());
    const processingRef = useRef(false);

    // Get all frame elements
    const frameElements = useMemo(() => {
        return elements.filter((el): el is ExcalidrawFrameLikeElement =>
            isFrameLikeElement(el) && !el.isDeleted
        );
    }, [elements]);

    const elementsByFrameId = useMemo(() => {
        const map = new Map<string, ExcalidrawElement[]>();
        for (const el of elements) {
            if (el.isDeleted || !el.frameId) {
                continue;
            }
            const arr = map.get(el.frameId);
            if (arr) {
                arr.push(el);
            } else {
                map.set(el.frameId, [el]);
            }
        }
        return map;
    }, [elements]);

    // 监听选中元素变化，自动高亮对应的幻灯片
    useEffect(() => {
        const selectedIds = Object.keys(app.state.selectedElementIds || {});
        if (selectedIds.length === 0) {
            setActiveSlideId(null);
            return;
        }

        // 找到第一个选中元素所属的 Frame
        for (const id of selectedIds) {
            const el = elements.find(e => e.id === id);
            if (!el) continue;

            // 如果选中的是 Frame 本身
            if (isFrameLikeElement(el)) {
                setActiveSlideId(el.id);
                return;
            }

            // 如果选中的元素有 frameId
            if (el.frameId) {
                setActiveSlideId(el.frameId);
                return;
            }
        }

        setActiveSlideId(null);
    }, [app.state.selectedElementIds, elements]);

    // 当 activeSlideId 变化时，自动滚动到对应的幻灯片卡片
    useEffect(() => {
        if (activeSlideId) {
            const slideEl = slideRefs.current.get(activeSlideId);
            if (slideEl) {
                slideEl.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
            }
        }
    }, [activeSlideId]);

    // 用于追踪是否是内部更新，避免循环
    const isInternalUpdateRef = useRef(false);
    const lastExternalOrderRef = useRef<string[] | null>(null);

    // 监听外部 slideOrder 变化（如画布上的 SlideOrderButton 修改）
    useEffect(() => {
        // 如果是内部更新触发的，跳过
        if (isInternalUpdateRef.current) {
            isInternalUpdateRef.current = false;
            return;
        }

        const externalOrder = (app.state as any).slideOrder as string[] | undefined;
        if (!Array.isArray(externalOrder)) {
            return;
        }

        // 比较外部顺序与上次外部顺序，避免重复处理
        const lastExternal = lastExternalOrderRef.current;
        const isSameAsLast = lastExternal !== null &&
            externalOrder.length === lastExternal.length &&
            externalOrder.every((id, index) => id === lastExternal[index]);
        if (isSameAsLast) {
            return;
        }

        // 比较外部顺序与本地顺序，如果不同则同步
        const isSame = externalOrder.length === slideOrder.length &&
            externalOrder.every((id, index) => id === slideOrder[index]);
        if (!isSame) {
            lastExternalOrderRef.current = externalOrder;
            setSlideOrder(externalOrder.filter((id) => typeof id === "string"));
            // 同步更新初始顺序引用，避免显示为未保存
            initialSlideOrderRef.current = externalOrder.filter((id) => typeof id === "string");
        }
    }, [(app.state as any).slideOrder]);

    // Initialize slide order when frames change
    useEffect(() => {
        const frameIds = frameElements.map(f => f.id);

        // Keep existing order for frames that still exist, add new ones at end
        setSlideOrder(prevOrder => {
            const existingOrder = prevOrder.filter(id => frameIds.includes(id));
            const newFrames = frameIds.filter(id => !prevOrder.includes(id));

            // 如果没有新 frame 且没有需要移除的，不更新
            if (newFrames.length === 0 && existingOrder.length === prevOrder.length) {
                return prevOrder;
            }

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
        // 标记为内部更新，避免触发外部监听 effect 的循环
        isInternalUpdateRef.current = true;
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

    const getThumbnailKey = useCallback(
        (frame: ExcalidrawFrameLikeElement) => {
            const children = elementsByFrameId.get(frame.id) || [];
            let maxUpdated = 0;
            for (const el of children) {
                if (el.updated > maxUpdated) {
                    maxUpdated = el.updated;
                }
            }
            return `${THUMBNAIL_CACHE_VERSION}:${frame.updated}:${maxUpdated}:${getEffectiveThumbnailScale()}`;
        },
        [elementsByFrameId],
    );

    const ensureThumbnailForFrame = useCallback(
        async (frame: ExcalidrawFrameLikeElement) => {
            const key = getThumbnailKey(frame);
            const cached = SLIDE_THUMBNAIL_CACHE.get(frame.id);
            if (cached?.key === key) {
                return cached.thumbnail;
            }

            const inflight = SLIDE_THUMBNAIL_INFLIGHT.get(frame.id);
            if (inflight) {
                return inflight;
            }

            const promise = (async () => {
                try {
                    const elementsInFrame = (elementsByFrameId.get(frame.id) || []).filter(
                        (el) => !el.isDeleted,
                    );
                    const canvas = await exportToCanvas(
                        [frame, ...elementsInFrame] as any,
                        {
                            ...appStateRef.current,
                            exportScale: 1,
                            exportWithDarkMode: false,
                        } as any,
                        filesRef.current,
                        {
                            exportBackground: true,
                            viewBackgroundColor: "#ffffff",
                            exportingFrame: frame,
                        },
                        (width, height) => {
                            const canvas = document.createElement("canvas");
                            const scale = getEffectiveThumbnailScale();
                            canvas.width = Math.max(1, Math.floor(width * scale));
                            canvas.height = Math.max(1, Math.floor(height * scale));
                            return { canvas, scale };
                        },
                    );

                    const thumbnail = canvas.toDataURL("image/png");
                    SLIDE_THUMBNAIL_CACHE.set(frame.id, { thumbnail, key });
                    return thumbnail;
                } catch (error) {
                    console.error("Failed to generate thumbnail:", error);
                    return null;
                } finally {
                    SLIDE_THUMBNAIL_INFLIGHT.delete(frame.id);
                }
            })();

            SLIDE_THUMBNAIL_INFLIGHT.set(frame.id, promise);
            return promise;
        },
        [elementsByFrameId, getThumbnailKey],
    );

    const enqueueFrames = useCallback((frameIds: string[], priority: "high" | "low") => {
        for (const id of frameIds) {
            if (queuedRef.current.has(id)) {
                continue;
            }
            queuedRef.current.add(id);
            if (priority === "high") {
                queueHighRef.current.push(id);
            } else {
                queueLowRef.current.push(id);
            }
        }
    }, []);

    const processQueue = useCallback(
        (generationId: number) => {
            if (processingRef.current) {
                return;
            }
            processingRef.current = true;

            const run = async () => {
                while (generationRef.current === generationId) {
                    const nextId =
                        queueHighRef.current.shift() || queueLowRef.current.shift() || null;
                    if (!nextId) {
                        break;
                    }

                    queuedRef.current.delete(nextId);
                    const frame = frameElements.find((f) => f.id === nextId);
                    if (!frame) {
                        continue;
                    }

                    const thumbnail = await ensureThumbnailForFrame(frame);
                    if (generationRef.current !== generationId) {
                        break;
                    }
                    if (thumbnail) {
                        setSlides((prev) =>
                            prev.map((s) => (s.id === nextId ? { ...s, thumbnail } : s)),
                        );
                    }

                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }
                processingRef.current = false;

                if (
                    generationRef.current === generationId &&
                    (queueHighRef.current.length || queueLowRef.current.length)
                ) {
                    processQueue(generationId);
                }
            };

            if (typeof (window as any).requestIdleCallback === "function") {
                (window as any).requestIdleCallback(() => run(), { timeout: 300 });
            } else {
                setTimeout(() => run(), 0);
            }
        },
        [ensureThumbnailForFrame, frameElements],
    );

    // Generate thumbnails for frames
    useEffect(() => {
        generationRef.current += 1;
        const generationId = generationRef.current;

        queueHighRef.current = [];
        queueLowRef.current = [];
        queuedRef.current.clear();
        processingRef.current = false;

        const initialSlides: SlideItem[] = frameElements.map((frame, index) => {
            const key = getThumbnailKey(frame);
            const cached = SLIDE_THUMBNAIL_CACHE.get(frame.id);
            const thumbnail = cached?.key === key ? cached.thumbnail : null;
            return {
                id: frame.id,
                name: frame.name || `幻灯片 ${index + 1}`,
                thumbnail,
                element: frame,
            };
        });
        setSlides(initialSlides);

        const prefetchIds = frameElements.slice(0, 12).map((f) => f.id);
        enqueueFrames(prefetchIds, "low");
        const remainingIds = frameElements.slice(12).map((f) => f.id);
        enqueueFrames(remainingIds, "low");
        if (activeSlideId) {
            enqueueFrames([activeSlideId], "high");
        }

        processQueue(generationId);

        return () => {
            generationRef.current += 1;
        };
    }, [frameElements, getThumbnailKey, enqueueFrames, processQueue, activeSlideId]);

    useEffect(() => {
        if (!activeSlideId) {
            return;
        }
        enqueueFrames([activeSlideId], "high");
        processQueue(generationRef.current);
    }, [activeSlideId, enqueueFrames, processQueue]);

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

        // Pass the ordered frame IDs to presentation mode, always start from first slide
        // 保存当前的侧边栏状态，退出演示模式时恢复
        setAppState((state) => ({
            ...state,
            presentationMode: true,
            _savedOpenSidebar: state.openSidebar, // 保存当前侧边栏状态
            openSidebar: null,
            // Store custom slide order
            slideOrder: slideOrder,
            presentationSlideIndex: 0, // 始终从第1张幻灯片开始
        } as any));
    }, [orderedSlides, slideOrder, setAppState, app.excalidrawContainerRef]);

    const openPresenterViewFromSlide = useCallback((slideId: string) => {
        const slideIndex = orderedSlides.findIndex(s => s.id === slideId);
        if (slideIndex === -1) return;

        const nextFrameId = orderedSlides[slideIndex + 1]?.id ?? null;
        const total = orderedSlides.length;

        let presenterWindow: Window | null = null;
        presenterWindow = window.open(
            "",
            "presenter-view",
            "width=520,height=740",
        );

        if (presenterWindow) {
            try {
                presenterWindow.blur();
                window.focus();
            } catch {
            }
        }

        const event = new CustomEvent("excalidraw:startPresentation", {
            detail: {
                mode: "presenter",
                presenterWindow,
                frameId: slideId,
                nextFrameId,
                index: slideIndex,
                total,
            },
            bubbles: true,
        });
        document.dispatchEvent(event);
    }, [orderedSlides]);

    // Start presentation from a specific slide
    const startFromSlide = useCallback((slideId: string) => {
        const slideIndex = orderedSlides.findIndex(s => s.id === slideId);
        if (slideIndex === -1) return;

        // Store the custom order in appState or trigger presentation with the order
        if (app.excalidrawContainerRef.current) {
            app.excalidrawContainerRef.current
                .requestFullscreen()
                .catch((e) => console.error(e));
        }

        // Pass the ordered frame IDs to presentation mode, starting from the selected slide
        // 保存当前的侧边栏状态，退出演示模式时恢复
        setAppState((state) => ({
            ...state,
            presentationMode: true,
            _savedOpenSidebar: state.openSidebar, // 保存当前侧边栏状态
            openSidebar: null,
            slideOrder: slideOrder,
            presentationSlideIndex: slideIndex,
        } as any));
    }, [orderedSlides, slideOrder, setAppState, app.excalidrawContainerRef]);

    // Click on slide to scroll to it and select the frame
    const handleSlideClick = useCallback((slide: SlideItem) => {
        // 选中对应的 Frame，这会触发 activeSlideId 自动更新
        setAppState({
            selectedElementIds: { [slide.id]: true },
        } as any);

        app.scrollToContent(slide.element, {
            fitToViewport: true,
            viewportZoomFactor: 0.9,
            animate: true,
        });
    }, [app, setAppState]);

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
                        ref={(el) => {
                            if (el) {
                                slideRefs.current.set(slide.id, el);
                            } else {
                                slideRefs.current.delete(slide.id);
                            }
                        }}
                        className={`PresentationMenu__slide ${draggedId === slide.id ? "dragging" : ""
                            } ${dragOverId === slide.id ? "drag-over" : ""} ${activeSlideId === slide.id ? "active" : ""}`}
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
                            <span className="PresentationMenu__slide-order">{index + 1}</span>
                            {slide.thumbnail ? (
                                <img src={slide.thumbnail} alt={slide.name} />
                            ) : (
                                <div className="PresentationMenu__slide-placeholder" />
                            )}
                        </div>
                        <div className="PresentationMenu__slide-footer">
                            <div className="PresentationMenu__slide-name">{slide.name}</div>
                            <div className="PresentationMenu__slide-actions">
                                <button
                                    className="PresentationMenu__play-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        startFromSlide(slide.id);
                                    }}
                                    title="从此播放"
                                >
                                    {Presentation05Icon}
                                </button>
                                <button
                                    className="PresentationMenu__play-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openPresenterViewFromSlide(slide.id);
                                    }}
                                    title="演讲者视图"
                                >
                                    {PresenterModeIcon}
                                </button>
                                <button
                                    className="PresentationMenu__note-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditNote(slide.id);
                                    }}
                                    title={slideNotes?.[slide.id] ? "查看/编辑注释" : "添加注释"}
                                >
                                    <span className="PresentationMenu__note-icon" aria-hidden>
                                        {Comment01Icon}
                                        <span
                                            className={slideNotes?.[slide.id] ? "has-note-dot" : "no-note-dot"}
                                            aria-hidden
                                        />
                                    </span>
                                </button>
                            </div>
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

PresentationMenuContent.displayName = "PresentationMenuContent";
