"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card, Empty, Field, Modal, Spinner, Tag, inputCls } from "@/components/ui";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { Word, WordList, WordStatus, formatDateShort } from "@/lib/types";

const PAGE_SIZE = 20;

interface EditDraft {
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  formsText: string;
}

export default function WordsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<WordStatus>("new");
  const [words, setWords] = useState<Word[]>([]);
  const [lists, setLists] = useState<WordList[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Word | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("not-configured");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const db = requireSupabase();
      const [w, l] = await Promise.all([
        db.from("words").select("*").order("created_at", { ascending: false }),
        db.from("lists").select("*").order("created_at", { ascending: true }),
      ]);
      if (w.error) throw w.error;
      setWords((w.data ?? []) as Word[]);
      setLists((l.data ?? []) as WordList[]);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words.filter((w) => {
      if (w.status !== tab) return false;
      if (listFilter && w.list_id !== listFilter) return false;
      if (q) {
        const hit = w.word.toLowerCase().includes(q) || (w.meaning || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [words, tab, search, listFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageWords = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, search, listFilter]);

  const listName = (id: string | null) => lists.find((l) => l.id === id)?.name;

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const setStatus = async (id: string, status: WordStatus) => {
    setBusyId(id);
    try {
      const db = requireSupabase();
      const res = await db.from("words").update({ status }).eq("id", id);
      if (res.error) throw res.error;
      setWords((ws) => ws.map((w) => (w.id === id ? { ...w, status } : w)));
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusyId("");
    }
  };

  const batchSetStatus = async (status: WordStatus) => {
    if (!selected.size) return;
    const ids = [...selected];
    try {
      const db = requireSupabase();
      const res = await db.from("words").update({ status }).in("id", ids);
      if (res.error) throw res.error;
      setWords((ws) => ws.map((w) => (ids.includes(w.id) ? { ...w, status } : w)));
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "批量操作失败");
    }
  };

  const removeWord = async (w: Word) => {
    if (!confirm(`确定删除 “${w.word}” 吗？此操作不可恢复。`)) return;
    try {
      const db = requireSupabase();
      const res = await db.from("words").delete().eq("id", w.id);
      if (res.error) throw res.error;
      setWords((ws) => ws.filter((x) => x.id !== w.id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  };

  const openEdit = (w: Word) => {
    setEditing(w);
    setDraft({
      word: w.word,
      phonetic: w.phonetic || "",
      pos: w.pos || "",
      meaning: w.meaning || "",
      formsText: Object.entries(w.forms || {})
        .map(([k, v]) => `${k}:${v}`)
        .join(";"),
    });
  };

  const saveEdit = async () => {
    if (!editing || !draft) return;
    if (!draft.word.trim() || !draft.meaning.trim()) {
      alert("单词和释义不能为空");
      return;
    }
    const forms: Record<string, string> = {};
    draft.formsText
      .split(/[;；]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pair) => {
        const idx = pair.indexOf(":");
        if (idx > 0) {
          const k = pair.slice(0, idx).trim();
          const v = pair.slice(idx + 1).trim();
          if (k && v) forms[k] = v;
        }
      });
    try {
      const db = requireSupabase();
      const res = await db
        .from("words")
        .update({
          word: draft.word.trim(),
          word_key: draft.word.trim().toLowerCase(),
          phonetic: draft.phonetic.trim(),
          pos: draft.pos.trim(),
          meaning: draft.meaning.trim(),
          forms,
        })
        .eq("id", editing.id);
      if (res.error) throw res.error;
      setWords((ws) =>
        ws.map((w) =>
          w.id === editing.id
            ? {
                ...w,
                word: draft.word.trim(),
                word_key: draft.word.trim().toLowerCase(),
                phonetic: draft.phonetic.trim(),
                pos: draft.pos.trim(),
                meaning: draft.meaning.trim(),
                forms,
              }
            : w
        )
      );
      setEditing(null);
      setDraft(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "保存失败");
    }
  };

  const goTestSelected = () => {
    if (!selected.size) return;
    sessionStorage.setItem("vocab-test-selection", JSON.stringify([...selected]));
    router.push("/test?scope=selected");
  };

  if (error === "not-configured") {
    return (
      <Card>
        <div className="text-sm text-gray-600">数据库未配置，请先完成 Supabase 与环境变量设置。</div>
      </Card>
    );
  }

  if (loading) return <Spinner text="加载词库…" />;

  return (
    <div className="space-y-4">
      {/* 页头 + 标签 */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-xl bg-black/5 p-1">
          {(["new", "known"] as WordStatus[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-[40px] rounded-lg px-4 text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-blue-700 shadow-sm" : "text-gray-500"
              }`}
            >
              {t === "new" ? "生词" : "熟词"}
              <span className="ml-1 text-xs text-gray-400">
                {words.filter((w) => w.status === t).length}
              </span>
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">共 {filtered.length} 条</div>
      </div>

      {/* 筛选 */}
      <div className="flex gap-2">
        <input
          className={inputCls}
          placeholder="搜索单词或释义…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputCls} w-36 shrink-0`}
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
        >
          <option value="">全部分组</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* 批量操作条 */}
      {selected.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 border-blue-200 bg-blue-50/60">
          <span className="text-sm font-medium text-blue-700">已选 {selected.size} 个</span>
          {tab === "new" ? (
            <Btn variant="success" onClick={() => batchSetStatus("known")} className="h-9 min-h-0 px-3 text-xs">
              标记为已背熟
            </Btn>
          ) : (
            <Btn variant="secondary" onClick={() => batchSetStatus("new")} className="h-9 min-h-0 px-3 text-xs">
              移回生词
            </Btn>
          )}
          <Btn onClick={goTestSelected} className="h-9 min-h-0 px-3 text-xs">
            测试所选
          </Btn>
          <Btn variant="ghost" onClick={() => setSelected(new Set())} className="h-9 min-h-0 px-3 text-xs">
            取消选择
          </Btn>
        </Card>
      )}

      {/* 单词列表 */}
      {pageWords.length === 0 ? (
        <Card>
          <Empty
            text={tab === "new" ? "生词表为空" : "熟词表为空"}
            hint={
              tab === "new"
                ? "去「导入」页上传生词表，或在熟词表中把词移回来"
                : "在生词表中点「已背熟」即可移入这里"
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {pageWords.map((w) => (
            <Card key={w.id} className={`p-3 ${selected.has(w.id) ? "border-blue-400 ring-2 ring-blue-100" : ""}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                  checked={selected.has(w.id)}
                  onChange={() => toggleSelected(w.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{w.word}</span>
                    {w.phonetic && <span className="text-xs text-gray-400">{w.phonetic}</span>}
                    {w.pos && <Tag tone="gray">{w.pos}</Tag>}
                    {listName(w.list_id) && <Tag tone="amber">{listName(w.list_id)}</Tag>}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">{w.meaning}</div>
                  {Object.keys(w.forms || {}).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {Object.entries(w.forms).map(([k, v]) => (
                        <Tag key={k} tone="blue">
                          {k}: {v}
                        </Tag>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-gray-400">
                    导入于 {formatDateShort(w.created_at)} · 复习 {w.review_count} 次 · 错 {w.wrong_count} 次
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {tab === "new" ? (
                    <Btn
                      variant="success"
                      className="h-9 min-h-0 px-3 text-xs"
                      disabled={busyId === w.id}
                      onClick={() => setStatus(w.id, "known")}
                    >
                      {busyId === w.id ? "…" : "已背熟"}
                    </Btn>
                  ) : (
                    <Btn
                      variant="secondary"
                      className="h-9 min-h-0 px-3 text-xs"
                      disabled={busyId === w.id}
                      onClick={() => setStatus(w.id, "new")}
                    >
                      {busyId === w.id ? "…" : "移回生词"}
                    </Btn>
                  )}
                  <div className="flex gap-1.5">
                    <Btn variant="ghost" className="h-9 min-h-0 px-3 text-xs" onClick={() => openEdit(w)}>
                      编辑
                    </Btn>
                    <Btn variant="danger" className="h-9 min-h-0 px-3 text-xs" onClick={() => removeWord(w)}>
                      删除
                    </Btn>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Btn variant="ghost" className="h-9 min-h-0 px-4 text-xs" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
            上一页
          </Btn>
          <span className="text-sm text-gray-500">
            {safePage} / {pageCount}
          </span>
          <Btn variant="ghost" className="h-9 min-h-0 px-4 text-xs" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
            下一页
          </Btn>
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `编辑 ${editing.word}` : ""}>
        {draft && (
          <div>
            <Field label="单词 *">
              <input className={inputCls} value={draft.word} onChange={(e) => setDraft({ ...draft, word: e.target.value })} />
            </Field>
            <Field label="音标">
              <input className={inputCls} value={draft.phonetic} onChange={(e) => setDraft({ ...draft, phonetic: e.target.value })} placeholder="/əˈbændən/" />
            </Field>
            <Field label="词性">
              <input className={inputCls} value={draft.pos} onChange={(e) => setDraft({ ...draft, pos: e.target.value })} placeholder="v. / n. / adj." />
            </Field>
            <Field label="中文释义 *">
              <input className={inputCls} value={draft.meaning} onChange={(e) => setDraft({ ...draft, meaning: e.target.value })} />
            </Field>
            <Field label="词形变化">
              <textarea
                className={`${inputCls} min-h-[80px] resize-y`}
                value={draft.formsText}
                onChange={(e) => setDraft({ ...draft, formsText: e.target.value })}
                placeholder="格式：复数形式:children; 过去式:went; 比较级:better"
              />
            </Field>
            <div className="mt-2 flex gap-3">
              <Btn onClick={saveEdit} className="flex-1">
                保存
              </Btn>
              <Btn variant="ghost" onClick={() => setEditing(null)}>
                取消
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
