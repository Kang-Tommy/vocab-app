"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "仪表盘", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { href: "/import", label: "导入", icon: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" },
  { href: "/words", label: "词库", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/test", label: "测试", icon: "M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* 顶部栏（桌面） */}
      <header className="sticky top-0 z-40 hidden border-b border-black/5 bg-white/90 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-base font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              词
            </span>
            单词学习
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-black/5"
                  }`}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* 底部导航（手机） */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {items.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  active ? "text-blue-600" : "text-gray-500"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={it.icon} />
                </svg>
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
