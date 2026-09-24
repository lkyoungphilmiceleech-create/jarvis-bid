// 체험(데모) 모드: 클라우드 DB 연결 전 화면 확인용. 서버 메모리에만 저장되며 재시작 시 초기화된다.
import { cookies } from "next/headers";
import type { DueItem } from "../lib/myWork";
import type {
  DashboardData, IssueRow, NewIssue, NewRequest, NotifySettings, Profile, ProjectRow, Repo, RequestRow, RequestStatus,
} from "./types";

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const people: Profile[] = [
  { id: "u-admin", name: "본부장(데모)", email: "admin@demo", role: "admin", active: true },
  { id: "u-kim", name: "김매니저(데모)", email: "kim@demo", role: "member", active: true },
  { id: "u-lee", name: "이주임(데모)", email: "lee@demo", role: "member", active: true },
];

const projects: (ProjectRow & { pm_id: string; progress: number; budget: number; spent: number })[] = [
  { id: "p-kocca", parent_id: null, name: "KOCCA 해외마켓", status: "active", pm_name: people[0].name, pm_id: "u-admin",
    start_date: "2026-03-01", end_date: "2026-12-15", progress: 70, budget: 0, spent: 0 },
  { id: "p-viva", parent_id: "p-kocca", name: "VivaTech", status: "active", pm_name: people[0].name, pm_id: "u-admin",
    start_date: "2026-03-01", end_date: "2026-07-31", progress: 100, budget: 240_000_000, spent: 231_500_000 },
  { id: "p-ai4", parent_id: "p-kocca", name: "Ai4", status: "active", pm_name: people[0].name, pm_id: "u-admin",
    start_date: "2026-05-01", end_date: "2026-09-30", progress: 85, budget: 260_000_000, spent: 248_900_000 },
  { id: "p-switch", parent_id: "p-kocca", name: "SWITCH", status: "active", pm_name: people[0].name, pm_id: "u-admin",
    start_date: "2026-08-01", end_date: "2026-12-15", progress: 25, budget: 250_000_000, spent: 61_200_000 },
];

const members: { projectId: string; userId: string; role: string }[] = [
  { projectId: "p-kocca", userId: "u-admin", role: "총괄 PM" },
  { projectId: "p-ai4", userId: "u-kim", role: "현장운영" },
  { projectId: "p-switch", userId: "u-kim", role: "PL" },
  { projectId: "p-switch", userId: "u-lee", role: "참가기업 관리" },
];

const milestones: { id: string; projectId: string; title: string; due: string; done: boolean }[] = [
  { id: "m1", projectId: "p-ai4", title: "Ai4 결과보고서 제출", due: iso(0), done: false },
  { id: "m2", projectId: "p-switch", title: "SWITCH 참가기업 최종 확정", due: iso(3), done: false },
  { id: "m3", projectId: "p-switch", title: "SWITCH 부스 디자인 시안 확정", due: iso(-1), done: false },
  { id: "m4", projectId: "p-kocca", title: "KOCCA 중간 정산 서류 제출", due: iso(12), done: false },
];

const tasks: { id: string; projectId: string; assigneeId: string; title: string; due: string; done: boolean }[] = [
  { id: "t1", projectId: "p-switch", assigneeId: "u-kim", title: "현지 운송업체 견적 비교", due: iso(1), done: false },
  { id: "t2", projectId: "p-switch", assigneeId: "u-lee", title: "참가기업 서류 취합", due: iso(0), done: false },
  { id: "t3", projectId: "p-ai4", assigneeId: "u-kim", title: "현장 사진 정리·업로드", due: iso(-2), done: false },
];

let requests: (Omit<RequestRow, "requesterName" | "assigneeName" | "projectName"> & {
  projectId: string | null; requesterId: string; assigneeId: string;
})[] = [
  { id: "r1", projectId: "p-switch", requesterId: "u-admin", assigneeId: "u-kim", title: "부스 도면 최종본 공유 부탁",
    dueDate: iso(2), status: "requested" },
  { id: "r2", projectId: "p-ai4", requesterId: "u-kim", assigneeId: "u-admin", title: "결과보고서 검토 요청",
    dueDate: iso(0), status: "accepted" },
];

let issues: (Omit<IssueRow, "projectName" | "ownerName"> & { projectId: string; ownerId: string | null })[] = [
  { id: "i1", projectId: "p-switch", problem: "현지 부스 시공사 일정 1주 지연 통보",
    solution: "대체 시공사 2곳 견적 요청, 금요일까지 결정", ownerId: "u-kim", status: "in_progress",
    reportedAt: new Date(Date.now() - 86_400_000).toISOString() },
];

const notify = new Map<string, NotifySettings>();

/** 상위로 올라가며 PM 찾기 (DB effective_pm 과 동일 규칙) */
function effectivePm(projectId: string): string | null {
  let p = projects.find((x) => x.id === projectId);
  while (p) {
    if (p.pm_id) return p.pm_id;
    p = projects.find((x) => x.id === p!.parent_id);
  }
  return null;
}

const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;

async function demoUserId(): Promise<string> {
  const c = await cookies();
  return c.get("demo_user")?.value ?? "";
}

export const demoRepo: Repo = {
  mode: "demo",
  async currentProfile() {
    const id = await demoUserId();
    return people.find((p) => p.id === id) ?? null;
  },
  async listProfiles() {
    return people.map(({ id, name }) => ({ id, name }));
  },
  async listProjects() {
    return projects.map(({ pm_id: _p, progress: _g, budget: _b, spent: _s, ...row }) => row);
  },
  async myDueItems(userId) {
    const mine = new Set(members.filter((m) => m.userId === userId).map((m) => m.projectId));
    projects.filter((p) => p.pm_id === userId).forEach((p) => mine.add(p.id));
    const items: DueItem[] = [
      ...tasks.filter((t) => t.assigneeId === userId).map((t) => ({
        id: t.id, kind: "task" as const, title: t.title, projectName: projectName(t.projectId), dueDate: t.due, done: t.done })),
      ...milestones.filter((m) => mine.has(m.projectId)).map((m) => ({
        id: m.id, kind: "milestone" as const, title: m.title, projectName: projectName(m.projectId), dueDate: m.due, done: m.done })),
      ...requests.filter((r) => r.assigneeId === userId && (r.status === "requested" || r.status === "accepted")).map((r) => ({
        id: r.id, kind: "request" as const, title: r.title, projectName: projectName(r.projectId), dueDate: r.dueDate, done: false })),
    ];
    return items;
  },
  async myRequests(userId) {
    const view = (r: (typeof requests)[number]): RequestRow => ({
      id: r.id, title: r.title, dueDate: r.dueDate, status: r.status, projectName: projectName(r.projectId),
      requesterName: nameOf(r.requesterId) ?? "", assigneeName: nameOf(r.assigneeId) ?? "",
    });
    return {
      received: requests.filter((r) => r.assigneeId === userId).map(view),
      sent: requests.filter((r) => r.requesterId === userId).map(view),
    };
  },
  async updateRequestStatus(id: string, status: RequestStatus) {
    requests = requests.map((r) => (r.id === id ? { ...r, status } : r));
  },
  async createRequest(input: NewRequest) {
    requests = [...requests, {
      id: `r${Date.now()}`, projectId: input.projectId, requesterId: await demoUserId(), assigneeId: input.assigneeId,
      title: input.title, dueDate: input.dueDate, status: "requested",
    }];
  },
  async createIssue(input: NewIssue) {
    issues = [...issues, {
      id: `i${Date.now()}`, projectId: input.projectId, problem: input.problem, solution: input.solution,
      ownerId: await demoUserId(), status: "open", reportedAt: new Date().toISOString(),
    }];
  },
  async myPmIssues(userId) {
    return issues.filter((i) => i.status !== "resolved" && effectivePm(i.projectId) === userId).map((i) => ({
      id: i.id, projectName: projectName(i.projectId) ?? "", problem: i.problem, solution: i.solution,
      status: i.status as "open" | "in_progress", reporterName: nameOf(i.ownerId),
    }));
  },
  async resolveIssue(id, note) {
    const me = await demoUserId();
    const target = issues.find((i) => i.id === id);
    if (!target || effectivePm(target.projectId) !== me) throw new Error("이슈 해결 처리는 프로젝트 PM만 할 수 있습니다");
    issues = issues.map((i) => (i.id === id ? { ...i, status: "resolved", solution: note ?? i.solution } : i));
  },
  async getNotifySettings(userId) {
    return notify.get(userId) ?? { notifyEmail: true, notifyKakaowork: true, kakaoworkEmail: null };
  },
  async updateNotifySettings(userId, s) {
    notify.set(userId, s);
  },
  async sendTestNotification() {
    // 체험 모드는 실제 발송하지 않음
  },
  async dashboard(): Promise<DashboardData> {
    const byName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? null;
    return {
      projects: projects.map((p) => ({
        id: p.id, name: p.name, parentName: byName(p.parent_id), progressPct: p.progress,
        budget: p.parent_id ? { budgetSupply: p.budget, spentSupply: p.spent } : null,
        contractSupply: p.parent_id ? null : 764_545_455,
      })),
      openIssues: issues.filter((i) => i.status !== "resolved").map((i) => ({
        ...i, projectName: projectName(i.projectId) ?? "", ownerName: nameOf(i.ownerId) })),
      upcoming: milestones.map((m) => ({
        id: m.id, kind: "milestone" as const, title: m.title, projectName: projectName(m.projectId), dueDate: m.due, done: m.done })),
      staffing: people.map((p) => ({
        personName: p.name,
        projects: members.filter((m) => m.userId === p.id).map((m) => ({ name: projectName(m.projectId) ?? "", role: m.role })),
      })),
    };
  },
};
