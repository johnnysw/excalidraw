/**
 * 属性面板 - 显示选中元素的属性
 *
 * 完整功能：颜色、描边、字体、透明度、图层、对齐、操作
 */
import React from "react";
import { Icon } from "@iconify/react";
import {
  useApp,
  useExcalidrawElements,
  useExcalidrawActionManager,
} from "./App";
import { getSelectedElements, getTargetElements } from "../scene";
import { isTransparent } from "@excalidraw/common";
import {
  hasBackground,
  hasStrokeColor,
  hasStrokeWidth,
  hasStrokeStyle,
  canChangeRoundness,
  isTextElement,
  isLinearElement,
  isImageElement,
  hasBoundTextElement,
  isElbowArrow,
  suppportsHorizontalAlign,
  shouldAllowVerticalAlign,
  canHaveArrowheads,
  toolIsArrow,
  isFreeDrawElement,
} from "@excalidraw/element";
import { alignActionsPredicate } from "../actions/actionAlign";
import { t } from "../i18n";
import { NumberInput } from "./NumberInput";
import { actionChangeStrokeWidth } from "../actions/actionProperties";
import "./PropertiesMenu.scss";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "../types";

/**
 * 根据元素类型和当前工具获取描边颜色的标签
 */
const getStrokeColorLabel = (
  selectedElements: readonly ExcalidrawElement[],
  activeTool: AppState["activeTool"],
): string => {
  // 如果没有选中元素，根据当前工具类型返回
  if (selectedElements.length === 0) {
    const toolType = activeTool.type;
    if (toolType === "text") {
      return "文字色";
    }
    if (toolType === "freedraw") {
      return "笔触色";
    }
    if (toolType === "line" || toolIsArrow(toolType)) {
      return "线条色";
    }
    // 形状工具：rectangle, diamond, ellipse
    if (["rectangle", "diamond", "ellipse"].includes(toolType)) {
      return "边框色";
    }
    return "描边色";
  }

  // 检查选中元素的类型
  const hasText = selectedElements.some((el) => isTextElement(el));
  const hasFreedraw = selectedElements.some((el) => isFreeDrawElement(el));
  const hasLinear = selectedElements.some((el) => isLinearElement(el));
  const hasShape = selectedElements.some(
    (el) =>
      el.type === "rectangle" ||
      el.type === "diamond" ||
      el.type === "ellipse",
  );

  // 统计类型数量
  const typeCount = [hasText, hasFreedraw, hasLinear, hasShape].filter(
    Boolean,
  ).length;

  // 如果只有一种类型
  if (typeCount === 1) {
    if (hasText) {
      return "文字色";
    }
    if (hasFreedraw) {
      return "笔触色";
    }
    if (hasLinear) {
      return "线条色";
    }
    if (hasShape) {
      return "边框色";
    }
  }

  // 混合类型或其他情况，返回通用标签
  return "描边色";
};

export const PropertiesMenu: React.FC = () => {
  const app = useApp();
  const elements = useExcalidrawElements();
  const actionManager = useExcalidrawActionManager();

  // 获取选中的元素
  const selectedElements = getSelectedElements(elements, app.state);
  const elementsMap = app.scene.getNonDeletedElementsMap();
  const targetElements = getTargetElements(elementsMap, app.state);
  const isRTL = document.documentElement.getAttribute("dir") === "rtl";

  // 检查是否是单个带文本容器
  let isSingleElementBoundContainer = false;
  if (
    targetElements.length === 2 &&
    (hasBoundTextElement(targetElements[0]) ||
      hasBoundTextElement(targetElements[1]))
  ) {
    isSingleElementBoundContainer = true;
  }

  const isEditingTextOrNewElement = Boolean(
    app.state.editingTextElement || app.state.newElement,
  );

  // 检查是否可以编辑某些属性
  const canEditStrokeColor =
    app.state.activeTool.type !== "selection" ||
    targetElements.some((el) => hasStrokeColor(el.type));
  const canEditBackgroundColor =
    app.state.activeTool.type !== "selection" ||
    targetElements.some((el) => hasBackground(el.type));
  const isFreedrawToolActive = app.state.activeTool.type === "freedraw";
  const canEditStrokeWidth =
    isFreedrawToolActive || targetElements.some((el) => hasStrokeWidth(el.type));
  const canEditStrokeStyle = targetElements.some((el) =>
    hasStrokeStyle(el.type),
  );
  const canEditRoundness = targetElements.some((el) =>
    canChangeRoundness(el.type),
  );
  const canEditTextProps =
    app.state.activeTool.type === "text" ||
    targetElements.some((el) => isTextElement(el));
  const canEditArrowhead =
    toolIsArrow(app.state.activeTool.type) ||
    targetElements.some((el) => toolIsArrow(el.type));
  const canEditArrowType =
    toolIsArrow(app.state.activeTool.type) ||
    targetElements.some((el) => toolIsArrow(el.type));

  const showFillIcons =
    (hasBackground(app.state.activeTool.type) &&
      !isTransparent(app.state.currentItemBackgroundColor)) ||
    targetElements.some(
      (element) =>
        hasBackground(element.type) && !isTransparent(element.backgroundColor),
    );

  // 对齐相关
  const showAlignActions =
    !isSingleElementBoundContainer && alignActionsPredicate(app.state, app);

  // 操作相关
  const showLinkIcon =
    targetElements.length === 1 || isSingleElementBoundContainer;
  const showLineEditorAction =
    !app.state.selectedLinearElement?.isEditing &&
    targetElements.length === 1 &&
    isLinearElement(targetElements[0]) &&
    !isElbowArrow(targetElements[0]);
  const showCropEditorAction =
    !app.state.croppingElementId &&
    targetElements.length === 1 &&
    isImageElement(targetElements[0]);

  if (targetElements.length === 0 && !isFreedrawToolActive) {
    return (
      <div className="PropertiesMenu">
        <div className="PropertiesMenu__empty">
          <Icon icon="hugeicons:cursor-02" width={48} height={48} style={{ color: '#9ca3af', marginBottom: 12 }} />
          <p>未选中元素</p>
          <p className="PropertiesMenu__empty-hint">
            选择画布上的元素以查看和编辑属性
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="PropertiesMenu properties-content">
      {/* 边框色 */}
      {canEditStrokeColor && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">
            {getStrokeColorLabel(targetElements, app.state.activeTool)}
          </div>
          <div className="PropertiesMenu__color-row">
            {actionManager.renderAction("changeStrokeColor")}
          </div>
        </div>
      )}

      {/* 填充色 */}
      {canEditBackgroundColor && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">填充色</div>
          <div className="PropertiesMenu__color-row">
            {actionManager.renderAction("changeBackgroundColor")}
          </div>
        </div>
      )}

      {/* 文字描边 (可选，放在最后或文字部分) */}
      {canEditTextProps && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">文字描边</div>
          <div className="PropertiesMenu__actions">
            <div className="PropertiesMenu__inline-row">
              {actionManager.renderAction("changeTextOutlineColor")}
              {actionManager.renderAction("changeTextOutlineWidth")}
            </div>
          </div>
        </div>
      )}

      {/* 填充样式 */}
      {showFillIcons && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">填充样式</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeFillStyle")}
          </div>
        </div>
      )}

      {/* 描边宽度 */}
      {canEditStrokeWidth && (() => {
        const strokeWidthValue = targetElements.length > 0
          ? targetElements[0].strokeWidth
          : app.state.currentItemStrokeWidth;
        return (
          <div className="PropertiesMenu__section">
            <div className="PropertiesMenu__section-title">描边宽度</div>
            <div className="PropertiesMenu__actions">
              <div className="PropertiesMenu__inline-row">
                {actionManager.renderAction("changeStrokeWidth")}
                <NumberInput
                  value={strokeWidthValue}
                  min={0.5}
                  max={100}
                  step={0.5}
                  onChange={(value) => {
                    actionManager.executeAction(actionChangeStrokeWidth, "ui", value);
                  }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* 笔触形状 (自由绘制) */}
      {(app.state.activeTool.type === "freedraw" ||
        targetElements.some((element) => element.type === "freedraw")) && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">笔触形状</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeStrokeShape")}
          </div>
        </div>
      )}

      {/* 边框样式 */}
      {canEditStrokeStyle && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">边框样式</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeStrokeStyle")}
          </div>
        </div>
      )}

      {/* 线条风格 */}
      {canEditStrokeStyle && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">线条风格</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeSloppiness")}
          </div>
        </div>
      )}

      {/* 边角 */}
      {canEditRoundness && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">边角</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeRoundness")}
          </div>
        </div>
      )}

      {/* 线条类型 (箭头/线段) */}
      {canEditArrowType && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">线条类型</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeArrowType")}
          </div>
        </div>
      )}

      {/* 箭头样式 */}
      {canEditArrowhead && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">箭头样式</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeArrowhead")}
          </div>
        </div>
      )}

      {/* 字体 */}
      {canEditTextProps && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">字体</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeFontFamily")}
          </div>
        </div>
      )}

      {/* 字体大小 */}
      {canEditTextProps && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">字体大小</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeFontSize")}
          </div>
        </div>
      )}

      {/* 文本对齐 */}
      {canEditTextProps &&
        (app.state.activeTool.type === "text" ||
          suppportsHorizontalAlign(targetElements, elementsMap)) && (
          <div className="PropertiesMenu__section">
            <div className="PropertiesMenu__section-title">文本对齐</div>
            <div className="PropertiesMenu__actions">
              {actionManager.renderAction("changeTextAlign")}
            </div>
          </div>
        )}

      {/* 垂直对齐 (文本容器) */}
      {shouldAllowVerticalAlign(targetElements, elementsMap) && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">垂直对齐</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeVerticalAlign")}
          </div>
        </div>
      )}

      {/* 行高 */}
      {canEditTextProps && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">行高</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeLineHeight")}
          </div>
        </div>
      )}

      {/* 透明度 */}
      {(targetElements.length > 0 || isFreedrawToolActive) && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">透明度</div>
          <div className="PropertiesMenu__actions">
            {actionManager.renderAction("changeOpacity")}
          </div>
        </div>
      )}

      {/* 图层 */}
      {(targetElements.length > 0 || isFreedrawToolActive) && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">图层</div>
          <div className="PropertiesMenu__button-row buttonList">
            {actionManager.renderAction("sendToBack")}
            {actionManager.renderAction("sendBackward")}
            {actionManager.renderAction("bringForward")}
            {actionManager.renderAction("bringToFront")}
          </div>
        </div>
      )}

      {/* 对齐 */}
      {showAlignActions && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">对齐</div>
          <div className="PropertiesMenu__button-row buttonList">
            {isRTL ? (
              <>
                {actionManager.renderAction("alignRight")}
                {actionManager.renderAction("alignHorizontallyCentered")}
                {actionManager.renderAction("alignLeft")}
              </>
            ) : (
              <>
                {actionManager.renderAction("alignLeft")}
                {actionManager.renderAction("alignHorizontallyCentered")}
                {actionManager.renderAction("alignRight")}
              </>
            )}
            {targetElements.length > 2 &&
              actionManager.renderAction("distributeHorizontally")}
          </div>
          <div className="PropertiesMenu__button-row buttonList">
            {actionManager.renderAction("alignTop")}
            {actionManager.renderAction("alignVerticallyCentered")}
            {actionManager.renderAction("alignBottom")}
            {targetElements.length > 2 &&
              actionManager.renderAction("distributeVertically")}
          </div>
        </div>
      )}

      {/* 操作 */}
      {!isEditingTextOrNewElement && targetElements.length > 0 && (
        <div className="PropertiesMenu__section">
          <div className="PropertiesMenu__section-title">操作</div>
          <div className="PropertiesMenu__button-row buttonList">
            {actionManager.renderAction("duplicateSelection")}
            {actionManager.renderAction("deleteSelectedElements")}
            {showLinkIcon && actionManager.renderAction("hyperlink")}
            {actionManager.renderAction("group")}
            {actionManager.renderAction("ungroup")}
            {showCropEditorAction && actionManager.renderAction("cropEditor")}
            {showLineEditorAction &&
              actionManager.renderAction("toggleLinearEditor")}
          </div>
        </div>
      )}
    </div>
  );
};
