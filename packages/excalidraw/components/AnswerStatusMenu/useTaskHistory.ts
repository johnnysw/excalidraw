import { useCallback, useEffect, useMemo, useState } from "react";
import type { TeachingContext } from "../../context/answer-status";

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
  teachingContext?: TeachingContext | null;
  fetchTaskHistoryByCourseware?: (
    coursewareId: number,
    page?: number,
    pageSize?: number,
  ) => Promise<{ list: TaskHistoryItem[] }>;
}

export const useTaskHistory = ({
  coursewareId,
  taskId,
  teachingContext,
  fetchTaskHistoryByCourseware,
}: UseTaskHistoryParams) => {
  const [historyState, setHistoryState] = useState<TaskHistoryState>({
    loading: false,
    error: null,
    data: null,
  });
  const [statusOverrides, setStatusOverrides] = useState<Record<number, number>>({});
  const [statusUpdating, setStatusUpdating] = useState<Record<number, boolean>>({});

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
    setStatusOverrides({});
    setStatusUpdating({});
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
  const hasHistoryTasks = historyList.length > 0;
  const taskFromHistory =
    historyList.find((task) => Number(task.id) === Number(taskId)) ?? null;
  const taskForTargets = taskFromHistory ?? historyList[0] ?? null;
  const targetClasses = taskForTargets?.targets?.classes ?? [];

  const toggleTaskStatus = useCallback(
    (task: TaskHistoryItem, currentStatus: number) => {
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
            coursewareId: task.coursewareId ?? coursewareId ?? undefined,
          },
          nextStatus,
          previousStatus: currentStatus,
          teachingContext: teachingContext || null,
          coursewareId: task.coursewareId ?? coursewareId ?? undefined,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    },
    [coursewareId, teachingContext],
  );

  useEffect(() => {
    const handleStatusUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { taskId?: number; status?: number }
        | undefined;
      const updatedTaskId = detail?.taskId;
      if (!updatedTaskId) return;
      if (typeof detail?.status === "number") {
        setStatusOverrides((prev) => ({ ...prev, [updatedTaskId]: detail.status as number }));
      }
      setStatusUpdating((prev) => ({ ...prev, [updatedTaskId]: false }));
    };

    const handleStatusUpdateFailed = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { taskId?: number; previousStatus?: number }
        | undefined;
      const updatedTaskId = detail?.taskId;
      if (!updatedTaskId) return;
      if (typeof detail?.previousStatus === "number") {
        setStatusOverrides((prev) => ({ ...prev, [updatedTaskId]: detail.previousStatus as number }));
      }
      setStatusUpdating((prev) => ({ ...prev, [updatedTaskId]: false }));
    };

    document.addEventListener("excalidraw:taskStatusUpdated", handleStatusUpdated);
    document.addEventListener("excalidraw:taskStatusUpdateFailed", handleStatusUpdateFailed);
    return () => {
      document.removeEventListener("excalidraw:taskStatusUpdated", handleStatusUpdated);
      document.removeEventListener("excalidraw:taskStatusUpdateFailed", handleStatusUpdateFailed);
    };
  }, []);

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
    hasHistoryLoaded,
    hasHistoryTasks,
    taskFromHistory,
    taskForTargets,
    targetClasses,
    statusOverrides,
    statusUpdating,
    toggleTaskStatus,
    fetchTaskHistory,
  };
};
