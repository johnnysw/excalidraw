import { useCallback, useEffect, useMemo, useState } from "react";

export interface TaskHistoryItem {
  id: number;
  title: string;
  description?: string | null;
  status?: number;
  taskMode?: string;
  coursewareId?: number;
  moduleId?: number;
  taskDate?: string | null;
  timePeriod?: string | null;
  dueAt?: string | null;
  autoSubmitEnabled?: number;
  autoSubmitDurationSec?: number | null;
  createdTime?: string;
  targets: {
    classes: Array<{ id: number; name: string }>;
    members: Array<{ id: number; nickname?: string; username?: string }>;
  };
}

interface TaskHistoryState {
  loading: boolean;
  error: string | null;
  data: TaskHistoryItem[] | { list: TaskHistoryItem[] } | null;
}

interface UseTaskHistoryParams {
  coursewareId?: number;
  taskId?: number;
  fetchTaskHistoryByCourseware?: (
    coursewareId: number,
    page?: number,
    pageSize?: number,
  ) => Promise<{ list: TaskHistoryItem[] }>;
}

export const useTaskHistory = ({
  coursewareId,
  taskId,
  fetchTaskHistoryByCourseware,
}: UseTaskHistoryParams) => {
  const [historyState, setHistoryState] = useState<TaskHistoryState>({
    loading: false,
    error: null,
    data: null,
  });

  const fetchTaskHistory = useCallback(async () => {
    if (!coursewareId) return;
    if (!fetchTaskHistoryByCourseware) {
      setHistoryState({ loading: false, error: "缺少任务历史接口配置", data: null });
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
        error: err instanceof Error ? err.message : "获取任务历史失败",
        data: null,
      });
    }
  }, [coursewareId, fetchTaskHistoryByCourseware]);

  useEffect(() => {
    setHistoryState({ loading: false, error: null, data: null });
  }, [coursewareId]);

  const historyList = useMemo(
    () =>
      Array.isArray(historyState.data)
        ? historyState.data
        : historyState.data?.list ?? [],
    [historyState.data],
  );

  const defaultTaskId = historyList[0]?.id ?? null;
  const defaultModuleId = historyList[0]?.moduleId ?? null;
  const hasTaskInHistory = !!taskId && historyList.some((item) => Number(item.id) === Number(taskId));
  const hasHistoryLoaded = historyState.data !== null;

  useEffect(() => {
    if (coursewareId && !hasHistoryLoaded && !historyState.loading) {
      fetchTaskHistory();
    }
  }, [coursewareId, hasHistoryLoaded, historyState.loading, fetchTaskHistory]);

  useEffect(() => {
    if (!coursewareId || !taskId) return;
    if (historyState.loading) return;

    if (!hasHistoryLoaded || !hasTaskInHistory) {
      fetchTaskHistory();
    }
  }, [coursewareId, taskId, hasHistoryLoaded, hasTaskInHistory, historyState.loading, fetchTaskHistory]);

  return {
    historyState,
    historyList,
    defaultTaskId,
    defaultModuleId,
    fetchTaskHistory,
  };
};
