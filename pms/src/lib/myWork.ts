// '내 업무' 화면 묶음 규칙 (설계안 §36): 지연 · 오늘 · 이번 주(7일) · 이후
// 날짜는 'YYYY-MM-DD' 문자열. 오늘 기준은 사용자 기기 시간대(해외 출장 시 현지 날짜).

export type Bucket = "overdue" | "today" | "week" | "later";

export interface DueItem {
  id: string;
  kind: "task" | "milestone" | "request";
  title: string;
  projectName: string | null;
  dueDate: string | null;
  done: boolean;
}

export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function bucketOf(dueDate: string | null, today: string): Bucket {
  if (!dueDate) return "later";
  const diff = daysBetween(today, dueDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "week";
  return "later";
}

/** 완료 건 제외, 버킷별로 마감일 오름차순 정렬 */
export function groupDueItems(items: DueItem[], today: string): Record<Bucket, DueItem[]> {
  const out: Record<Bucket, DueItem[]> = { overdue: [], today: [], week: [], later: [] };
  for (const it of items) {
    if (it.done) continue;
    out[bucketOf(it.dueDate, today)].push(it);
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  }
  return out;
}

/** D-day 표기: D-3 / D-DAY / D+2 */
export function dday(dueDate: string, today: string): string {
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return "D-DAY";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}
