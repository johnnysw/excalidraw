import React from "react";

export interface SelectedQuestionInfo {
  questionId: string;
  elementId: string;
}

export interface MemberAnswerStatus {
  memberId: number;
  nickname: string;
  userAnswer: string | null;
  answerStatus: "correct" | "wrong" | "unanswered";
}

export interface QuestionAnswerStatusResponse {
  questionId: string;
  correctOption: string;
  totalStudents: number;
  members: MemberAnswerStatus[];
}

export interface TeachingClassInfo {
  id: number;
  name: string;
  studentCount?: number;
}

export interface TeachingContext {
  coursewareId?: number;
  moduleId?: number;
  paperId?: number;
  taskId?: number;
}

export interface AnswerStatusConfig {
  /** 当前选中的题目节点信息 */
  selectedQuestion: SelectedQuestionInfo | null;
  /** 获取题目答题状态的 API 函数 */
  fetchQuestionAnswerStatus?: (
    questionId: string,
    taskId?: number | null
  ) => Promise<QuestionAnswerStatusResponse>;
  /** 获取课件任务历史 */
  fetchTaskHistoryByCourseware?: (
    coursewareId: number,
    page?: number,
    pageSize?: number
  ) => Promise<{ list: any[] }>;
  /** 授课上下文 */
  teachingContext?: TeachingContext;
}

export const AnswerStatusContext = React.createContext<
  AnswerStatusConfig | undefined
>(undefined);

export const useAnswerStatus = () => React.useContext(AnswerStatusContext);
