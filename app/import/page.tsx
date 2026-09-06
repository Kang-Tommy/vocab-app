"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Btn, Card, Field, Spinner, inputCls } from "@/components/ui";
import {
  ColumnRole,
  ParsedTable,
  ROLE_LABELS,
  autoDetect,
  buildParsedWords,
  parseFile,
} from "@/lib/parse";
import { isSupabaseConfigured, requireSupabase } from "@/lib/supabase";
import { WordList } from "@/lib/types";

const ALL_ROLES: ColumnRole[] = ["ignore", "word", "meaning", "phonetic", "pos", "form"];

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  skippedSample: string[];
}

export default function ImportPage() {
  const [configured, setConfigured] = useState(isSupabaseConfigured);
  const [lists, setLists] = useState<WordList[]>([]);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [roleMap, setRoleMap] = useState<Record<number, ColumnRole>>({});
  const [listChoice, setListChoice] = useState("");
  const [newListName, setNewListName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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

  const handleFile = useCallback(async (file: File) => {
    setError("");
    setResult(null);
    try {
      const t = await parseFile(file);
      setTable(t);
      setFileName(file.name);
      setRoleMap(autoDetect(t.headers));
      setListChoice("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败");
      setTable(null);
    }
  }, []);

  const setRole = (col: number, role: ColumnRole) => {
    setRoleMap((m) => ({ ...m, [col]: role }));
  };

  const roleCount = (role: ColumnRole) =>
    Object.values(roleMap).filter((r) => r === role).length;

  const wordCol = Object.keys(roleMap).find((k) => roleMap[Number(k)] === "word");
  const meaningCol = Object.keys(roleMap).find((k) => roleMap[Number(k)] === "meaning");

  const doImport = async () => {
    if (!table) return;
    setBusy(true);
    setError("");
    try {
      const db = requireSupabase();
      const { words, skipped } = buildParsedWords(table, roleMap);

      // 确定分组
      let listId: string | null = null;
      if (listChoice === "new") {
        const name = newListName.trim();
        if (!name) throw new Error("请填写新分组名称");
        const ins = await db.from("lists").insert({ name }).select("id").single();
        if (ins.error) throw ins.error;
        listId = ins.data.id;
        setLists((ls) => [...ls, { id: listId!, name, created_at: new Date().toISOString() }]);
      } else if (listChoice) {
        listId = listChoice;
      }

      // 拉取已有词，区分新增与更新（更新不改动背熟状态）
      const { data: existing, error: exErr } = await db
        .from("words")
        .select("id, word_key");
      if (exErr) throw exErr;
      const existingMap = new Map((existing ?? []).map((w) => [w.word_key, w.id]));

      const toInsert = words.filter((w) => !existingMap.has(w.key));
      const toUpdate = words.filter((w) => existingMap.has(w.key));

      let inserted = 0;
      let updated = 0;
      const CHUNK = 200;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK).map((w) => ({
          word: w.word,
          word_key: w.key,
          phonetic: w.phonetic,
          pos: w.pos,
          meaning: w.meaning,
          forms: w.forms,
          list_id: listId,
          status: "new" as const,
        }));
        const res = await db.from("words").insert(chunk);
        if (res.error) throw res.error;
        inserted += chunk.length;
      }

      for (const w of toUpdate) {
        const patch: Record<string, unknown> = {};
        if (w.phonetic) patch.phonetic = w.phonetic;
        if (w.pos) patch.pos = w.pos;
        if (w.meaning) patch.meaning = w.meaning;
        if (Object.keys(w.forms).length) patch.forms = w.forms;
        if (listId) patch.list_id = listId;
        const res = await db.from("words").update(patch).eq("id", existingMap.get(w.key));
        if (res.error) throw res.error;
        updated++;
      }

      setResult({
        inserted,
        updated,
        skipped: skipped.length,
        skippedSample: skipped.slice(0, 5).map((s) => `第${s.row}行：${s.reason}`),
      });
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <Card>
        <div className="text-base font-semibold">数据库未配置</div>
        <p className="mt-2 text-sm text-gray-600">
          请先在 Vercel / .env.local 中配置 NEXT_PUBLIC_SUPABASE_URL 与
          NEXT_PUBLIC_SUPABASE_ANON_KEY，并在 Supabase 中运行 schema.sql。
        </p>
      </Card>
    );
  }

  if (result) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="text-base font-semibold">导入完成</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 py-3">
              <div className="text-xl font-bold text-emerald-600">{result.inserted}</div>
              <div className="text-xs text-gray-500">新增</div>
            </div>
            <div className="rounded-xl bg-blue-50 py-3">
              <div className="text-xl font-bold text-blue-600">{result.updated}</div>
              <div className="text-xs text-gray-500">更新</div>
            </div>
            <div className="rounded-xl bg-amber-50 py-3">
              <div className="text-xl font-bold text-amber-600">{result.skipped}</div>
              <div className="text-xs text-gray-500">跳过</div>
            </div>
          </div>
          {result.skipped > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
              {result.skippedSample.map((s, i) => (
                <div key={i}>{s}</div>
              ))}
              {result.skipped > 5 && <div>…共 {result.skipped} 条</div>}
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <Btn onClick={() => setResult(null)} variant="secondary">
              继续导入
            </Btn>
            <Link href="/words" className="flex-1">
              <Btn className="w-full">去词库看看</Btn>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 第一步：上传 */}
      <Card>
        <div className="mb-1 text-base font-semibold">导入生词</div>
        <p className="mb-3 text-xs text-gray-500">
          支持 CSV / Excel（.xlsx .xls），第一行为表头。可包含：单词、释义、音标、词性、词形变化（复数形式 / 过去式 / 比较级…）。
        </p>
        <label
          className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center transition-colors hover:border-blue-400"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <div className="text-sm font-medium text-blue-700">
            {fileName || "点击选择文件，或拖入 CSV / Excel"}
          </div>
          <div className="text-xs text-gray-400">解析在本地浏览器完成，不会上传文件内容</div>
        </label>
        {error && !table && <div className="mt-3 text-sm text-red-600">{error}</div>}
      </Card>

      {/* 第二步：列映射 */}
      {table && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-base font-semibold">列映射</div>
            <div className="text-xs text-gray-400">{fileName}</div>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            已自动识别常用列名，请确认；标为「词形变化」的列会以其表头作为变化类型。
          </p>
          <div className="space-y-2">
            {table.headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-28 shrink-0 truncate text-sm font-medium text-gray-700">{h || `列${i + 1}`}</div>
                <select
                  className={inputCls}
                  value={roleMap[i] ?? "ignore"}
                  onChange={(e) => setRole(i, e.target.value as ColumnRole)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* 预览 */}
          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-gray-500">
              预览（前 5 行，共 {table.rows.length} 行）
            </div>
            <div className="overflow-x-auto rounded-xl border border-black/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">单词</th>
                    <th className="px-3 py-2">释义</th>
                    <th className="px-3 py-2">音标</th>
                    <th className="px-3 py-2">词性</th>
                    <th className="px-3 py-2">词形</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {buildParsedWords(table, roleMap).words.slice(0, 5).map((w, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium">{w.word}</td>
                      <td className="px-3 py-2">{w.meaning}</td>
                      <td className="px-3 py-2 text-gray-500">{w.phonetic}</td>
                      <td className="px-3 py-2 text-gray-500">{w.pos}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {Object.entries(w.forms)
                          .map(([k, v]) => `${k}:${v}`)
                          .join("；")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 分组 */}
          <div className="mt-4">
            <Field label="放入分组（可选）">
              <select className={inputCls} value={listChoice} onChange={(e) => setListChoice(e.target.value)}>
                <option value="">不分组</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <option value="new">＋ 新建分组…</option>
              </select>
            </Field>
            {listChoice === "new" && (
              <Field label="新分组名称">
                <input
                  className={inputCls}
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="例如：必修一 Unit1"
                />
              </Field>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <Btn onClick={doImport} disabled={busy || wordCol === undefined || meaningCol === undefined}>
              {busy ? "导入中…" : "确认导入"}
            </Btn>
            {wordCol === undefined || meaningCol === undefined ? (
              <span className="text-xs text-amber-600">请先指定「单词」与「中文释义」两列</span>
            ) : (
              <span className="text-xs text-gray-400">
                已识别 {roleCount("word")} 列单词 · {roleCount("meaning")} 列释义 ·{" "}
                {roleCount("form")} 列词形
              </span>
            )}
          </div>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
        </Card>
      )}

      {busy && <Spinner text="正在写入数据库…" />}
    </div>
  );
}
