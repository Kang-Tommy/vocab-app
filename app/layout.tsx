import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/nav";

export const metadata: Metadata = {
  title: "单词学习",
  description: "个人生词导入、管理与测试工具",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen pb-16 text-[#1A1B1C] md:pb-0">
        <Nav />
        <main className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4 md:pt-6">
          {children}
        </main>
      </body>
    </html>
  );
}
