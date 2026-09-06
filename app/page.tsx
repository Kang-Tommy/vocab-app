"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Empty, Spinner } from "@/components/ui";
import { isSupabaseConfigured, requireSupabase, todayStartISO } from "@/lib/supabase";
import {
  SCOPE_LABELS,
  TEST_MODE_LABELS,
  TestSession,
  formatTime,
} from "@/lib/types";

interface Counts {
  total: number;
  newCount: number;
  knownCount: number;
  todayCount: number;
}

export default function Dashboard() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [tests, setTests] = useState<TestSession[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError("not-configured");
      return;
    }
    try {
      const db = requireSupabase();
      const [wordsRes, todayRes, testsRes] = await Promise.all([
        db.from("words").select("status"),
        db.from("words").select("id").gte("created_at", todayStartISO()),
        db.from("tests").select("*").order("created_at", { ascending: false }).limit(5),
      ]);
      if (wordsRes.error) throw wordsRes.error;
      const all = wordsRes.data as { status: string }[];
      setCounts({
        total: all.length,
        newCount: all.filter((w) => w.status === "new").length,
        knownCount: all.filter((w) => w.status === "known").length,
        todayCount: todayRes.data?.length ?? 0,
      });
      setTests((testsRes.data ?? []) as TestSession[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "数据加载失败");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error === "not-configured") {
    return (
      <Card>
        <div className="text-base font-semibold">还差最后一步配置</div>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          代码已就绪，但还没有连接数据库。请按以下步骤操作：
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-600">
          <li>打开 supabase.com 注册并创建免费项目；</li>
          <li>在 SQL Editor 中运行仓库里的 supabase/schema.sql；</li>
          <li>在 Vercel 项目设置中填入两个环境变量（见 README）。</li>
        </ol>
      </Card>
    );
  }

  if (error) {
    return <Card><div className="text-sm text-red-600">{error}</div></Card>;
  }

  if (!counts) return <Spinner text="加载统计数据…" />;

  const isEmpty = counts.total === 0;

  return (
    <div className="space-y-4">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "生词", value: counts.newCount, tone: "text-blue-600" },
          { label: "熟词", value: counts.knownCount, tone: "text-emerald-600" },
          { label: "总词数", value: counts.total, tone: "text-gray-800" },
          { label: "今日新增", value: counts.todayCount, tone: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-xs text-gray-500">{s.label}</div>
            <div className={`text-2xl font-bold ${s.tone}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* 快捷入口 */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/import"
          className="rounded-2xl bg-blue-600 p-4 text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <div className="text-sm font-semibold">导入生词</div>
          <div className="mt-1 text-xs text-blue-100">CSV / Excel</div>
        </Link>
        <Link
          href="/words"
          className="rounded-2xl bg-emerald-600 p-4 text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <div className="text-sm font-semibold">词库管理</div>
          <div className="mt-1 text-xs text-emerald-100">生词 / 熟词</div>
        </Link>
        <Link
          href="/test"
          className="rounded-2xl bg-amber-500 p-4 text-white shadow-sm transition-colors hover:bg-amber-600"
        >
          <div className="text-sm font-semibold">开始测试</div>
          <div className="mt-1 text-xs text-amber-100">多种题型</div>
        </Link>
      </div>

      {isEmpty && (
        <Card>
          <Empty
            text="词库还是空的"
            hint="去「导入」页上传你的 CSV 或 Excel 生词表开始吧"
          />
        </Card>
      )}

      {/* 最近测试 */}
      <Card>
        <div className="mb-3 text-base font-semibold">最近测试</div>
        {tests.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">还没有测试记录，去做一套吧</div>
        ) : (
          <div className="divide-y divide-black/5">
            {tests.map((t) => {
              const pct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              return (
                <div key={t.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm font-medium">
                      {TEST_MODE_LABELS[t.mode as keyof typeof TEST_MODE_LABELS] ?? t.mode}
                      <span className="ml-2 text-xs text-gray-400">
                        {SCOPE_LABELS[t.scope] ?? t.scope}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-400">{formatTime(t.created_at)}</div>
                  </div>
                  <div className={`text-sm font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 60 ? "text-amber-600" : "text-red-500"}`}>
                    {t.correct}/{t.total}
                    <span className="ml-1 text-xs font-normal text-gray-400">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
