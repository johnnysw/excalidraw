import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import clsx from "clsx";
import { Icon } from "@iconify/react";
import { Tooltip } from "../Tooltip";
import { useAnswerStatus } from "../../context/answer-status";
import type {
  MemberAnswerStatus,
} from "../../context/answer-status";
import { useTaskHistory } from "./useTaskHistory";
import type { TaskHistoryItem } from "./useTaskHistory";
import { useAnswerStatusData } from "./useAnswerStatusData";

import "./AnswerStatusMenu.scss";

// 任务历史：日期、时段、截止时间 格式化（ui-ux-pro-max：locale-aware，简洁）
function formatTaskDate(s: string | null | undefined): string {
  if (!s) return "";
  const parts = s.split("-");
  const m = parts[1],
    d = parts[2];
  if (!m || !d) return s;
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

function formatDueAt(
  dueAt: string | null | undefined,
  taskDate: string | null | undefined
): string {
  if (!dueAt) return "";
  const d = new Date(dueAt.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  const day = `${d.getMonth() + 1}月${d.getDate()}日`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const dueDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (taskDate && dueDay === taskDate) return `截止 ${time}`;
  return `截止 ${day} ${time}`;
}

const TIME_PERIOD_LABEL: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

const DEFAULT_OPTIONS = ["A", "B", "C", "D"];

function timePeriodLabel(p: string | null | undefined): string {
  return (p && TIME_PERIOD_LABEL[p]) || "";
}

function useEventCallback<T extends (...args: never[]) => void>(handler: T) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback(((...args: never[]) => handlerRef.current(...args)) as T, []);
}

interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = React.memo(({ title, hint, icon, action }: EmptyStateProps) => (
  <div className="AnswerStatusMenu__empty">
    {icon && (
      <div className="AnswerStatusMenu__empty-icon" aria-hidden="true">
        {icon}
      </div>
    )}
    <p>{title}</p>
    {hint && <p className="AnswerStatusMenu__hint">{hint}</p>}
    {action}
  </div>
));

interface LoadingStateProps {
  text?: string;
  showSpinner?: boolean;
}

const LoadingState = React.memo(({ text = "加载中...", showSpinner = true }: LoadingStateProps) => (
  <div className="AnswerStatusMenu__loading">
    {showSpinner && <div className="AnswerStatusMenu__spinner" />}
    <p>{text}</p>
  </div>
));

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

const ErrorState = React.memo(({ message, onRetry }: ErrorStateProps) => (
  <div className="AnswerStatusMenu__error">
    <p>{message}</p>
    <button className="AnswerStatusMenu__retry-btn" onClick={onRetry}>
      重试
    </button>
  </div>
));

interface TaskTargetsProps {
  classes: Array<{ id: number; name: string }>;
  onAssign: () => void;
}

const TaskTargets = React.memo(({ classes, onAssign }: TaskTargetsProps) => (
  <div className="AnswerStatusMenu__task-targets">
    <div className="AnswerStatusMenu__task-label-row">
      <span className="AnswerStatusMenu__task-label">任务对象</span>
      <button
        type="button"
        className="AnswerStatusMenu__assign-icon-btn"
        title="布置任务"
        aria-label="布置任务"
        onClick={(e) => {
          e.stopPropagation();
          onAssign();
        }}
      >
        <Icon icon="hugeicons:task-add-01" width={16} height={16} />
      </button>
    </div>
    <div className="AnswerStatusMenu__task-classes">
      {classes.length > 0 ? (
        classes.map((cls) => (
          <span key={cls.id} className="AnswerStatusMenu__task-class-tag">
            {cls.name}
          </span>
        ))
      ) : (
        <span className="AnswerStatusMenu__task-empty">—</span>
      )}
    </div>
  </div>
));

type TabType = 'answer' | 'history';

export const AnswerStatusMenu: React.FC = () => {
  const config = useAnswerStatus();
  const [activeTab, setActiveTab] = useState<TabType>('answer');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<number, number>>({});
  const [statusUpdating, setStatusUpdating] = useState<Record<number, boolean>>({});
  const selectedQuestion = config?.selectedQuestion;
  const fetchQuestionAnswerStatus = config?.fetchQuestionAnswerStatus;
  const fetchTaskHistoryByCourseware = config?.fetchTaskHistoryByCourseware;
  const teachingContext = config?.teachingContext;
  const teachingTaskId = selectedTaskId ?? teachingContext?.taskId ?? null;
  const teachingModuleId = teachingContext?.moduleId ?? null;
  const teachingCoursewareId = teachingContext?.coursewareId ?? null;
  const {
    historyState,
    historyList,
    defaultTaskId,
    defaultModuleId,
    fetchTaskHistory,
  } = useTaskHistory({
    coursewareId: teachingCoursewareId ?? undefined,
    taskId: teachingTaskId ?? undefined,
    fetchTaskHistoryByCourseware,
  });

  const {
    state,
    derivedTaskId,
    canRefresh,
    refresh,
  } = useAnswerStatusData({
    selectedQuestionId: selectedQuestion?.questionId,
    teachingTaskId: teachingTaskId ?? undefined,
    defaultTaskId,
    fetchQuestionAnswerStatus,
  });

  const derivedModuleId = teachingModuleId ?? defaultModuleId ?? null;

  const handleAssignTask = useEventCallback(() => {
    const nextTeachingContext = {
      ...(teachingContext || null),
      moduleId: teachingContext?.moduleId ?? derivedModuleId ?? undefined,
    };
    const event = new CustomEvent("excalidraw:assignTask", {
      detail: {
        source: "answer-status",
        teachingContext: nextTeachingContext,
        coursewareId: teachingCoursewareId ?? undefined,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  });

  const handleToggleHistoryTaskStatus = useEventCallback((task: TaskHistoryItem, currentStatus: number) => {
    const nextStatus = currentStatus === 1 ? 0 : 1;
    setStatusOverrides((prev) => ({ ...prev, [task.id]: nextStatus }));
    setStatusUpdating((prev) => ({ ...prev, [task.id]: true }));
    const event = new CustomEvent("excalidraw:toggleTaskStatus", {
      detail: {
        source: "answer-status",
        task: {
          ...task,
          status: nextStatus,
          taskMode: task.taskMode ?? "practice",
          coursewareId: task.coursewareId ?? teachingCoursewareId ?? undefined,
        },
        nextStatus,
        previousStatus: currentStatus,
        teachingContext: teachingContext || null,
        coursewareId: task.coursewareId ?? teachingCoursewareId ?? undefined,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  });

  useEffect(() => {
    const handleStatusUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { taskId?: number; status?: number }
        | undefined;
      const taskId = detail?.taskId;
      if (!taskId) return;
      if (typeof detail?.status === "number") {
        setStatusOverrides((prev) => ({ ...prev, [taskId]: detail.status as number }));
      }
      setStatusUpdating((prev) => ({ ...prev, [taskId]: false }));
    };

    const handleStatusUpdateFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { taskId?: number; previousStatus?: number }
        | undefined;
      const taskId = detail?.taskId;
      if (!taskId) return;
      if (typeof detail?.previousStatus === "number") {
        setStatusOverrides((prev) => ({ ...prev, [taskId]: detail.previousStatus as number }));
      }
      setStatusUpdating((prev) => ({ ...prev, [taskId]: false }));
    };

    document.addEventListener("excalidraw:taskStatusUpdated", handleStatusUpdated);
    document.addEventListener("excalidraw:taskStatusUpdateFailed", handleStatusUpdateFailed);
    return () => {
      document.removeEventListener("excalidraw:taskStatusUpdated", handleStatusUpdated);
      document.removeEventListener("excalidraw:taskStatusUpdateFailed", handleStatusUpdateFailed);
    };
  }, []);

  // 手动刷新按钮调用
  const handleRefresh = useEventCallback(() => {
    void refresh();
  });

  const summary = useMemo(() => {
    if (!state.data) {
      return {
        correctCount: 0,
        wrongCount: 0,
        unansweredCount: 0,
        answeredCount: 0,
        correctRateText: "--",
      };
    }

    const correctCount = state.data.members.filter(
      (m) => m.answerStatus === "correct",
    ).length;
    const wrongCount = state.data.members.filter(
      (m) => m.answerStatus === "wrong",
    ).length;
    const unansweredCount = state.data.members.filter(
      (m) => m.answerStatus === "unanswered",
    ).length;
    const answeredCount = correctCount + wrongCount;
    const correctRateText =
      answeredCount > 0
        ? `${Math.round((correctCount / answeredCount) * 100)}%`
        : "--";

    return {
      correctCount,
      wrongCount,
      unansweredCount,
      answeredCount,
      correctRateText,
    };
  }, [state.data]);

  const groupedAnswers = useMemo(() => {
    const map = new Map<string, MemberAnswerStatus[]>();
    if (!state.data) return map;
    state.data.members.forEach((member) => {
      if (!member.userAnswer) return;
      const list = map.get(member.userAnswer) ?? [];
      list.push(member);
      map.set(member.userAnswer, list);
    });
    return map;
  }, [state.data]);

  const sortedOptions = useMemo(() => {
    if (!state.data) return DEFAULT_OPTIONS;
    const optionSet = new Set([
      ...DEFAULT_OPTIONS,
      state.data.correctOption,
      ...groupedAnswers.keys(),
    ]);

    const extraOptions = Array.from(optionSet)
      .filter((option) => !DEFAULT_OPTIONS.includes(option))
      .sort((a, b) => a.localeCompare(b));
    return [...DEFAULT_OPTIONS, ...extraOptions];
  }, [state.data, groupedAnswers]);

  const header = (
    <div className="AnswerStatusMenu__header">
      <div className="AnswerStatusMenu__tabs">
        <button
          type="button"
          className={clsx("AnswerStatusMenu__tab", {
            "AnswerStatusMenu__tab--active": activeTab === 'answer',
          })}
          onClick={() => setActiveTab('answer')}
        >
          答题情况
        </button>
        <button
          type="button"
          className={clsx("AnswerStatusMenu__tab", {
            "AnswerStatusMenu__tab--active": activeTab === 'history',
          })}
          onClick={() => setActiveTab('history')}
        >
          任务历史
        </button>
      </div>
      <div className="AnswerStatusMenu__actions">
        {activeTab === 'answer' && (
          <button
            type="button"
            className="AnswerStatusMenu__refresh-btn"
            title={state.loading ? "刷新中..." : "刷新"}
            aria-label="刷新"
            disabled={!canRefresh || state.loading}
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
          >
            <Icon icon="hugeicons:reload" width={16} height={16} />
          </button>
        )}
      </div>
    </div>
  );

  const taskFromHistory =
    historyList.find((task) => Number(task.id) === Number(teachingTaskId)) ?? null;
  const taskForTargets = taskFromHistory ?? historyList[0] ?? null;
  const targetClasses = taskForTargets?.targets?.classes ?? [];

  const taskTargets = useMemo(
    () => <TaskTargets classes={targetClasses} onAssign={handleAssignTask} />,
    [targetClasses, handleAssignTask],
  );

  const handleSelectHistoryTask = useEventCallback((taskId: number) => {
    setSelectedTaskId(taskId);
    setActiveTab('answer');
  });

  const handleEditHistoryTask = useEventCallback((task: TaskHistoryItem) => {
    const moduleId = task.moduleId ?? derivedModuleId ?? undefined;
    const event = new CustomEvent("excalidraw:editTask", {
      detail: {
        source: "answer-status",
        task: {
          ...task,
          moduleId,
          coursewareId: task.coursewareId ?? teachingCoursewareId ?? undefined,
          status: task.status ?? 0,
          taskMode: task.taskMode ?? "practice",
        },
        teachingContext: {
          ...(teachingContext || null),
          moduleId,
        },
        coursewareId: task.coursewareId ?? teachingCoursewareId ?? undefined,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  });

  // 任务历史按钮的共享样式和事件处理
  const historyActionButtonStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    padding: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
  };

  const handleButtonMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    e.currentTarget.style.transform = 'scale(1.1)';
  };

  const handleButtonMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.transform = 'scale(1)';
  };

  // 渲染空状态
  if (!config) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <EmptyState title="答题情况功能未配置" />
      </div>
    );
  }

  const hasHistoryLoaded = historyState.data !== null;
  const hasHistoryTasks = historyList.length > 0;

  // 未关联课件或任务列表为空时，仅展示任务历史空态（不展示 tabs/刷新）
  if (!teachingCoursewareId || (!teachingTaskId && hasHistoryLoaded && !hasHistoryTasks)) {
    return (
      <div className="AnswerStatusMenu">
        <EmptyState
          title="该课件尚未关联任何任务"
          hint="点击下方按钮为该课件布置任务"
          icon={<Icon icon="hugeicons:task-daily-01" />}
          action={
            <button
              type="button"
              className="AnswerStatusMenu__assign-btn"
              onClick={handleAssignTask}
            >
              <Icon icon="hugeicons:task-add-01" />
              布置任务
            </button>
          }
        />
      </div>
    );
  }

  // 任务历史首次加载中
  if (!hasHistoryLoaded && historyState.loading) {
    return (
      <div className="AnswerStatusMenu">
        <LoadingState />
      </div>
    );
  }

  // 任务历史 Tab
  if (activeTab === 'history') {
    // 加载中
    if (historyState.loading) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <LoadingState />
        </div>
      );
    }

    // 错误状态
    if (historyState.error) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <ErrorState message={historyState.error} onRetry={fetchTaskHistory} />
        </div>
      );
    }

    // 任务历史列表
    const tasks = historyList;
    if (tasks.length === 0) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <EmptyState
            title="该课件尚未关联任何任务"
            hint="点击下方按钮为该课件布置任务"
            icon={<Icon icon="hugeicons:task-daily-01" />}
            action={(
              <button
                type="button"
                className="AnswerStatusMenu__assign-btn"
                onClick={handleAssignTask}
              >
                布置任务
              </button>
            )}
          />
        </div>
      );
    }

    return (
      <div className="AnswerStatusMenu">
        {header}
        <p className="AnswerStatusMenu__history-hint">
          <span className="AnswerStatusMenu__history-hint-icon" aria-hidden="true">
            <Icon icon="hugeicons:information-circle" />
          </span>
          <span style={{ display: 'inline' }}>
            点击卡片右上角
            <Icon
              icon="hugeicons:arrow-left-right"
              width={16}
              height={16}
              style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                margin: '0 3px',
                lineHeight: 'inherit'
              }}
            />
            按钮可以切换任务，查看该任务的答题情况
          </span>
        </p>
        <div className="AnswerStatusMenu__history-list">
          {tasks.map((task) => {
            const metaParts: string[] = [];
            if (task.taskDate) metaParts.push(formatTaskDate(task.taskDate));
            const tp = timePeriodLabel(task.timePeriod);
            if (tp) metaParts.push(tp);
            if (task.dueAt)
              metaParts.push(formatDueAt(task.dueAt, task.taskDate));
            const metaText = metaParts.join(" · ");
            const classes = task.targets?.classes ?? [];
            const isSelected = Number(task.id) === Number(teachingTaskId);
            const displayStatus = statusOverrides[task.id] ?? task.status ?? 0;
            const isPublished = displayStatus === 1;
            const isUpdating = !!statusUpdating[task.id];

            return (
              <div
                key={task.id}
                className={clsx("AnswerStatusMenu__history-item", {
                  "AnswerStatusMenu__history-item--active": isSelected,
                  "AnswerStatusMenu__history-item--published": isPublished,
                })}
                aria-current={isSelected ? "true" : undefined}
              >
                <div className="AnswerStatusMenu__history-header">
                  <div className="AnswerStatusMenu__history-title">
                    {task.title}
                  </div>
                  <div className="AnswerStatusMenu__history-actions" style={{ display: 'flex', gap: '2px' }}>
                    <Tooltip label="切换任务">
                      <button
                        type="button"
                        style={historyActionButtonStyle}
                        onMouseEnter={handleButtonMouseEnter}
                        onMouseLeave={handleButtonMouseLeave}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSelectHistoryTask(task.id);
                        }}
                      >
                        <Icon icon="hugeicons:arrow-left-right" width={16} height={16} />
                      </button>
                    </Tooltip>
                    <Tooltip label={isPublished ? "取消发布" : "发布"}>
                      <button
                        type="button"
                        style={{
                          ...historyActionButtonStyle,
                          opacity: isUpdating ? 0.5 : 1,
                          pointerEvents: isUpdating ? 'none' : 'auto',
                        }}
                        onMouseEnter={handleButtonMouseEnter}
                        onMouseLeave={handleButtonMouseLeave}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleHistoryTaskStatus(task, displayStatus);
                        }}
                        aria-label={isPublished ? "已发布" : "草稿"}
                      >
                        <Icon
                          icon={isPublished ? "hugeicons:task-remove-01" : "hugeicons:task-done-01"}
                          width={16}
                          height={16}
                        />
                      </button>
                    </Tooltip>
                    <Tooltip label="编辑任务">
                      <button
                        type="button"
                        style={historyActionButtonStyle}
                        onMouseEnter={handleButtonMouseEnter}
                        onMouseLeave={handleButtonMouseLeave}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleEditHistoryTask(task);
                        }}
                      >
                        <Icon icon="hugeicons:task-edit-01" width={16} height={16} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                {metaText && (
                  <div className="AnswerStatusMenu__history-meta">
                    {metaText}
                  </div>
                )}
                {classes.length > 0 && (
                  <div className="AnswerStatusMenu__history-classes">
                    {classes.map((cls) => (
                      <span
                        key={cls.id}
                        className="AnswerStatusMenu__history-class-tag"
                      >
                        {cls.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 渲染未选中题目状态
  if (!selectedQuestion) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <EmptyState
          title="请在画布上选择一道题目"
          hint="点击题目节点后，这里将显示学员的答题情况"
          icon={<Icon icon="hugeicons:task-daily-01" />}
        />
        {taskTargets}
      </div>
    );
  }

  // 渲染加载状态
  if (state.loading) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <div className="AnswerStatusMenu__loading">
          <div className="AnswerStatusMenu__spinner" />
          <p>加载中...</p>
        </div>
        {taskTargets}
      </div>
    );
  }

  // 渲染错误状态
  if (state.error) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <ErrorState message={state.error} onRetry={handleRefresh} />
        {taskTargets}
      </div>
    );
  }

  // 渲染答题状态列表
  const { data } = state;
  if (!data) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <LoadingState text="暂无答题数据" showSpinner={false} />
        {taskTargets}
      </div>
    );
  }

  const { correctCount, wrongCount, unansweredCount, answeredCount, correctRateText } = summary;

  return (
    <div className="AnswerStatusMenu">
      {header}
      {/* 统计概览 */}
      <div className="AnswerStatusMenu__summary">
        <div className="AnswerStatusMenu__summary-item">
          <span className="AnswerStatusMenu__summary-label">总人数</span>
          <span className="AnswerStatusMenu__summary-value">
            {data.totalStudents}
          </span>
        </div>
        <div className="AnswerStatusMenu__summary-item">
          <span className="AnswerStatusMenu__summary-label">已答</span>
          <span className="AnswerStatusMenu__summary-value">
            {answeredCount}
          </span>
        </div>
        <div className="AnswerStatusMenu__summary-item AnswerStatusMenu__summary-item--unanswered">
          <span className="AnswerStatusMenu__summary-label">未答</span>
          <span className="AnswerStatusMenu__summary-value">
            {unansweredCount}
          </span>
        </div>
        <div className="AnswerStatusMenu__summary-item AnswerStatusMenu__summary-item--correct">
          <span className="AnswerStatusMenu__summary-label">正确</span>
          <span className="AnswerStatusMenu__summary-value">{correctCount}</span>
        </div>
        <div className="AnswerStatusMenu__summary-item AnswerStatusMenu__summary-item--wrong">
          <span className="AnswerStatusMenu__summary-label">错误</span>
          <span className="AnswerStatusMenu__summary-value">{wrongCount}</span>
        </div>
        <div className="AnswerStatusMenu__summary-item AnswerStatusMenu__summary-item--rate">
          <span className="AnswerStatusMenu__summary-label">正确率</span>
          <span className="AnswerStatusMenu__summary-value">{correctRateText}</span>
        </div>
      </div>

      {/* 正确答案提示（如果没有任何回答，显示一下正确答案） */}
      {sortedOptions.length === 0 && (
        <div className="AnswerStatusMenu__correct-answer-hint">
          正确答案：<span className="value">{data.correctOption}</span>
        </div>
      )}

      {/* 选项卡片网格 */}
      <div className="AnswerStatusMenu__grid">
        {sortedOptions.map((option) => {
          const isCorrect = option === data.correctOption;
          const members = groupedAnswers.get(option) ?? [];

          return (
            <div
              key={option}
              className={clsx("AnswerStatusMenu__card", {
                "AnswerStatusMenu__card--correct": isCorrect,
                "AnswerStatusMenu__card--wrong": !isCorrect
              })}
            >
              <div className="AnswerStatusMenu__card-header">
                <div className="AnswerStatusMenu__card-option">
                  {option}
                  {isCorrect && (
                    <Icon icon="hugeicons:checkmark-circle-03" width={14} height={14} />
                  )}
                </div>
                <div className="AnswerStatusMenu__card-count">
                  {members.length}人
                </div>
              </div>
              <div className="AnswerStatusMenu__card-body">
                {members.map(member => (
                  <span key={member.memberId} className="AnswerStatusMenu__student-tag">
                    {member.nickname}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {taskTargets}
    </div>
  );
};
