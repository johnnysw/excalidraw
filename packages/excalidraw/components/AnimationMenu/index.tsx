/**
 * 动画面板 - 显示动画配置
 *
 * 功能：
 * - 查看当前 Frame 内的动画事件列表
 * - 为选中元素添加动画
 * - 修改动画类型和开始方式
 * - 预览动画效果
 */
import React from "react";
import { Icon } from "@iconify/react";
import { useAnimationMenu } from "./useAnimationMenu";
import { useDragSort } from "./useDragSort";
import { useAnimationPreview } from "./useAnimationPreview";
import {
  ANIMATION_TYPE_OPTIONS,
  START_MODE_OPTIONS,
  ANIMATION_TARGET_OPTIONS,
  type AnimationType,
  type StartMode,
  type AnimationTarget,
} from "./types";
import { getElementSummary, getAnimationTypeIcon } from "./animationEventUtils";
import "./AnimationMenu.scss";

/** 获取元素类型图标（对齐 teaching-system AnimationPanel，使用 hugeicons） */
function getElementIcon(type: string) {
  const commonProps = {
    width: 14,
    height: 14,
    className: "AnimationMenu__element-icon",
  };

  switch (type) {
    case "text":
      return <Icon icon="hugeicons:text" {...commonProps} />;
    case "image":
      return <Icon icon="hugeicons:image-01" {...commonProps} />;
    case "rectangle":
      return <Icon icon="hugeicons:rectangular" {...commonProps} />;
    case "ellipse":
      return <Icon icon="hugeicons:circle" {...commonProps} />;
    case "diamond":
      return <Icon icon="hugeicons:diamond" {...commonProps} />;
    case "line":
      return <Icon icon="hugeicons:minus-sign" {...commonProps} />;
    case "arrow":
      return <Icon icon="hugeicons:arrow-right-02" {...commonProps} />;
    case "freedraw":
      return <Icon icon="hugeicons:pencil-edit-02" {...commonProps} />;
    default:
      return <Icon icon="hugeicons:package" {...commonProps} />;
  }
}

export const AnimationMenu: React.FC = () => {
  const {
    currentFrame,
    selectedElements,
    events,
    selectedEvent,
    selectEvent,
    createEventFromSelection,
    deleteEvent,
    updateEvent,
    reorderEventList,
    getElementById,
    getEventStepGroup,
    getAvailableAnimationTargets,
  } = useAnimationMenu();

  // 拖拽排序
  const { isDragging, isDragOver, getDragProps } = useDragSort({
    items: events,
    getItemId: (event) => event.id,
    onReorder: reorderEventList,
  });

  // 动画预览
  const { handleAnimationPreview, stopPreview, isPlaying } =
    useAnimationPreview();

  if (!currentFrame) {
    return (
      <div className="AnimationMenu">
        <div className="AnimationMenu__empty">
          <Icon icon="hugeicons:presentation-02" width={48} height={48} style={{ color: '#9ca3af', marginBottom: 12 }} />
          <p>未选择幻灯片</p>
          <p className="AnimationMenu__empty-hint">
            请先选择一个 Frame（幻灯片），才能配置动画
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="AnimationMenu">
      <div className="AnimationMenu__header">
        <span className="AnimationMenu__title">动画配置</span>
        {events.length > 0 && (
          <button
            className={`AnimationMenu__preview-btn ${isPlaying ? "AnimationMenu__preview-btn--playing" : ""}`}
            onClick={() => (isPlaying ? stopPreview() : handleAnimationPreview())}
          >
            <Icon
              icon={isPlaying ? "hugeicons:stop-circle" : "hugeicons:play-circle-02"}
              width={16}
              height={16}
              className="AnimationMenu__preview-icon"
            />
            <span className="AnimationMenu__preview-text">
              {isPlaying ? "停止" : "预览"}
            </span>
          </button>
        )}
      </div>

      <div className="AnimationMenu__content">
        {/* 当前 Frame 信息 */}
        <div className="AnimationMenu__section">
          <div className="AnimationMenu__current-frame">
            <span className="AnimationMenu__frame-label">当前幻灯片：</span>
            <span className="AnimationMenu__frame-name">
              {(currentFrame as any).name || currentFrame.id.slice(0, 8)}
            </span>
          </div>
        </div>

        {/* 已选中元素 - 添加动画 */}
        {selectedElements.length > 0 && (
          <div className="AnimationMenu__section">
            <div className="AnimationMenu__selection-info">
              <div className="AnimationMenu__selection-header">
                <span className="AnimationMenu__selection-count">
                  已选中 {selectedElements.length} 个元素
                </span>
                <button
                  className="AnimationMenu__add-btn"
                  onClick={createEventFromSelection}
                >
                  <Icon icon="mdi:animation-plus" width={14} height={14} />
                  添加动画
                </button>
              </div>
              <div className="AnimationMenu__selection-elements">
                {selectedElements.slice(0, 5).map((el) => (
                  <span key={el.id} className="AnimationMenu__selection-item">
                    {getElementIcon(el.type)}
                    <span>{getElementSummary(el as any, 8)}</span>
                  </span>
                ))}
                {selectedElements.length > 5 && (
                  <span className="AnimationMenu__selection-more">
                    +{selectedElements.length - 5} 更多
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 动画事件列表 */}
        <div className="AnimationMenu__section">
          <div className="AnimationMenu__section-header">
            <div className="AnimationMenu__section-title">
              <Icon icon="material-symbols-light:animated-images-rounded" width={16} height={16} />
              动画序列 ({events.length})
            </div>
            <span className="AnimationMenu__section-hint">拖拽调整播放顺序</span>
          </div>
          {events.length > 0 ? (
            <div className="AnimationMenu__event-list">
              {events.map((event, eventIndex) => {
                const isSelected = selectedEvent?.id === event.id;
                const { icon, color } = getAnimationTypeIcon(event.type);
                const isFirstEvent = eventIndex === 0;
                const stepGroup = getEventStepGroup(event.id);

                // 获取事件中元素的摘要
                const elementSummaries = event.elements
                  .slice(0, 3)
                  .map((id) => {
                    const el = getElementById(id);
                    if (!el) return null;
                    return {
                      id,
                      type: el.type,
                      summary: getElementSummary(el as any, 10),
                    };
                  })
                  .filter(Boolean);

                // 获取可用的动画目标选项
                const availableTargets = getAvailableAnimationTargets(
                  event.id,
                );
                const filteredTargetOptions = availableTargets
                  ? ANIMATION_TARGET_OPTIONS.filter((opt) =>
                      availableTargets.includes(opt.value),
                    )
                  : null;

                return (
                  <div
                    key={event.id}
                    className={`AnimationMenu__event ${isSelected ? "AnimationMenu__event--selected" : ""} ${isDragging(event.id) ? "AnimationMenu__event--dragging" : ""} ${isDragOver(event.id) ? "AnimationMenu__event--drag-over" : ""}`}
                    onClick={() => selectEvent(isSelected ? null : event.id)}
                    {...getDragProps(event.id)}
                  >
                    {/* 事件头部 */}
                    <div className="AnimationMenu__event-header">
                      <div
                        className="AnimationMenu__event-order AnimationMenu__drag-handle"
                        style={{ backgroundColor: color }}
                        title="拖拽排序"
                      >
                        {event.order}
                      </div>
                      <span className="AnimationMenu__event-icon">{icon}</span>
                      <div className="AnimationMenu__event-summary">
                        {elementSummaries.map((s, i) => (
                          <span key={s!.id} className="AnimationMenu__element">
                            {i > 0 && ", "}
                            {getElementIcon(s!.type)} {s!.summary}
                          </span>
                        ))}
                        {event.elements.length > 3 && (
                          <span className="AnimationMenu__more">
                            {" "}
                            等 {event.elements.length} 个
                          </span>
                        )}
                      </div>
                      <div className="AnimationMenu__event-time">
                        {event.startMode === "onClick"
                          ? "单击"
                          : event.startMode === "withPrevious"
                            ? "同时"
                            : "之后"}
                        <span className="AnimationMenu__duration">
                          {(event.duration / 1000).toFixed(1)}s
                        </span>
                      </div>
                      {stepGroup !== null && (
                        <button
                          className="AnimationMenu__preview-step-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnimationPreview(stepGroup || undefined);
                          }}
                          title="预览此动画"
                        >
                          <Icon
                            icon="hugeicons:play-circle-02"
                            width={14}
                            height={14}
                          />
                        </button>
                      )}
                      <button
                        className="AnimationMenu__delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEvent(event.id);
                        }}
                        title="删除"
                      >
                        <Icon icon="hugeicons:delete-02" width={14} height={14} />
                      </button>
                    </div>

                    {/* 展开的属性区 */}
                    {isSelected && (
                      <div
                        className="AnimationMenu__event-props"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="AnimationMenu__prop-grid">
                          {/* 动画类型 */}
                          <div className="AnimationMenu__prop">
                            <label>动画类型</label>
                            <select
                              value={event.type}
                              onChange={(e) =>
                                updateEvent(event.id, {
                                  type: e.target.value as AnimationType,
                                })
                              }
                            >
                              {ANIMATION_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 开始方式 */}
                          <div className="AnimationMenu__prop">
                            <label>开始方式</label>
                            <select
                              value={event.startMode}
                              onChange={(e) =>
                                updateEvent(event.id, {
                                  startMode: e.target.value as StartMode,
                                })
                              }
                            >
                              {START_MODE_OPTIONS.filter(
                                (opt) =>
                                  !isFirstEvent ||
                                  opt.value !== "withPrevious",
                              ).map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 持续时间 */}
                          <div className="AnimationMenu__prop">
                            <label>持续时间</label>
                            <div className="AnimationMenu__duration-input">
                              <input
                                type="number"
                                min={100}
                                max={3000}
                                step={100}
                                value={event.duration}
                                onChange={(e) =>
                                  updateEvent(event.id, {
                                    duration: Number(e.target.value),
                                  })
                                }
                              />
                              <span>ms</span>
                            </div>
                          </div>

                          {/* 动画目标（仅对带装饰的文字组显示） */}
                          {filteredTargetOptions && (
                            <div className="AnimationMenu__prop">
                              <label>动画元素</label>
                              <select
                                value={event.animationTarget || "all"}
                                onChange={(e) =>
                                  updateEvent(event.id, {
                                    animationTarget: e.target
                                      .value as AnimationTarget,
                                  })
                                }
                              >
                                {filteredTargetOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="AnimationMenu__no-events">
              暂无动画，选中元素后点击「添加动画」
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export { useAnimationMenu } from "./useAnimationMenu";
export * from "./types";
