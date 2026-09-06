import { QuizQuestion, QuestionType, Word } from "./types";

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function normalizeAnswer(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** 英译汉判分：给出 3 个干扰释义（来自全库），返回 4 个选项 */
export function buildE2COptions(
  word: Word,
  distractorMeanings: string[]
): string[] {
  const correct = (word.meaning || "").trim();
  const distractors = shuffle(
    distractorMeanings.filter((m) => {
      const t = m.trim();
      return t && t !== correct;
    })
  ).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return options.length >= 2 ? options : [correct, "（暂无其他释义）"];
}

/** 汉译英判分：单词原形或任一词形变化均算对 */
export function checkC2E(word: Word, answer: string): boolean {
  const targets = [word.word, ...Object.values(word.forms || {})].map(normalizeAnswer);
  return targets.includes(normalizeAnswer(answer));
}

/** 词性变化判分 */
export function checkForm(word: Word, formKey: string, answer: string): boolean {
  const target = ((word.forms || {})[formKey] || "").trim();
  if (!target) return false;
  return normalizeAnswer(target) === normalizeAnswer(answer);
}

/** 取一个词的可用题型（词性变化需有 forms） */
export function availableTypes(word: Word): QuestionType[] {
  const types: QuestionType[] = [];
  if (word.meaning) types.push("e2c", "c2e");
  if (word.forms && Object.keys(word.forms).length > 0) types.push("form");
  return types;
}

export interface BuildQuestionsOptions {
  mode: "e2c" | "c2e" | "form" | "mixed";
  words: Word[];
  distractorMeanings: string[];
}

/** 按题型构造题目序列 */
export function buildQuestions(opts: BuildQuestionsOptions): QuizQuestion[] {
  const { mode, words, distractorMeanings } = opts;
  const questions: QuizQuestion[] = [];
  for (const word of words) {
    if (mode === "e2c") {
      if (!word.meaning) continue;
      questions.push({
        word,
        type: "e2c",
        options: buildE2COptions(word, distractorMeanings),
      });
    } else if (mode === "c2e") {
      if (!word.meaning) continue;
      questions.push({ word, type: "c2e" });
    } else if (mode === "form") {
      const keys = Object.keys(word.forms || {});
      if (!keys.length) continue;
      const formKey = keys[Math.floor(Math.random() * keys.length)];
      questions.push({ word, type: "form", formKey });
    } else {
      // mixed：随机混合可用题型
      const types = availableTypes(word);
      if (!types.length) continue;
      const t = types[Math.floor(Math.random() * types.length)];
      if (t === "e2c") {
        questions.push({
          word,
          type: "e2c",
          options: buildE2COptions(word, distractorMeanings),
        });
      } else if (t === "c2e") {
        questions.push({ word, type: "c2e" });
      } else {
        const keys = Object.keys(word.forms || {});
        const formKey = keys[Math.floor(Math.random() * keys.length)];
        questions.push({ word, type: "form", formKey });
      }
    }
  }
  return questions;
}
