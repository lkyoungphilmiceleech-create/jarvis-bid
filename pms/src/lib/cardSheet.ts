// 법인카드 공용 스프레드시트 → 정산 장부 변환 (설계안 §27)
// 시트 구조: 카드 소지자별 탭, 각 행에 프로젝트 표기. 실제 헤더는 시트 URL 수신 후 확정하며,
// 그 전까지는 흔히 쓰는 열 이름을 동의어로 인식한다.

import { computeLedgerAmounts } from "./money";

export type Field =
  | "paidOn" | "category" | "item" | "total" | "taxable" | "zeroRated"
  | "payee" | "project" | "note";

/** 열 이름 동의어 (공백 제거·소문자 비교) */
const HEADER_SYNONYMS: Record<Field, string[]> = {
  paidOn: ["출금일", "사용일", "사용일자", "승인일", "승인일자", "결제일", "일자", "날짜"],
  category: ["구분", "비목"],
  item: ["항목", "세목", "내용", "사용내역", "적요"],
  total: ["금액", "사용금액", "이용금액", "결제금액", "승인금액", "합계금액"],
  taxable: ["과세", "과세금액"],
  zeroRated: ["영세", "영세금액"],
  payee: ["지급처", "가맹점", "가맹점명", "사용처", "거래처"],
  project: ["프로젝트", "프로젝트명", "사업", "사업명"],
  note: ["비고", "메모"],
};

export const normalizeKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type ColumnMap = Partial<Record<Field, number>>;

export function detectColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {};
  header.forEach((raw, idx) => {
    const key = normalizeKey(raw);
    for (const [field, names] of Object.entries(HEADER_SYNONYMS) as [Field, string[]][]) {
      if (map[field] === undefined && names.some((n) => normalizeKey(n) === key)) {
        map[field] = idx;
        return;
      }
    }
  });
  return map;
}

/** "₩1,234,000", "1,234,000원", "(10,000)", "-10,000" → 원 단위 정수. 빈 칸은 0. */
export function parseWon(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new RangeError(`원 단위 정수가 아닙니다: ${value}`);
    return value;
  }
  const s = value.trim();
  if (s === "" || s === "-") return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  const digits = s.replace(/[₩원,\s()\-]/g, "");
  if (!/^\d+$/.test(digits)) throw new RangeError(`금액 형식이 올바르지 않습니다: ${value}`);
  return (negative ? -1 : 1) * Number(digits);
}

/** "2026.09.01", "2026-9-1", "2026/09/01", "26.09.01", 시트 날짜 일련번호 → "YYYY-MM-DD" */
export function parseDate(value: string | number): string {
  if (typeof value === "number") {
    // 구글 시트 일련번호: 1899-12-30 기준 일수
    const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const m = value.trim().match(/^(\d{2}|\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})\.?$/);
  if (!m) throw new RangeError(`날짜 형식이 올바르지 않습니다: ${value}`);
  const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new RangeError(`존재하지 않는 날짜입니다: ${value}`);
  }
  return d.toISOString().slice(0, 10);
}

export interface CardLedgerDraft {
  paidOn: string;
  category: string | null;
  item: string | null;
  taxable: number;
  zeroRated: number;
  vat: number;
  method: "corp_card";
  payee: string | null;
  note: string | null;
  /** 시트 프로젝트 표기 원문 */
  projectLabel: string | null;
  /** 별칭으로 찾은 프로젝트. null 이면 미분류함 */
  projectId: string | null;
  holderId: string;
  sourceRowKey: string;
  sheetRow: number;
}

export interface ImportIssue {
  sheetRow: number;
  message: string;
}

export interface CardTabImportInput {
  spreadsheetId: string;
  tabName: string;
  holderId: string;
  /** 첫 행은 헤더 */
  rows: (string | number | null)[][];
  /** 정규화된 별칭(normalizeKey) → 프로젝트 ID */
  aliases: Map<string, string>;
}

export interface CardTabImportResult {
  entries: CardLedgerDraft[];
  issues: ImportIssue[];
}

/** 행 내용 기반 중복 방지 키 (행 순서가 바뀌어도 같은 내용이면 같은 키) */
export function rowKey(spreadsheetId: string, tabName: string, cells: (string | number | null)[]): string {
  const text = [spreadsheetId, tabName, ...cells.map((c) => String(c ?? "").trim())].join("␟");
  // FNV-1a 64bit — 암호용이 아닌 식별용
  let h = 0xcbf29ce484222325n;
  for (const ch of new TextEncoder().encode(text)) {
    h ^= BigInt(ch);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function importCardTab(input: CardTabImportInput): CardTabImportResult {
  const [header, ...body] = input.rows;
  const issues: ImportIssue[] = [];
  const entries: CardLedgerDraft[] = [];
  if (!header) return { entries, issues: [{ sheetRow: 1, message: "빈 시트입니다" }] };

  const col = detectColumns(header.map((h) => String(h ?? "")));
  if (col.paidOn === undefined) issues.push({ sheetRow: 1, message: "날짜 열(출금일/사용일 등)을 찾지 못했습니다" });
  if (col.total === undefined && col.taxable === undefined && col.zeroRated === undefined) {
    issues.push({ sheetRow: 1, message: "금액 열(금액/과세/영세 등)을 찾지 못했습니다" });
  }
  if (issues.length > 0) return { entries, issues };

  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const sheetRow = i + 2;
    const get = (f: Field) => (col[f] === undefined ? null : cells[col[f]!] ?? null);
    const text = (f: Field) => {
      const v = get(f);
      return v === null || String(v).trim() === "" ? null : String(v).trim();
    };
    if (cells.every((c) => c === null || String(c).trim() === "")) return; // 빈 행

    try {
      const paidOn = parseDate(get("paidOn") as string | number);
      let taxableSupply: number;
      let zeroRated: number;
      let vat: number;
      if (col.taxable !== undefined || col.zeroRated !== undefined) {
        // 과세·영세 열이 따로 있으면 과세는 총액(부가세 포함)으로 보고 분리
        const r = computeLedgerAmounts({
          taxable: parseWon(get("taxable")),
          taxableBasis: "total",
          zeroRated: parseWon(get("zeroRated")),
        });
        ({ taxableSupply, zeroRated, vat } = r);
      } else {
        // 금액 열 하나뿐이면 국내 과세 총액으로 간주 (해외 결제는 앱에서 영세로 수정)
        const r = computeLedgerAmounts({ taxable: parseWon(get("total")), taxableBasis: "total", zeroRated: 0 });
        ({ taxableSupply, zeroRated, vat } = r);
      }
      if (taxableSupply === 0 && zeroRated === 0) {
        issues.push({ sheetRow, message: "금액이 0원입니다" });
        return;
      }

      const key = rowKey(input.spreadsheetId, input.tabName, cells);
      if (seen.has(key)) {
        issues.push({ sheetRow, message: "같은 내용의 행이 중복되어 있습니다(한 번만 반영)" });
        return;
      }
      seen.add(key);

      const projectLabel = text("project");
      entries.push({
        paidOn,
        category: text("category"),
        item: text("item"),
        taxable: taxableSupply,
        zeroRated,
        vat,
        method: "corp_card",
        payee: text("payee"),
        note: text("note"),
        projectLabel,
        projectId: projectLabel ? input.aliases.get(normalizeKey(projectLabel)) ?? null : null,
        holderId: input.holderId,
        sourceRowKey: key,
        sheetRow,
      });
    } catch (e) {
      issues.push({ sheetRow, message: (e as Error).message });
    }
  });
  return { entries, issues };
}
