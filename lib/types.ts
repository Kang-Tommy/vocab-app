export type WordStatus = "new" | "known";

export interface Word {
  id: string;
  word: string;
  word_key: string;
  phonetic: string | null;
  pos: string | null;
  meaning: string | null;
  forms: Record<string, string>;
  status: WordStatus;
  list_id: string | null;
  review_count: number;
  wrong_count: number;
  created_at: string;
}

export interface WordList {
  id: string;
  name: string;
  created_at: string;
}

export interface TestSession {
  id: string;
  mode: string;
  scope: string;
  total: number;
  correct: number;
  created_at: string;
}

export type QuestionType = "e2c" | "c2e" | "form";

export interface QuizQuestion {
  word: Word;
  type: QuestionType;
  formKey?: string;
  options?: string[];
}

export interface QuizResultItem {
  question: QuizQuestion;
  userAnswer: string;
  correct: boolean;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  e2c: "英译汉",
  c2e: "汉译英",
  form: "词性变化",
};

export type TestMode = QuestionType | "mixed";

export const TEST_MODE_LABELS: Record<TestMode, string> = {
  e2c: "英译汉",
  c2e: "汉译英",
  form: "词性变化",
  mixed: "随机混合",
};

export const SCOPE_LABELS: Record<string, string> = {
  today: "今日新增",
  new: "全部生词",
  known: "全部熟词",
  all: "全部单词（全考察）",
  selected: "已选单词",
};

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
