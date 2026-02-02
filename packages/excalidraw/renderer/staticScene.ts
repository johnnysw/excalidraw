import { FRAME_STYLE, ANIMATION_SIDEBAR_TAB, throttleRAF } from "@excalidraw/common";
import { isElementLink } from "@excalidraw/element";
import { createPlaceholderEmbeddableLabel } from "@excalidraw/element";
import { getBoundTextElement } from "@excalidraw/element";
import {
  isEmbeddableElement,
  isIframeLikeElement,
  isTextElement,
} from "@excalidraw/element";
import {
  elementOverlapsWithFrame,
  getTargetFrame,
  shouldApplyFrameClip,
} from "@excalidraw/element";

import { renderElement } from "@excalidraw/element";

import { getElementAbsoluteCoords } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawFrameLikeElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

import {
  EXTERNAL_LINK_IMG,
  ELEMENT_LINK_IMG,
  getLinkHandleFromCoords,
} from "../components/hyperlink/helpers";

import { bootstrapCanvas, getNormalizedCanvasDimensions } from "./helpers";

import type {
  StaticCanvasRenderConfig,
  StaticSceneRenderConfig,
} from "../scene/types";
import type { StaticCanvasAppState, Zoom } from "../types";

const GridLineColor = {
  Bold: "#dddddd",
  Regular: "#e5e5e5",
} as const;

const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  width: number,
  height: number,
) => {
  const offsetX = (scrollX % gridSize) - gridSize;
  const offsetY = (scrollY % gridSize) - gridSize;

  const actualGridSize = gridSize * zoom.value;

  const spaceWidth = 1 / zoom.value;

  context.save();

  // Offset rendering by 0.5 to ensure that 1px wide lines are crisp.
  // We only do this when zoomed to 100% because otherwise the offset is
  // fractional, and also visibly offsets the elements.
  // We also do this per-axis, as each axis may already be offset by 0.5.
  if (zoom.value === 1) {
    context.translate(offsetX % 1 ? 0 : 0.5, offsetY % 1 ? 0 : 0.5);
  }

  // vertical lines
  for (let x = offsetX; x < offsetX + width + gridSize * 2; x += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(x - scrollX) % (gridStep * gridSize) === 0;
    // don't render regular lines when zoomed out and they're barely visible
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold ? GridLineColor.Bold : GridLineColor.Regular;
    context.moveTo(x, offsetY - gridSize);
    context.lineTo(x, Math.ceil(offsetY + height + gridSize * 2));
    context.stroke();
  }

  for (let y = offsetY; y < offsetY + height + gridSize * 2; y += gridSize) {
    const isBold =
      gridStep > 1 && Math.round(y - scrollY) % (gridStep * gridSize) === 0;
    if (!isBold && actualGridSize < 10) {
      continue;
    }

    const lineWidth = Math.min(1 / zoom.value, isBold ? 4 : 1);
    context.lineWidth = lineWidth;
    const lineDash = [lineWidth * 3, spaceWidth + (lineWidth + spaceWidth)];

    context.beginPath();
    context.setLineDash(isBold ? [] : lineDash);
    context.strokeStyle = isBold ? GridLineColor.Bold : GridLineColor.Regular;
    context.moveTo(offsetX - gridSize, y);
    context.lineTo(Math.ceil(offsetX + width + gridSize * 2), y);
    context.stroke();
  }
  context.restore();
};

export const frameClip = (
  frame: ExcalidrawFrameLikeElement,
  context: CanvasRenderingContext2D,
  renderConfig: StaticCanvasRenderConfig,
  appState: StaticCanvasAppState,
) => {
  context.translate(frame.x + appState.scrollX, frame.y + appState.scrollY);
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(
      0,
      0,
      frame.width,
      frame.height,
      FRAME_STYLE.radius / appState.zoom.value,
    );
  } else {
    context.rect(0, 0, frame.width, frame.height);
  }
  context.clip();
  context.translate(
    -(frame.x + appState.scrollX),
    -(frame.y + appState.scrollY),
  );
};

type LinkIconCanvas = HTMLCanvasElement & { zoom: number };

const linkIconCanvasCache: {
  regularLink: LinkIconCanvas | null;
  elementLink: LinkIconCanvas | null;
} = {
  regularLink: null,
  elementLink: null,
};

const renderLinkIcon = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  if (element.link && !appState.selectedElementIds[element.id]) {
    const [x1, y1, x2, y2] = getElementAbsoluteCoords(element, elementsMap);
    const [x, y, width, height] = getLinkHandleFromCoords(
      [x1, y1, x2, y2],
      element.angle,
      appState,
    );
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.save();
    context.translate(appState.scrollX + centerX, appState.scrollY + centerY);
    context.rotate(element.angle);

    const canvasKey = isElementLink(element.link)
      ? "elementLink"
      : "regularLink";

    let linkCanvas = linkIconCanvasCache[canvasKey];

    if (!linkCanvas || linkCanvas.zoom !== appState.zoom.value) {
      linkCanvas = Object.assign(document.createElement("canvas"), {
        zoom: appState.zoom.value,
      });
      linkCanvas.width = width * window.devicePixelRatio * appState.zoom.value;
      linkCanvas.height =
        height * window.devicePixelRatio * appState.zoom.value;
      linkIconCanvasCache[canvasKey] = linkCanvas;

      const linkCanvasCacheContext = linkCanvas.getContext("2d")!;
      linkCanvasCacheContext.scale(
        window.devicePixelRatio * appState.zoom.value,
        window.devicePixelRatio * appState.zoom.value,
      );
      linkCanvasCacheContext.fillStyle = appState.viewBackgroundColor || "#fff";
      linkCanvasCacheContext.fillRect(0, 0, width, height);

      if (canvasKey === "elementLink") {
        linkCanvasCacheContext.drawImage(ELEMENT_LINK_IMG, 0, 0, width, height);
      } else {
        linkCanvasCacheContext.drawImage(
          EXTERNAL_LINK_IMG,
          0,
          0,
          width,
          height,
        );
      }

      linkCanvasCacheContext.restore();
    }
    context.drawImage(linkCanvas, x - centerX, y - centerY, width, height);
    context.restore();
  }
};

/**
 * 渲染动画编号标记
 * 在有动画的元素右上角显示一个带颜色的编号圆点
 */
const renderAnimationBadge = (
  element: NonDeletedExcalidrawElement,
  context: CanvasRenderingContext2D,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
) => {
  const isPlayingAnimation = (appState as any).isPlayingAnimation;
  const openSidebar = (appState as any).openSidebar;
  const isSlidesTabActive =
    openSidebar?.tab === ANIMATION_SIDEBAR_TAB;
  if (appState.presentationMode || isPlayingAnimation || !isSlidesTabActive) {
    return;
  }

  let activeFrameId = appState.frameToHighlight?.id;

  const selectedIds = Object.keys(appState.selectedElementIds || {});

  if (!activeFrameId && selectedIds.length) {
    // 优先：如果选中了 frame / magicframe 本身，则以该元素作为激活 frame
    for (const id of selectedIds) {
      const selectedElement = elementsMap.get(id as any);
      if (!selectedElement) {
        continue;
      }
      if (selectedElement.type === "frame" || selectedElement.type === "magicframe") {
        activeFrameId = selectedElement.id;
        break;
      }
    }

    // 其次：如果选中的是 frame 内的元素，则使用其 frameId 作为激活 frame
    if (!activeFrameId) {
      for (const id of selectedIds) {
        const selectedElement = elementsMap.get(id as any);
        if (!selectedElement) {
          continue;
        }
        const frameId = (selectedElement as any).frameId as string | undefined;
        if (frameId) {
          activeFrameId = frameId;
          break;
        }
      }
    }
  }

  if (!activeFrameId) {
    return;
  }

  if ((element as any).frameId !== activeFrameId) {
    return;
  }

  const animation = (element as any).animation;
  if (!animation?.stepGroup) {
    return;
  }

  const stepGroup = animation.stepGroup;
  const [x1, y1, x2] = getElementAbsoluteCoords(element, elementsMap);

  // 计算标记位置（右上角）
  const badgeSize = 18 / appState.zoom.value;
  const badgeX = appState.scrollX + x2 - badgeSize / 2;
  const badgeY = appState.scrollY + y1 - badgeSize / 2;

  context.save();

  // 根据动画类型选择颜色
  const animationType = animation.type || 'fadeIn';
  let badgeColor = '#52c41a'; // 默认绿色（fadeIn）
  if (animationType.startsWith('slideIn')) {
    badgeColor = '#1890ff'; // 蓝色（slideIn）
  }

  // 绘制圆形背景
  context.beginPath();
  context.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
  context.fillStyle = badgeColor;
  context.fill();

  // 绘制白色边框
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5 / appState.zoom.value;
  context.stroke();

  // 绘制编号文字
  context.fillStyle = '#ffffff';
  context.font = `bold ${12 / appState.zoom.value}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(stepGroup), badgeX, badgeY);

  context.restore();
};

const _renderStaticScene = ({
  canvas,
  rc,
  elementsMap,
  allElementsMap,
  visibleElements,
  scale,
  appState,
  renderConfig,
}: StaticSceneRenderConfig) => {
  if (canvas === null) {
    return;
  }

  const { renderGrid = true, isExporting } = renderConfig;

  const [normalizedWidth, normalizedHeight] = getNormalizedCanvasDimensions(
    canvas,
    scale,
  );

  const context = bootstrapCanvas({
    canvas,
    scale,
    normalizedWidth,
    normalizedHeight,
    theme: appState.theme,
    isExporting,
    viewBackgroundColor: appState.viewBackgroundColor,
  });

  // Apply zoom
  context.scale(appState.zoom.value, appState.zoom.value);

  // Grid
  if (renderGrid) {
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
    );
  }

  const groupsToBeAddedToFrame = new Set<string>();

  visibleElements.forEach((element) => {
    if (
      element.groupIds.length > 0 &&
      appState.frameToHighlight &&
      appState.selectedElementIds[element.id] &&
      (elementOverlapsWithFrame(
        element,
        appState.frameToHighlight,
        elementsMap,
      ) ||
        element.groupIds.find((groupId) => groupsToBeAddedToFrame.has(groupId)))
    ) {
      element.groupIds.forEach((groupId) =>
        groupsToBeAddedToFrame.add(groupId),
      );
    }
  });

  const inFrameGroupsMap = new Map<string, boolean>();

  // 线性插值两个十六进制颜色（仅支持 #RRGGBB），用于文本变色动画
  const interpolateColor = (from: string, to: string, t: number): string => {
    const parse = (hex: string) => {
      if (!hex || hex[0] !== "#" || hex.length !== 7) {
        return null;
      }
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        return null;
      }
      return { r, g, b };
    };

    const fromRGB = parse(from);
    const toRGB = parse(to);
    if (!fromRGB || !toRGB) {
      // 如果解析失败，直接使用目标颜色或原始颜色
      return to || from;
    }

    const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
    const r = lerp(fromRGB.r, toRGB.r);
    const g = lerp(fromRGB.g, toRGB.g);
    const b = lerp(fromRGB.b, toRGB.b);
    const toHex = (v: number) => v.toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Paint visible elements
  visibleElements
    .filter((el) => !isIframeLikeElement(el))
    .filter((element) => {
      if (
        appState.presentationMode &&
        (element as any).customData?.type === "questionTagBadge"
      ) {
        return false;
      }
      // Filter out elements whose animation step hasn't been reached yet
      // Support both presentationMode (full-screen) and isPlayingAnimation (in-editor preview)
      const isPlayingAnimation = (appState as any).isPlayingAnimation;
      const isPlayingAnimationFrameId = (appState as any).isPlayingAnimationFrameId;

      // In presentationMode, apply to all elements
      // In isPlayingAnimation mode, only apply to elements in the target frame
      const shouldApplyAnimation = appState.presentationMode ||
        (isPlayingAnimation && element.frameId === isPlayingAnimationFrameId);

      if (
        shouldApplyAnimation &&
        element.animation &&
        element.animation.stepGroup > appState.presentationStep
      ) {
        // 文本变色动画：不需要在动画前隐藏元素，始终可见
        if (element.animation.type === "textColor") {
          return true;
        }

        // Check if this element should be hidden based on animationTarget
        // If animationTarget is set and doesn't include this element, show it immediately
        const animationTarget = element.animation.animationTarget;
        if (animationTarget && animationTarget !== 'all') {
          const customData = (element as any).customData;
          const role = customData?.role as string | undefined;

          // Check if this element is NOT in the animation target
          let isInAnimationTarget = false;
          switch (animationTarget) {
            case 'text':
              isInAnimationTarget = element.type === 'text' || role === 'option' || role === 'stem';
              break;
            case 'background':
              isInAnimationTarget = role === 'text-background';
              break;
            case 'underline':
              isInAnimationTarget = role === 'text-underline';
              break;
            case 'strike':
              isInAnimationTarget = role === 'text-strike';
              break;
          }

          // If element is NOT in animation target, show it immediately (don't hide)
          if (!isInAnimationTarget) {
            return true;
          }
        }
        return false;
      }
      return true;
    })
    .forEach((element) => {
      try {
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          isTextElement(element) &&
          element.containerId &&
          elementsMap.has(element.containerId)
        ) {
          // will be rendered with the container
          return;
        }

        context.save();

        // 默认用于渲染的元素（对于文本变色动画，会在下方生成一个带有插值颜色的拷贝）
        let elementForRender: any = element;

        // Apply animation effects for elements appearing in current step
        // Support both presentationMode and isPlayingAnimation
        const isPlayingAnimation = (appState as any).isPlayingAnimation;
        const isPlayingAnimationFrameId = (appState as any).isPlayingAnimationFrameId;
        const shouldApplyAnimation = appState.presentationMode ||
          (isPlayingAnimation && element.frameId === isPlayingAnimationFrameId);

        // 文本变色动画特殊处理：在动画步骤到达之前，文字显示为黑色
        if (
          shouldApplyAnimation &&
          element.animation &&
          element.animation.type === 'textColor' &&
          isTextElement(element) &&
          element.animation.stepGroup > appState.presentationStep
        ) {
          elementForRender = {
            ...(element as any),
            strokeColor: '#000000',
          };
        }

        if (
          shouldApplyAnimation &&
          element.animation &&
          element.animation.stepGroup === appState.presentationStep
        ) {
          // Check if this element should have animation applied based on animationTarget
          const animationTarget = element.animation.animationTarget;
          const customData = (element as any).customData;
          const role = customData?.role as string | undefined;

          // Determine if animation should be applied to this specific element
          let shouldApplyToThisElement = true;
          if (animationTarget && animationTarget !== 'all') {
            switch (animationTarget) {
              case 'text':
                // Only apply to text elements (type === 'text', or role is option/stem)
                shouldApplyToThisElement = element.type === 'text' || role === 'option' || role === 'stem';
                break;
              case 'background':
                // Only apply to background elements (role === 'text-background')
                shouldApplyToThisElement = role === 'text-background';
                break;
              case 'underline':
                // Only apply to underline elements (role === 'text-underline')
                shouldApplyToThisElement = role === 'text-underline';
                break;
              case 'strike':
                // Only apply to strike elements (role === 'text-strike')
                shouldApplyToThisElement = role === 'text-strike';
                break;
            }
          }

          if (shouldApplyToThisElement) {
            const progress = appState.animationProgress ?? 1;
            const animType = element.animation.type || 'fadeIn';
            const slideOffset = 100; // pixels

            switch (animType) {
              case 'fadeIn':
                context.globalAlpha = progress;
                break;
              case 'slideInLeft':
                context.translate(-slideOffset * (1 - progress), 0);
                context.globalAlpha = progress;
                break;
              case 'slideInRight':
                context.translate(slideOffset * (1 - progress), 0);
                context.globalAlpha = progress;
                break;
              case 'slideInTop':
                context.translate(0, -slideOffset * (1 - progress));
                context.globalAlpha = progress;
                break;
              case 'slideInBottom':
                context.translate(0, slideOffset * (1 - progress));
                context.globalAlpha = progress;
                break;
              case 'textColor': {
                // 文本变色动画：不改变透明度与位置，从黑色渐变到当前文本颜色
                if (isTextElement(element)) {
                  const targetColor = (element as any).strokeColor || '#000000';
                  const strokeColor = interpolateColor('#000000', targetColor, progress);
                  elementForRender = {
                    ...(element as any),
                    strokeColor,
                  };
                }
                break;
              }
            }
          }
        }

        if (
          appState.presentationMode &&
          (elementForRender as any).type === "rectangle" &&
          (elementForRender as any).customData?.type === "question" &&
          (elementForRender as any).customData?.role === "background" &&
          typeof (elementForRender as any).strokeColor === "string"
        ) {
          const baseStroke = (elementForRender as any).strokeColor as string;
          elementForRender = {
            ...(elementForRender as any),
            strokeColor: interpolateColor(baseStroke, "#ffffff", 0.7),
            strokeStyle: "dotted",
          };
        }

        if (
          appState.presentationMode &&
          (elementForRender as any).type === "rectangle" &&
          (elementForRender as any).customData?.type === "question" &&
          (elementForRender as any).customData?.role === "shadow" &&
          typeof (elementForRender as any).backgroundColor === "string"
        ) {
          const shadowBg = (elementForRender as any).backgroundColor as string;
          elementForRender = {
            ...(elementForRender as any),
            backgroundColor: interpolateColor(shadowBg, "#ffffff", 0.7),
          };
        }

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          const frame = getTargetFrame(element, elementsMap, appState);
          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          renderElement(
            elementForRender,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        } else {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        const boundTextElement = getBoundTextElement(element, elementsMap);
        if (boundTextElement) {
          renderElement(
            boundTextElement,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );
        }

        context.restore();

        if (!isExporting) {
          renderLinkIcon(element, context, appState, elementsMap);
          renderAnimationBadge(element, context, appState, elementsMap);
        }
      } catch (error: any) {
        console.error(
          error,
          element.id,
          element.x,
          element.y,
          element.width,
          element.height,
        );
      }
    });

  // render embeddables on top
  visibleElements
    .filter((el) => isIframeLikeElement(el))
    .filter((element) => {
      if (
        appState.presentationMode &&
        (element as any).customData?.type === "questionTagBadge"
      ) {
        return false;
      }
      // Filter embeddables based on animation step
      const isPlayingAnimation = (appState as any).isPlayingAnimation;
      const isPlayingAnimationFrameId = (appState as any).isPlayingAnimationFrameId;
      const shouldApplyAnimation = appState.presentationMode ||
        (isPlayingAnimation && element.frameId === isPlayingAnimationFrameId);
      if (
        shouldApplyAnimation &&
        element.animation &&
        element.animation.stepGroup > appState.presentationStep
      ) {
        return false;
      }
      return true;
    })
    .forEach((element) => {
      try {
        const render = () => {
          renderElement(
            element,
            elementsMap,
            allElementsMap,
            rc,
            context,
            renderConfig,
            appState,
          );

          if (
            isIframeLikeElement(element) &&
            (isExporting ||
              (isEmbeddableElement(element) &&
                renderConfig.embedsValidationStatus.get(element.id) !==
                  true)) &&
            element.width &&
            element.height
          ) {
            const label = createPlaceholderEmbeddableLabel(element);
            renderElement(
              label,
              elementsMap,
              allElementsMap,
              rc,
              context,
              renderConfig,
              appState,
            );
          }
          if (!isExporting) {
            renderLinkIcon(element, context, appState, elementsMap);
            renderAnimationBadge(element, context, appState, elementsMap);
          }
        };
        // - when exporting the whole canvas, we DO NOT apply clipping
        // - when we are exporting a particular frame, apply clipping
        //   if the containing frame is not selected, apply clipping
        const frameId = element.frameId || appState.frameToHighlight?.id;

        if (
          frameId &&
          appState.frameRendering.enabled &&
          appState.frameRendering.clip
        ) {
          context.save();

          const frame = getTargetFrame(element, elementsMap, appState);

          if (
            frame &&
            shouldApplyFrameClip(
              element,
              frame,
              appState,
              elementsMap,
              inFrameGroupsMap,
            )
          ) {
            frameClip(frame, context, renderConfig, appState);
          }
          render();
          context.restore();
        } else {
          render();
        }
      } catch (error: any) {
        console.error(error);
      }
    });

  // render pending nodes for flowcharts
  renderConfig.pendingFlowchartNodes?.forEach((element) => {
    try {
      renderElement(
        element,
        elementsMap,
        allElementsMap,
        rc,
        context,
        renderConfig,
        appState,
      );
    } catch (error) {
      console.error(error);
    }
  });
};

/** throttled to animation framerate */
export const renderStaticSceneThrottled = throttleRAF(
  (config: StaticSceneRenderConfig) => {
    _renderStaticScene(config);
  },
  { trailing: true },
);

/**
 * Static scene is the non-ui canvas where we render elements.
 */
export const renderStaticScene = (
  renderConfig: StaticSceneRenderConfig,
  throttle?: boolean,
) => {
  if (throttle) {
    renderStaticSceneThrottled(renderConfig);
    return;
  }

  _renderStaticScene(renderConfig);
};
