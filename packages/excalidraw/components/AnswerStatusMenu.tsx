import React, { useEffect, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { Icon } from "@iconify/react";
import { useAnswerStatus } from "../context/answer-status";
import type {
  MemberAnswerStatus,
  QuestionAnswerStatusResponse,
} from "../context/answer-status";

import "./AnswerStatusMenu.scss";

interface AnswerStatusState {
  loading: boolean;
  error: string | null;
  data: QuestionAnswerStatusResponse | null;
}

interface TaskHistoryItem {
  id: number;
  title: string;
  description?: string | null;
  status?: number;
  taskMode?: string;
  moduleId?: number;
  taskDate?: string | null;
  timePeriod?: string | null; // 'morning' | 'afternoon' | 'evening'
  dueAt?: string | null;
  targets: {
    classes: Array<{ id: number; name: string }>;
    members: Array<{ id: number; nickname?: string; username?: string }>;
  };
}

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

function timePeriodLabel(p: string | null | undefined): string {
  return (p && TIME_PERIOD_LABEL[p]) || "";
}

interface TaskHistoryState {
  loading: boolean;
  error: string | null;
  data: TaskHistoryItem[] | { list: TaskHistoryItem[] } | null;
}

type TabType = 'answer' | 'history';

export const AnswerStatusMenu: React.FC = () => {
  const config = useAnswerStatus();
  const [activeTab, setActiveTab] = useState<TabType>('answer');
  const [state, setState] = useState<AnswerStatusState>({
    loading: false,
    error: null,
    data: null,
  });
  const [historyState, setHistoryState] = useState<TaskHistoryState>({
    loading: false,
    error: null,
    data: null,
  });

  const selectedQuestion = config?.selectedQuestion;
  const fetchQuestionAnswerStatus = config?.fetchQuestionAnswerStatus;
  const fetchTaskHistoryByCourseware = config?.fetchTaskHistoryByCourseware;
  const teachingContext = config?.teachingContext;
  const coursewareId = teachingContext?.coursewareId;
  const taskId = teachingContext?.taskId;

  // 获取任务历史
  const fetchTaskHistory = useCallback(async () => {
    if (!coursewareId) return;
    if (!fetchTaskHistoryByCourseware) {
      setHistoryState({ loading: false, error: '缺少任务历史接口配置', data: null });
      return;
    }

    setHistoryState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const result = await fetchTaskHistoryByCourseware(coursewareId, 1, 50);
      const list = result?.list ?? [];
      setHistoryState({ loading: false, error: null, data: list });
    } catch (err) {
      setHistoryState({
        loading: false,
        error: err instanceof Error ? err.message : '获取任务历史失败',
        data: null,
      });
    }
  }, [coursewareId, fetchTaskHistoryByCourseware]);

  // 课件变更时重置任务历史
  useEffect(() => {
    setHistoryState({ loading: false, error: null, data: null });
  }, [coursewareId]);


  // 初次加载即拉取任务历史（用于判断是否有任务关联）
  useEffect(() => {
    if (coursewareId && historyState.data === null && !historyState.loading) {
      fetchTaskHistory();
    }
  }, [coursewareId, historyState.data, historyState.loading, fetchTaskHistory]);

  // 用于追踪上一次自动请求的 questionId，避免重复请求
  const lastAutoFetchedQuestionIdRef = useRef<string | null>(null);
  // 保存最新的 fetchQuestionAnswerStatus 引用，避免它变化导致 effect 重跑
  const fetchFnRef = useRef(fetchQuestionAnswerStatus);
  fetchFnRef.current = fetchQuestionAnswerStatus;

  const historyList = Array.isArray(historyState.data)
    ? historyState.data
    : historyState.data?.list ?? [];
  const derivedTaskId = teachingContext?.taskId ?? historyList[0]?.id ?? null;
  const derivedModuleId = teachingContext?.moduleId ?? historyList[0]?.moduleId ?? null;
  const hasTeachingContext = !!(derivedTaskId || derivedModuleId);
  const canRefresh =
    !!selectedQuestion?.questionId &&
    hasTeachingContext;

  const fetchAnswerStatus = useCallback(async (questionId: string) => {
    const fetchFn = fetchFnRef.current;
    if (fetchFn && (teachingContext?.taskId || teachingContext?.moduleId)) {
      return fetchFn(questionId);
    }

    if (!derivedTaskId && !derivedModuleId) return null;

    const params = new URLSearchParams({ question_id: questionId });
    if (derivedTaskId) params.set('task_id', String(derivedTaskId));
    if (derivedModuleId) params.set('module_id', String(derivedModuleId));

    const response = await fetch(`/api/tasks/question-answer-status?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.message || '获取答题情况失败');
    }
    return result?.data ?? null;
  }, [derivedTaskId, derivedModuleId, teachingContext?.taskId, teachingContext?.moduleId]);

  const handleAssignTask = useCallback(() => {
    const nextTeachingContext = {
      ...(teachingContext || null),
      moduleId: teachingContext?.moduleId ?? derivedModuleId ?? undefined,
    };
    const event = new CustomEvent("excalidraw:assignTask", {
      detail: {
        source: "answer-status",
        teachingContext: nextTeachingContext,
        coursewareId,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, [coursewareId, derivedModuleId, teachingContext]);

  // 手动刷新按钮调用
  const handleRefresh = useCallback(async () => {
    const questionId = selectedQuestion?.questionId;
    if (!questionId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await fetchAnswerStatus(questionId);
      setState({ loading: false, error: null, data });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof Error ? err.message : "获取答题情况失败",
        data: null,
      });
    }
  }, [selectedQuestion?.questionId]);

  // 题目切换时自动拉取
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[AnswerStatusMenu] teachingContext', {
        taskId: teachingContext?.taskId,
        moduleId: teachingContext?.moduleId,
        coursewareId: teachingContext?.coursewareId,
        selectedQuestionId: selectedQuestion?.questionId,
      });
    }
    const questionId = selectedQuestion?.questionId;
    // 未选题：清空，并允许下次选中同题再次自动拉取
    if (!questionId) {
      lastAutoFetchedQuestionIdRef.current = null;
      setState({ loading: false, error: null, data: null });
      return;
    }

    // 检查是否可以自动请求
    const hasContext = hasTeachingContext;
    if (!hasContext) {
      // 缺少上下文或 API：清空数据，不自动请求
      lastAutoFetchedQuestionIdRef.current = null;
      setState({ loading: false, error: null, data: null });
      return;
    }

    const questionKey = questionId;

    // 同一题目在同一班级下只自动拉取一次（避免 StrictMode 双触发 & 刷新后不重复触发）
    if (lastAutoFetchedQuestionIdRef.current === questionKey) return;
    lastAutoFetchedQuestionIdRef.current = questionKey;

    // 自动拉取
    setState({ loading: true, error: null, data: null });
    fetchAnswerStatus(questionId)
      .then((data) => {
        setState({ loading: false, error: null, data });
      })
      .catch((err) => {
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "获取答题情况失败",
          data: null,
        });
      });
  }, [selectedQuestion?.questionId, teachingContext?.taskId, teachingContext?.moduleId, historyState.data]);

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
            <Icon icon="hugeicons:reload" />
          </button>
        )}
      </div>
    </div>
  );

  const taskFromHistory =
    historyList.find((task) => Number(task.id) === Number(taskId)) ?? null;
  const taskForTargets = taskFromHistory ?? historyList[0] ?? null;
  const targetClasses = taskForTargets?.targets?.classes ?? [];

  const taskTargets = (
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
            handleAssignTask();
          }}
        >
          <Icon icon="hugeicons:task-add-01" />
        </button>
      </div>
      <div className="AnswerStatusMenu__task-classes">
        {targetClasses.length > 0 ? (
          targetClasses.map((cls) => (
            <span key={cls.id} className="AnswerStatusMenu__task-class-tag">
              {cls.name}
            </span>
          ))
        ) : (
          <span className="AnswerStatusMenu__task-empty">—</span>
        )}
      </div>
    </div>
  );

  // 渲染空状态
  if (!config) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        <div className="AnswerStatusMenu__empty">
          <p>答题情况功能未配置</p>
        </div>
      </div>
    );
  }

  const hasHistoryLoaded = historyState.data !== null;
  const hasHistoryTasks = historyList.length > 0;

  // 未关联课件或任务列表为空时，仅展示任务历史空态（不展示 tabs/刷新）
  if (!coursewareId || (!taskId && hasHistoryLoaded && !hasHistoryTasks)) {
    return (
      <div className="AnswerStatusMenu">
        <div className="AnswerStatusMenu__empty">
          <div className="AnswerStatusMenu__empty-icon" aria-hidden="true">
            <Icon icon="hugeicons:task-daily-01" />
          </div>
          <p>该课件尚未关联任何任务</p>
          <p className="AnswerStatusMenu__hint">
            点击下方按钮为该课件布置任务
          </p>
          <button
            type="button"
            className="AnswerStatusMenu__assign-btn"
            onClick={handleAssignTask}
          >
            <Icon icon="hugeicons:task-add-01" />
            布置任务
          </button>
        </div>
      </div>
    );
  }

  // 任务历史首次加载中
  if (!hasHistoryLoaded && historyState.loading) {
    return (
      <div className="AnswerStatusMenu">
        <div className="AnswerStatusMenu__loading">
          <div className="AnswerStatusMenu__spinner" />
          <p>加载中...</p>
        </div>
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
          <div className="AnswerStatusMenu__loading">
            <div className="AnswerStatusMenu__spinner" />
            <p>加载中...</p>
          </div>
        </div>
      );
    }

    // 错误状态
    if (historyState.error) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <div className="AnswerStatusMenu__error">
            <p>{historyState.error}</p>
            <button
              className="AnswerStatusMenu__retry-btn"
              onClick={fetchTaskHistory}
            >
              重试
            </button>
          </div>
        </div>
      );
    }

    // 任务历史列表
    const tasks = historyList;
    if (tasks.length === 0) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <div className="AnswerStatusMenu__empty">
            <div className="AnswerStatusMenu__empty-icon" aria-hidden="true">
              <Icon icon="hugeicons:task-daily-01" />
            </div>
            <p>该课件尚未关联任何任务</p>
            <p className="AnswerStatusMenu__hint">
              点击下方按钮为该课件布置任务
            </p>
            <button
              type="button"
              className="AnswerStatusMenu__assign-btn"
              onClick={handleAssignTask}
            >
              布置任务
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="AnswerStatusMenu">
        {header}
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

            return (
              <div key={task.id} className="AnswerStatusMenu__history-item">
                <div className="AnswerStatusMenu__history-title">
                  {task.title}
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
        <div className="AnswerStatusMenu__empty">
          <div className="AnswerStatusMenu__empty-icon" aria-hidden="true">
            <Icon icon="hugeicons:task-daily-01" />
          </div>
          <p>请在画布上选择一道题目</p>
          <p className="AnswerStatusMenu__hint">
            点击题目节点后，这里将显示学员的答题情况
          </p>
        </div>
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
        <div className="AnswerStatusMenu__error">
          <p>{state.error}</p>
          <button
            className="AnswerStatusMenu__retry-btn"
            onClick={handleRefresh}
          >
            重试
          </button>
        </div>
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
        <div className="AnswerStatusMenu__loading">
          <p>暂无答题数据</p>
        </div>
        {taskTargets}
      </div>
    );
  }

  // 统计各状态人数
  const correctCount = data.members.filter(
    (m) => m.answerStatus === "correct"
  ).length;
  const wrongCount = data.members.filter(
    (m) => m.answerStatus === "wrong"
  ).length;
  const unansweredCount = data.members.filter(
    (m) => m.answerStatus === "unanswered"
  ).length;
  const answeredCount = correctCount + wrongCount;
  const correctRateText =
    answeredCount > 0
      ? `${Math.round((correctCount / answeredCount) * 100)}%`
      : "--";

  // 按答案分组（过滤掉未答）
  const groupedAnswers = data.members.reduce((acc, member) => {
    if (!member.userAnswer) return acc;
    if (!acc[member.userAnswer]) {
      acc[member.userAnswer] = [];
    }
    acc[member.userAnswer].push(member);
    return acc;
  }, {} as Record<string, MemberAnswerStatus[]>);

  const defaultOptions = ["A", "B", "C", "D"];
  const optionSet = new Set([
    ...defaultOptions,
    data.correctOption,
    ...Object.keys(groupedAnswers),
  ]);

  // 排序选项：始终按 ABCD 顺序展示，额外选项按字母顺序追加
  const extraOptions = Array.from(optionSet)
    .filter((option) => !defaultOptions.includes(option))
    .sort((a, b) => a.localeCompare(b));
  const sortedOptions = [...defaultOptions, ...extraOptions];

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
          const members = groupedAnswers[option] ?? [];

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
                  {isCorrect && <span className="AnswerStatusMenu__card-badge">正确</span>}
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
