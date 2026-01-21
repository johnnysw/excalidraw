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
  status: number;
  taskDate: string | null;
  targets: {
    classes: Array<{ id: number; name: string }>;
    members: Array<{ id: number; nickname?: string; username?: string }>;
  };
}

interface TaskHistoryState {
  loading: boolean;
  error: string | null;
  data: TaskHistoryItem[] | null;
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
  const teachingContext = config?.teachingContext;
  const classes = config?.classes ?? [];
  const classesLoading = config?.classesLoading ?? false;
  const selectedClassId = config?.selectedClassId ?? null;
  const onSelectClassId = config?.onSelectClassId;
  const coursewareId = teachingContext?.coursewareId;
  const taskId = teachingContext?.taskId;

  const handleAssignTask = useCallback(() => {
    const event = new CustomEvent("excalidraw:assignTask", {
      detail: {
        source: "answer-status",
        teachingContext: teachingContext || null,
        coursewareId: teachingContext?.coursewareId,
      },
      bubbles: true,
    });
    document.dispatchEvent(event);
  }, [teachingContext]);

  // 获取任务历史
  const fetchTaskHistory = useCallback(async () => {
    if (!coursewareId) return;

    setHistoryState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(
        `/api/tasks/practice/history-by-courseware?courseware_id=${coursewareId}&page=1&page_size=50`
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || '获取任务历史失败');
      }
      const list = result?.data?.list ?? result?.list ?? [];
      setHistoryState({ loading: false, error: null, data: list });
    } catch (err) {
      setHistoryState({
        loading: false,
        error: err instanceof Error ? err.message : '获取任务历史失败',
        data: null,
      });
    }
  }, [coursewareId]);

  // 课件变更时重置任务历史
  useEffect(() => {
    setHistoryState({ loading: false, error: null, data: null });
  }, [coursewareId]);

  // 任务建立后刷新历史并切换到答题情况
  useEffect(() => {
    if (taskId) {
      setActiveTab('answer');
      fetchTaskHistory();
    }
  }, [taskId, fetchTaskHistory]);

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

  const hasClassSelection = classes.length === 0 || selectedClassId !== null;
  const canRefresh =
    !!selectedQuestion?.questionId &&
    !!fetchQuestionAnswerStatus &&
    !!teachingContext?.taskId &&
    hasClassSelection;

  // 手动刷新按钮调用
  const handleRefresh = useCallback(async () => {
    const questionId = selectedQuestion?.questionId;
    const fetchFn = fetchFnRef.current;
    if (!questionId || !fetchFn) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await fetchFn(questionId);
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
    const questionId = selectedQuestion?.questionId;
    const fetchFn = fetchFnRef.current;

    // 未选题：清空，并允许下次选中同题再次自动拉取
    if (!questionId) {
      lastAutoFetchedQuestionIdRef.current = null;
      setState({ loading: false, error: null, data: null });
      return;
    }

    // 检查是否可以自动请求
    const hasContext = !!teachingContext?.taskId;
    if (!fetchFn || !hasContext) {
      // 缺少上下文或 API：清空数据，不自动请求
      lastAutoFetchedQuestionIdRef.current = null;
      setState({ loading: false, error: null, data: null });
      return;
    }

    const classKey = selectedClassId ?? "all";
    const questionKey = `${questionId}-${classKey}`;

    // 同一题目在同一班级下只自动拉取一次（避免 StrictMode 双触发 & 刷新后不重复触发）
    if (lastAutoFetchedQuestionIdRef.current === questionKey) return;
    lastAutoFetchedQuestionIdRef.current = questionKey;

    // 自动拉取
    setState({ loading: true, error: null, data: null });
    fetchFn(questionId)
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
  }, [selectedQuestion?.questionId, teachingContext?.taskId, selectedClassId]);

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
    </div>
  );

  const answerToolbar = (
    <div className="AnswerStatusMenu__answer-toolbar">
      <div className="AnswerStatusMenu__class-switcher">
        <span className="AnswerStatusMenu__class-label">班级</span>
        <div className="AnswerStatusMenu__class-control">
          {classesLoading ? (
            <span className="AnswerStatusMenu__class-loading">加载中...</span>
          ) : (
            <select
              className="AnswerStatusMenu__class-select"
              value={selectedClassId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                if (!onSelectClassId) return;
                onSelectClassId(value ? Number(value) : null);
              }}
              disabled={classes.length === 0}
            >
              {classes.length === 0 && <option value="">暂无班级</option>}
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
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
  const hasHistoryTasks = (historyState.data?.length ?? 0) > 0;

  // 未关联课件或任务列表为空时，仅展示任务历史空态（不展示 tabs/刷新）
  if (!coursewareId || (!taskId && hasHistoryLoaded && !hasHistoryTasks)) {
    return (
      <div className="AnswerStatusMenu">
        <div className="AnswerStatusMenu__empty">
          <div className="AnswerStatusMenu__empty-icon">📋</div>
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
    const tasks = historyState.data || [];
    if (tasks.length === 0) {
      return (
        <div className="AnswerStatusMenu">
          {header}
          <div className="AnswerStatusMenu__empty">
            <div className="AnswerStatusMenu__empty-icon">📋</div>
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
          {tasks.map((task) => (
            <div key={task.id} className="AnswerStatusMenu__history-item">
              <div className="AnswerStatusMenu__history-title">{task.title}</div>
              <div className="AnswerStatusMenu__history-classes">
                {task.targets.classes.map((cls) => (
                  <span key={cls.id} className="AnswerStatusMenu__class-tag">
                    {cls.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 渲染未选中题目状态
  if (!selectedQuestion) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        {answerToolbar}
        <div className="AnswerStatusMenu__empty">
          <div className="AnswerStatusMenu__empty-icon" aria-hidden="true">
            <Icon icon="hugeicons:clipboard" />
          </div>
          <p>请在画布上选择一道题目</p>
          <p className="AnswerStatusMenu__hint">
            点击题目节点后，这里将显示学员的答题情况
          </p>
        </div>
      </div>
    );
  }

  // 已选中题目，但缺少授课上下文/未注入 API（避免触发后端 422）
  if (!fetchQuestionAnswerStatus || !teachingContext?.taskId) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        {answerToolbar}
        <div className="AnswerStatusMenu__empty">
          <div className="AnswerStatusMenu__empty-icon">🎓</div>
          <p>缺少授课上下文</p>
          <p className="AnswerStatusMenu__hint">
            请通过「开始授课」进入画布，或确保已传入 task_id
          </p>
          {!teachingContext?.taskId && (
            <button
              type="button"
              className="AnswerStatusMenu__assign-btn"
              onClick={handleAssignTask}
            >
              布置任务
            </button>
          )}
        </div>
      </div>
    );
  }

  // 渲染加载状态
  if (state.loading) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        {answerToolbar}
        <div className="AnswerStatusMenu__loading">
          <div className="AnswerStatusMenu__spinner" />
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (state.error) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        {answerToolbar}
        <div className="AnswerStatusMenu__error">
          <p>{state.error}</p>
          <button
            className="AnswerStatusMenu__retry-btn"
            onClick={handleRefresh}
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // 渲染答题状态列表
  const { data } = state;
  if (!data) {
    return (
      <div className="AnswerStatusMenu">
        {header}
        {answerToolbar}
        <div className="AnswerStatusMenu__loading">
          <p>暂无答题数据</p>
        </div>
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

  // 排序选项：优先显示正确选项，其他按默认顺序/字母顺序
  const sortedOptions = Array.from(optionSet).sort((a, b) => {
    if (a === data.correctOption) return -1;
    if (b === data.correctOption) return 1;
    const aIndex = defaultOptions.indexOf(a);
    const bIndex = defaultOptions.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="AnswerStatusMenu">
      {header}
      {answerToolbar}
      {/* 统计概览 */}
      <div className="AnswerStatusMenu__summary">
        <div className="AnswerStatusMenu__summary-item">
          <span className="AnswerStatusMenu__summary-label">总人数</span>
          <span className="AnswerStatusMenu__summary-value">
            {data.totalStudents}
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
        <div className="AnswerStatusMenu__summary-item AnswerStatusMenu__summary-item--unanswered">
          <span className="AnswerStatusMenu__summary-label">未答</span>
          <span className="AnswerStatusMenu__summary-value">
            {unansweredCount}
          </span>
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
    </div>
  );
};
