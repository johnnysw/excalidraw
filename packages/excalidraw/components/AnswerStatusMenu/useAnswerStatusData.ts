import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import type { QuestionAnswerStatusResponse } from "../../context/answer-status";

interface AnswerStatusState {
  loading: boolean;
  error: string | null;
  data: QuestionAnswerStatusResponse | null;
}

interface UseAnswerStatusParams {
  selectedQuestionId?: string | null;
  teachingTaskId?: number;
  defaultTaskId?: number | null;
  fetchQuestionAnswerStatus?: (
    questionId: string,
    taskId?: number | null
  ) => Promise<QuestionAnswerStatusResponse>;
}

export const useAnswerStatusData = ({
  selectedQuestionId,
  teachingTaskId,
  defaultTaskId,
  fetchQuestionAnswerStatus,
}: UseAnswerStatusParams) => {
  const [state, setState] = useState<AnswerStatusState>({
    loading: false,
    error: null,
    data: null,
  });

  const lastAutoFetchedQuestionIdRef = useRef<string | null>(null);
  const fetchFnRef = useRef(fetchQuestionAnswerStatus);
  fetchFnRef.current = fetchQuestionAnswerStatus;

  const derivedTaskId = teachingTaskId ?? defaultTaskId ?? null;
  const canRefresh = !!selectedQuestionId && !!derivedTaskId;

  const fetchAnswerStatus = useCallback(
    async (questionId: string) => {
      const fetchFn = fetchFnRef.current;
      if (fetchFn) {
        return fetchFn(questionId, derivedTaskId);
      }

      if (!derivedTaskId) return null;

      const params = new URLSearchParams({ question_id: questionId });
      params.set("task_id", String(derivedTaskId));

      const response = await fetch(`/api/tasks/question-answer-status?${params.toString()}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "获取答题情况失败");
      }
      return result?.data ?? null;
    },
    [derivedTaskId, teachingTaskId],
  );

  const refresh = useCallback(async () => {
    if (!selectedQuestionId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const data = await fetchAnswerStatus(selectedQuestionId);
      setState(() => ({ loading: false, error: null, data }));
    } catch (err) {
      setState(() => ({
        loading: false,
        error: err instanceof Error ? err.message : "获取答题情况失败",
        data: null,
      }));
    }
  }, [selectedQuestionId, fetchAnswerStatus]);

  useEffect(() => {
    if (!selectedQuestionId) {
      lastAutoFetchedQuestionIdRef.current = null;
      setState(() => ({ loading: false, error: null, data: null }));
      return;
    }

    if (!derivedTaskId) {
      lastAutoFetchedQuestionIdRef.current = null;
      setState(() => ({ loading: false, error: null, data: null }));
      return;
    }

    const questionKey = `${derivedTaskId}:${selectedQuestionId}`;
    if (lastAutoFetchedQuestionIdRef.current === questionKey) return;
    lastAutoFetchedQuestionIdRef.current = questionKey;

    setState(() => ({ loading: true, error: null, data: null }));
    fetchAnswerStatus(selectedQuestionId)
      .then((data) => {
        setState(() => ({ loading: false, error: null, data }));
      })
      .catch((err) => {
        setState(() => ({
          loading: false,
          error: err instanceof Error ? err.message : "获取答题情况失败",
          data: null,
        }));
      });
  }, [selectedQuestionId, derivedTaskId, fetchAnswerStatus]);

  return useMemo(
    () => ({
      state,
      derivedTaskId,
      canRefresh,
      refresh,
    }),
    [state, derivedTaskId, canRefresh, refresh],
  );
};
