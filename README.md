# 单词学习（高中生生词管理 + 测试）

个人用的生词导入、管理与测试网页应用。部署于 Vercel（免费），数据存于 Supabase（免费 PostgreSQL）。

## 功能

- **导入生词**：上传 CSV / Excel（.xlsx / .xls），浏览器本地解析，自动识别列名（单词 / 释义 / 音标 / 词性 / 词形变化），可手动调整列映射，自动查重。
- **词库管理**：生词表 / 熟词表两个视图；搜索、按分组筛选、批量操作；点「已背熟」移入熟词表，可移回；支持编辑与删除。
- **测试**：
  - 范围：今日新增 / 全部生词 / 全部熟词 / 全部单词（生词+熟词混合全考察）/ 按分组 / 词库中手动勾选
  - 题型：英译汉（四选一）/ 汉译英（拼写，原形或词形变化均算对）/ 词性变化（复数、过去式、比较级等）/ 随机混合
  - 题量：全部或随机抽 N 题
  - 结果：得分、正确率、错题回顾、一键重测错题；测试记录写入数据库

## 技术栈

- Next.js 16（App Router）+ TypeScript + Tailwind CSS v4
- Supabase（PostgreSQL + 行级安全）
- papaparse（CSV 解析）+ read-excel-file（Excel 解析）

## 本地开发

```bash
npm install
cp .env.example .env.local   # 填入 Supabase 配置
npm run dev                  # http://localhost:3000
```

## 部署步骤（免费）

### 1. 创建 Supabase 数据库（免费）

1. 打开 <https://supabase.com>，注册并创建项目（选免费 Free 套餐，区域建议选 Singapore/Tokyo）。
2. 创建完成后，左侧进入 **SQL Editor**，把仓库里的 `supabase/schema.sql` 全部内容粘贴进去，点 **Run**。
3. 左侧进入 **Project Settings → API**，记下两个值：
   - `Project URL`（形如 `https://xxxx.supabase.co`）
   - `anon public` 密钥（长字符串）

### 2. 部署到 Vercel（免费）

1. 把本仓库推送到你的 GitHub。
2. 打开 <https://vercel.com>，用 GitHub 账号登录。
3. **Add New → Project → Import** 本仓库，框架会自动识别为 Next.js。
4. 在 **Environment Variables** 中添加：

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 上面的 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 上面的 anon public 密钥 |

5. 点 **Deploy**，几分钟后得到 `https://xxx.vercel.app` 网址，即可使用。

### 3. 绑定你的域名（可选）

1. 在 Vercel 项目 **Settings → Domains** 中添加 `tongqu.edu.eu.org`，Vercel 会提示需要添加一条 DNS 记录。
2. 到 Cloudflare DNS 中添加：
   - 类型：`CNAME`
   - 名称：`tongqu`
   - 目标：`cname.vercel-dns.com`
   - 代理状态：**仅 DNS（灰云）**（Vercel 自定义域名必须关闭橙色云代理）
3. 等待解析生效（一般几分钟），Vercel 会自动签发 HTTPS 证书。

> 国内访问提示：Vercel 与 Supabase 在国内直连不稳定，通常需要代理。若需国内直连，可考虑改部署到 Cloudflare Pages + 浏览器本地存储方案。

## 首次使用

1. 打开网址 → 进「导入」页 → 上传你的生词表（可先用 `examples/sample_words.csv` 试跑）。
2. 导入后可到「词库」页查看、标记背熟。
3. 到「测试」页选择范围与题型开始测试。
