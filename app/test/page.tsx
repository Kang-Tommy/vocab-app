"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Btn, Card, Empty, Spinner, inputCls } from "@/components/ui";
import { isSupabaseConfigured, requireSupabase, todayStartISO } from "@/lib/supabase";
import { buildQuestions, checkC2E, checkForm, shuffle } from "@/lib/test";
import {
  QUESTION_TYPE_LABELS,
  QuizQuestion,
  QuizResultItem,
  SCOPE_LABELS,
  TestMode,
  TEST_MODE_LABELS,
  Word,
  WordList,
} from "@/lib/types";

type Phase = "setup" | "quiz" | "result";

const SCOPES: { value: string; label: string; desc: string }[] = [
  { value: "today", label: "今日新增", desc: "当天导入的生词" },
  { value: "new", label: "全部生词", desc: "生词表中的所有词" },
  { value: "known", label: "全部熟词", desc: "熟词表中的所有词" },
  { value: "all", label: "全部单词（全考察）", desc: "生词 + 熟词混合随机" },
  { value: "list", label: "按分组", desc: "选择某个分组" },
  { value: "selected", label: "已选单词", desc: "在词库中勾选的词" },
];

const MODES: { value: TestMode; label: string; desc: string }[] = [
  { value: "e2c", label: "英译汉", desc: "看单词选释义" },
  { value: "c2e", label: "汉译英", desc: "看释义拼单词" },
  { value: "form", label: "词性变化", desc: "考复数 / 过去式等" },
  { value: "mixed", label: "随机混合", desc: "三种题型随机出" },
];

export default function TestPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [scope, setScope] = useState("new");
  const [mode, setMode] = useState<TestMode>("mixed");
  const [limitMode, setLimitMode] = useState<"all" | "n">("all");
  const [limitN, setLimitN] = useState(10);
  const [listId, setListId] = useState("");
  const [lists, setLists] = useState<WordList[]>([]);
  const [configured, setConfigured] = useState(isSupabaseConfigured);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<(QuizResultItem | null)[]>([]);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scopeLabel, setScopeLabel] = useState("");
  const [wrongWords, setWrongWords] = useState<Word[]>([]);

  useEffect(() => {
    if (!configured) return;
    requireSupabase()
      .from("lists")
      .select("*")
      .order("created_at", { ascending: true })
      .then((res) => {
        if (!res.error) setLists((res.data ?? []) as WordList[]);
      });
  }, [configured]);

  // 从词库页带过来的已选单词
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scope") === "selected") {
      setScope("selected");
      const raw = sessionStorage.getItem("vocab-test-selection");
      if (!raw) setError("没有找到已选单词，请先在词库页勾选");
      sessionStorage.removeItem("vocab-test-selection");
    }
  }, []);

  const start = async () => {
    setLoading(true);
    setError("");
    try {
      const db = requireSupabase();
      let query = db.from("words").select("*");
      if (scope === "today") query = query.gte("created_at", todayStartISO());
      else if (scope === "new") query = query.eq("status", "new");
      else if (scope === "known") query = query.eq("status", "known");
      else if (scope === "list") {
        if (!listId) throw new Error("请先选择分组");
        query = query.eq("list_id", listId);
      } else if (scope === "selected") {
        const raw = sessionStorage.getItem("vocab-test-selection");
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.length) throw new Error("没有找到已选单词，请先在词库页勾选");
        query = query.in("id", ids);
      }
      const { data, error: err } = await query;
      if (err) throw err;
      let pool = (data ?? []) as Word[];

      // 题量限制：先随机打乱再截取
      if (limitMode === "n" && limitN > 0 && pool.length > limitN) {
        pool = shuffle(pool).slice(0, limitN);
      }

      // 词性变化模式需要 forms
      if (mode === "form") {
        pool = pool.filter((w) => w.forms && Object.keys(w.forms).length > 0);
        if (!pool.length) throw new Error("当前范围的单词都没有词形变化数据，无法出词性变化题");
      }

      const { data: meaningRows } = await db.from("words").select("meaning");
      const distractorMeanings = (meaningRows ?? [])
        .map((r) => (r.meaning as string) || "")
        .filter(Boolean);

      const qs = buildQuestions({ mode, words: pool, distractorMeanings });
      if (!qs.length) throw new Error("当前范围没有可出题的单词，请先导入或换一个范围");

      let label = SCOPE_LABELS[scope] ?? scope;
      if (scope === "list") label = `分组：${lists.find((l) => l.id === listId)?.name ?? ""}`;

      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setIndex(0);
      setTyped("");
      setScopeLabel(label);
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "出题失败");
    } finally {
      setLoading(false);
    }
  };

  const answerCurrent = (answer: string, correct: boolean) => {
    setAnswers((arr) => {
      const next = [...arr];
      next[index] = { question: questions[index], userAnswer: answer, correct };
      return next;
    });
  };

  const submitE2C = (option: string) => {
    if (answers[index]) return;
    const correct = option === questions[index].word.meaning;
    answerCurrent(option, correct);
  };

  const submitTyped = () => {
    if (answers[index]) return;
    const q = questions[index];
    if (!typed.trim()) return;
    let correct = false;
    if (q.type === "c2e") correct = checkC2E(q.word, typed);
    else if (q.type === "form" && q.formKey) correct = checkForm(q.word, q.formKey, typed);
    answerCurrent(typed, correct);
  };

  const next = () => {
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setTyped("");
    } else {
      finish();
    }
  };

  const finish = async () => {
    const results = answers.filter(Boolean) as QuizResultItem[];
    const total = questions.length;
    const correct = results.filter((r) => r.correct).length;
    const db = requireSupabase();
    try {
      const tRes = await db
        .from("tests")
        .insert({ mode, scope: scopeLabel, total, correct })
        .select("id")
        .single();
      if (tRes.error) throw tRes.error;
      const testId = tRes.data.id;
      const records = results.map((r) => ({
        test_id: testId,
        word_id: r.question.word.id,
        question_type: r.question.type,
        correct: r.correct,
      }));
      if (records.length) {
        const rec = await db.from("test_records").insert(records);
        if (rec.error) throw rec.error;
      }
      // 更新单词统计：考过的 +1 复习，答错的 +1 错误
      const quizzedIds = [...new Set(results.map((r) => r.question.word.id))];
      const wrongIds = [...new Set(results.filter((r) => !r.correct).map((r) => r.question.word.id))];
      if (quizzedIds.length) {
        await db.rpc("increment_word_counts", { ids: quizzedIds, wrong_ids: wrongIds }).then((r) => {
          if (r.error) {
            // RPC 不存在时降级为逐条更新
            return Promise.all([
              db.from("words").select("id, review_count, wrong_count").in("id", quizzedIds),
            ]).then(async ([res]) => {
              const rows = (res.data ?? []) as { id: string; review_count: number; wrong_count: number }[];
              for (const row of rows) {
                await db
                  .from("words")
                  .update({
                    review_count: (row.review_count || 0) + 1,
                    wrong_count: (row.wrong_count || 0) + (wrongIds.includes(row.id) ? 1 : 0),
                  })
                  .eq("id", row.id);
              }
            });
          }
        });
      }
      setWrongWords([...new Set(results.filter((r) => !r.correct).map((r) => r.question.word))]);
      setPhase("result");
    } catch (e) {
      // 统计写入失败不阻塞看成绩
      console.error(e);
      setWrongWords([...new Set(results.filter((r) => !r.correct).map((r) => r.question.word))]);
      setPhase("result");
    }
  };

  const retryWrong = async () => {
    if (!wrongWords.length) return;
    setLoading(true);
    try {
      const db = requireSupabase();
      const { data: meaningRows } = await db.from("words").select("meaning");
      const distractorMeanings = (meaningRows ?? [])
        .map((r) => (r.meaning as string) || "")
        .filter(Boolean);
      const qs = buildQuestions({ mode, words: wrongWords, distractorMeanings });
      if (!qs.length) throw new Error("错题无法出题");
      setQuestions(qs);
      setAnswers(new Array(qs.length).fill(null));
      setIndex(0);
      setTyped("");
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "重测失败");
    } finally {
      setLoading(false);
    }
  };

  if (!configured) {
    return (
      <Card>
        <div className="text-sm text-gray-600">数据库未配置，请先完成 Supabase 与环境变量设置。</div>
      </Card>
    );
  }

  /* ============ 配置阶段 ============ */
  if (phase === "setup") {
    return (
      <div className="space-y-4">
        <Card>
          <div className="mb-3 text-base font-semibold">测试范围</div>
          <div className="grid grid-cols-2 gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => setScope(s.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  scope === s.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-black/10 bg-white hover:border-blue-300"
                }`}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="mt-0.5 text-xs text-gray-400">{s.desc}</div>
              </button>
            ))}
          </div>
          {scope === "list" && (
            <select className={`${inputCls} mt-3`} value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">选择分组…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          {scope === "selected" && error && (
            <div className="mt-2 text-xs text-red-600">{error}</div>
          )}
        </Card>

        <Card>
          <div className="mb-3 text-base font-semibold">题型</div>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  mode === m.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-black/10 bg-white hover:border-blue-300"
                }`}
              >
                <div className="text-sm font-medium">{m.label}</div>
                <div className="mt-0.5 text-xs text-gray-400">{m.desc}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-3 text-base font-semibold">题量</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLimitMode("all")}
              className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                limitMode === "all" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-black/10"
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setLimitMode("n")}
              className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${
                limitMode === "n" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-black/10"
              }`}
            >
              随机抽
            </button>
            {limitMode === "n" && (
              <input
                type="number"
                min={1}
                max={200}
                className={`${inputCls} w-24`}
                value={limitN}
                onChange={(e) => setLimitN(Math.max(1, Number(e.target.value) || 1))}
              />
            )}
          </div>
        </Card>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <Btn onClick={start} disabled={loading} className="w-full py-3 text-base">
          {loading ? "出题中…" : "开始测试"}
        </Btn>
      </div>
    );
  }

  /* ============ 答题阶段 ============ */
  if (phase === "quiz") {
    const q = questions[index];
    const answered = answers[index];
    const progress = Math.round((index / questions.length) * 100);
    return (
      <div className="space-y-4">
        <Card className="p-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {index + 1} / {questions.length}
            </span>
            <span>{TEST_MODE_LABELS[mode]}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </Card>

        <Card className="py-8">
          {/* 题干 */}
          {q.type === "e2c" && (
            <div className="text-center">
              <div className="text-3xl font-bold tracking-wide">{q.word.word}</div>
              {q.word.phonetic && <div className="mt-2 text-sm text-gray-400">{q.word.phonetic}</div>}
              {q.word.pos && <div className="mt-1 text-xs text-gray-400">[{q.word.pos}]</div>}
              <div className="mt-1 text-xs text-gray-400">请选择正确的中文释义</div>
            </div>
          )}
          {q.type === "c2e" && (
            <div className="text-center">
              <div className="text-2xl font-bold leading-relaxed">{q.word.meaning}</div>
              {q.word.pos && <div className="mt-2 text-xs text-gray-400">[{q.word.pos}]</div>}
              <div className="mt-1 text-xs text-gray-400">请输入对应的英文单词</div>
            </div>
          )}
          {q.type === "form" && (
            <div className="text-center">
              <div className="text-3xl font-bold tracking-wide">{q.word.word}</div>
              <div className="mt-2 text-sm text-gray-500">写出它的「{q.formKey}」</div>
            </div>
          )}

          {/* 作答区 */}
          <div className="mt-8">
            {q.type === "e2c" ? (
              <div className="grid gap-2.5">
                {q.options?.map((opt) => {
                  const isCorrect = opt === q.word.meaning;
                  const isChosen = answered?.userAnswer === opt;
                  let cls = "border-black/10 bg-white hover:border-blue-400";
                  if (answered) {
                    if (isCorrect) cls = "border-emerald-500 bg-emerald-50 text-emerald-800";
                    else if (isChosen) cls = "border-red-400 bg-red-50 text-red-700";
                    else cls = "border-black/5 bg-white opacity-60";
                  }
                  return (
                    <button
                      key={opt}
                      disabled={!!answered}
                      onClick={() => submitE2C(opt)}
                      className={`min-h-[48px] rounded-xl border px-4 py-3 text-left text-sm transition-colors ${cls}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  className={`${inputCls} py-3 text-center text-lg tracking-wide`}
                  placeholder="输入答案"
                  value={typed}
                  disabled={!!answered}
                  autoFocus
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (!answered) submitTyped();
                      else next();
                    }
                  }}
                />
                {answered && (
                  <div
                    className={`rounded-xl p-3 text-center text-sm ${
                      answered.correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {answered.correct
                      ? "回答正确"
                      : q.type === "c2e"
                        ? `正确答案：${q.word.word}`
                        : `正确答案：${(q.word.forms || {})[q.formKey || ""] || ""}`}
                  </div>
                )}
                <Btn
                  onClick={answered ? next : submitTyped}
                  disabled={!answered && !typed.trim()}
                  className="w-full"
                >
                  {index + 1 >= questions.length ? "查看结果" : answered ? "下一题" : "提交答案"}
                </Btn>
              </div>
            )}
          </div>

          {/* e2c 的下一题按钮 */}
          {q.type === "e2c" && answered && (
            <div className="mt-4">
              <Btn onClick={next} className="w-full">
                {index + 1 >= questions.length ? "查看结果" : "下一题"}
              </Btn>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* ============ 结果阶段 ============ */
  const results = answers.filter(Boolean) as QuizResultItem[];
  const total = questions.length;
  const correct = results.filter((r) => r.correct).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const wrong = results.filter((r) => !r.correct);
  const message = pct >= 90 ? "非常棒！" : pct >= 70 ? "不错，继续加油！" : pct >= 50 ? "还需要多复习哦" : "别灰心，把错题过一遍！";

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <div className={`text-5xl font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500"}`}>
          {pct}%
        </div>
        <div className="mt-2 text-sm text-gray-500">
          {correct} / {total} 题正确 · {message}
        </div>
        <div className="mt-1 text-xs text-gray-400">
          {scopeLabel} · {TEST_MODE_LABELS[mode]}
        </div>
      </Card>

      {wrong.length > 0 ? (
        <Card>
          <div className="mb-3 text-base font-semibold">错题回顾（{wrong.length}）</div>
          <div className="space-y-3">
            {wrong.map((r, i) => (
              <div key={i} className="rounded-xl bg-red-50/60 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.question.word.word}</span>
                  <span className="text-xs text-gray-400">{QUESTION_TYPE_LABELS[r.question.type]}</span>
                </div>
                <div className="mt-1 text-gray-600">
                  {r.question.type === "e2c" ? (
                    <>释义：{r.question.word.meaning}</>
                  ) : r.question.type === "c2e" ? (
                    <>
                      释义：{r.question.word.meaning} → 你的答案：{r.userAnswer || "（未作答）"}
                    </>
                  ) : (
                    <>
                      {r.question.formKey}：{(r.question.word.forms || {})[r.question.formKey || ""]}（你的答案：{r.userAnswer || "未作答"}）
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="text-center text-sm text-gray-500">全部正确，太强了！</Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Btn variant="secondary" onClick={() => setPhase("setup")}>
          再测一遍
        </Btn>
        <Btn variant="primary" onClick={retryWrong} disabled={!wrong.length}>
          重测错题（{wrong.length}）
        </Btn>
      </div>
      <Link href="/words" className="block text-center text-sm text-gray-400">
        去词库管理
      </Link>
    </div>
  );
}
