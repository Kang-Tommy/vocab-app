import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

/** 解析 CSV / Excel 文件为统一的表结构（首行为表头） */
export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  throw new Error("不支持的文件格式，请上传 CSV 或 Excel（.xlsx / .xls）文件");
}

function parseCsv(file: File): Promise<ParsedTable> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const data = res.data as string[][];
        if (!data.length) return reject(new Error("文件为空"));
        const headers = data[0].map((h) => String(h ?? "").trim());
        const rows = data.slice(1).map((r) =>
          Array.from({ length: headers.length }, (_, i) => String(r[i] ?? "").trim())
        );
        resolve({ headers, rows });
      },
      error: (err: Error) => reject(new Error("CSV 解析失败：" + err.message)),
    });
  });
}

async function parseXlsx(file: File): Promise<ParsedTable> {
  const rows = await readSheet(file);
  if (!rows.length) throw new Error("文件为空");
  const headers = rows[0].map((c) => String(c ?? "").trim());
  const data = rows.slice(1).map((r) =>
    Array.from({ length: headers.length }, (_, i) => String(r[i] ?? "").trim())
  );
  return { headers, rows: data };
}

export type ColumnRole = "ignore" | "word" | "meaning" | "phonetic" | "pos" | "form";

export const ROLE_LABELS: Record<ColumnRole, string> = {
  ignore: "忽略此列",
  word: "单词（必选）",
  meaning: "中文释义（必选）",
  phonetic: "音标",
  pos: "词性",
  form: "词形变化",
};

/** 常见词形变化列名，命中即自动识别为词形列 */
export const FORM_KEYS = [
  "复数形式",
  "过去式",
  "过去分词",
  "现在分词",
  "第三人称单数",
  "比较级",
  "最高级",
];

const WORD_KEYS = ["word", "单词", "英文", "词汇", "vocabulary", "term", "words", "english"];
const MEANING_KEYS = ["meaning", "释义", "中文", "意思", "翻译", "解释", "translation", "definition", "含义", "中文释义"];
const PHONETIC_KEYS = ["phonetic", "音标", "pronunciation", "读音", "发音"];
const POS_KEYS = ["pos", "词性", "part", "品词"];

function findHeader(headers: string[], keys: string[], skip: Set<number>): number {
  for (const k of keys) {
    const idx = headers.findIndex((h) => h && h.toLowerCase().includes(k));
    if (idx >= 0 && !skip.has(idx)) return idx;
  }
  return -1;
}

/** 根据表头关键词自动猜测列角色 */
export function autoDetect(headers: string[]): Record<number, ColumnRole> {
  const map: Record<number, ColumnRole> = {};
  headers.forEach((_, i) => (map[i] = "ignore"));
  const used = new Set<number>();
  const word = findHeader(headers, WORD_KEYS, used);
  const meaning = findHeader(headers, MEANING_KEYS, used);
  const phonetic = findHeader(headers, PHONETIC_KEYS, used);
  const pos = findHeader(headers, POS_KEYS, used);
  if (word >= 0) {
    map[word] = "word";
    used.add(word);
  }
  if (meaning >= 0) {
    map[meaning] = "meaning";
    used.add(meaning);
  }
  if (phonetic >= 0) {
    map[phonetic] = "phonetic";
    used.add(phonetic);
  }
  if (pos >= 0) {
    map[pos] = "pos";
    used.add(pos);
  }
  // 表头直接是词形关键词的列 → 词形
  headers.forEach((h, i) => {
    if (used.has(i)) return;
    const lower = h.toLowerCase();
    const hit = FORM_KEYS.find((fk) => lower.includes(fk) || lower.includes(fk.toLowerCase()));
    if (hit || /form|词形|变形|变化/.test(lower)) {
      map[i] = "form";
      used.add(i);
    }
  });
  return map;
}

export interface ParsedWord {
  key: string; // 小写单词，用于查重
  word: string;
  phonetic: string;
  pos: string;
  meaning: string;
  forms: Record<string, string>;
}

export interface BuildResult {
  words: ParsedWord[];
  skipped: { row: number; reason: string }[];
}

/** 按列角色把表格行组装成单词对象 */
export function buildParsedWords(
  table: ParsedTable,
  roleMap: Record<number, ColumnRole>
): BuildResult {
  const words: ParsedWord[] = [];
  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();

  table.rows.forEach((row, ri) => {
    const get = (role: ColumnRole) => {
      const col = Object.keys(roleMap).find((k) => roleMap[Number(k)] === role);
      return col !== undefined ? row[Number(col)] ?? "" : "";
    };
    const word = get("word").trim();
    const meaning = get("meaning").trim();
    if (!word) {
      skipped.push({ row: ri + 2, reason: "缺少单词" });
      return;
    }
    if (!meaning) {
      skipped.push({ row: ri + 2, reason: `“${word}”缺少释义` });
      return;
    }
    const key = word.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ row: ri + 2, reason: `“${word}”重复（已保留首个）` });
      return;
    }
    seen.add(key);
    const forms: Record<string, string> = {};
    Object.keys(roleMap).forEach((k) => {
      if (roleMap[Number(k)] !== "form") return;
      const header = table.headers[Number(k)];
      const value = row[Number(k)]?.trim();
      if (value) forms[header || "词形"] = value;
    });
    words.push({
      key,
      word,
      phonetic: get("phonetic").trim(),
      pos: get("pos").trim(),
      meaning,
      forms,
    });
  });
  return { words, skipped };
}
