// 운영(라이브) 모드: Supabase(PostgreSQL) — 권한은 DB의 RLS가 강제한다.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { DueItem } from "../lib/myWork";
import type {
  DashboardData, DashboardProject, IssueRow, NewIssue, NewRequest, NotifySettings, PmIssueRow, Profile, ProjectRow, Repo,
  RequestRow,
} from "./types";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없음 — proxy.ts 가 세션을 갱신한다
        }
      },
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const REQUEST_SELECT =
  "id,title,due_date,status,project:projects(name)," +
  "requester:profiles!requests_requester_id_fkey(name),assignee:profiles!requests_assignee_id_fkey(name)";

const toRequest = (r: any): RequestRow => ({
  id: r.id, title: r.title, dueDate: r.due_date, status: r.status,
  projectName: one(r.project)?.name ?? null,
  requesterName: one(r.requester)?.name ?? "", assigneeName: one(r.assignee)?.name ?? "",
});

export const supabaseRepo: Repo = {
  mode: "live",

  async currentProfile() {
    const sb = await supabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from("profiles").select("id,name,email,role,active").eq("id", user.id).maybeSingle();
    // 승인 전 사용자는 RLS 때문에 본인 프로필도 읽지 못한다 → 승인 대기로 취급
    return (data as Profile | null) ?? { id: user.id, name: user.email ?? "", email: user.email ?? "", role: "member", active: false };
  },

  async listProfiles() {
    const sb = await supabaseServer();
    return check(await sb.from("profiles").select("id,name").eq("active", true).order("name")) as any;
  },

  async listProjects() {
    const sb = await supabaseServer();
    const rows = check(await sb.from("projects")
      .select("id,parent_id,name,status,start_date,end_date,pm:profiles!projects_pm_id_fkey(name)")
      .neq("status", "archived")) as any[];
    return rows.map((r): ProjectRow => ({ ...r, pm_name: one(r.pm)?.name ?? null }));
  },

  async myDueItems(userId) {
    const sb = await supabaseServer();
    const [tasks, memberOf, pmOf, reqs] = await Promise.all([
      sb.from("tasks").select("id,title,due_date,status,work_item:work_items(project:projects(name))")
        .eq("assignee_id", userId).neq("status", "done"),
      sb.from("project_members").select("project_id").eq("user_id", userId),
      sb.from("projects").select("id").eq("pm_id", userId),
      sb.from("requests").select(REQUEST_SELECT).eq("assignee_id", userId).in("status", ["requested", "accepted"]),
    ]);
    const projectIds = [
      ...(check(memberOf) as any[]).map((m) => m.project_id),
      ...(check(pmOf) as any[]).map((p) => p.id),
    ];
    const ms = projectIds.length === 0 ? [] : check(await sb.from("milestones")
      .select("id,title,due_date,done,project:projects(name)").in("project_id", projectIds).eq("done", false)) as any[];
    return [
      ...(check(tasks) as any[]).map((t): DueItem => ({ id: t.id, kind: "task", title: t.title,
        projectName: one(one(t.work_item)?.project)?.name ?? null, dueDate: t.due_date, done: false })),
      ...ms.map((m): DueItem => ({ id: m.id, kind: "milestone", title: m.title,
        projectName: one(m.project)?.name ?? null, dueDate: m.due_date, done: m.done })),
      ...(check(reqs) as any[]).map((r): DueItem => ({ id: r.id, kind: "request", title: r.title,
        projectName: one(r.project)?.name ?? null, dueDate: r.due_date, done: false })),
    ];
  },

  async myRequests(userId) {
    const sb = await supabaseServer();
    const [received, sent] = await Promise.all([
      sb.from("requests").select(REQUEST_SELECT).eq("assignee_id", userId).order("created_at", { ascending: false }).limit(30),
      sb.from("requests").select(REQUEST_SELECT).eq("requester_id", userId).order("created_at", { ascending: false }).limit(30),
    ]);
    return { received: (check(received) as any[]).map(toRequest), sent: (check(sent) as any[]).map(toRequest) };
  },

  async updateRequestStatus(id, status) {
    const sb = await supabaseServer();
    check(await sb.from("requests").update({ status }).eq("id", id));
  },

  async createRequest(input: NewRequest) {
    const sb = await supabaseServer();
    check(await sb.from("requests").insert({
      project_id: input.projectId, assignee_id: input.assigneeId, title: input.title, body: input.body, due_date: input.dueDate,
    }));
  },

  async createIssue(input: NewIssue) {
    const sb = await supabaseServer();
    check(await sb.from("issues").insert({
      project_id: input.projectId, problem: input.problem, impact: input.impact, solution: input.solution,
    }));
  },

  async myPmIssues() {
    const sb = await supabaseServer();
    const rows = check(await sb.from("my_pm_issues")
      .select("id,project_name,problem,solution,status,reporter_name").order("reported_at")) as any[];
    return rows.map((r): PmIssueRow => ({
      id: r.id, projectName: r.project_name, problem: r.problem, solution: r.solution, status: r.status,
      reporterName: r.reporter_name,
    }));
  },

  async resolveIssue(id, note) {
    const sb = await supabaseServer();
    const res = await sb.from("issues").update({ status: "resolved", resolution_note: note }).eq("id", id).select("id");
    if ((check(res) as any[]).length === 0) throw new Error("이슈를 찾을 수 없거나 권한이 없습니다");
  },

  async getNotifySettings(userId) {
    const sb = await supabaseServer();
    const r = check(await sb.from("profiles").select("notify_email,notify_kakaowork,kakaowork_email").eq("id", userId).single()) as any;
    return { notifyEmail: r.notify_email, notifyKakaowork: r.notify_kakaowork, kakaoworkEmail: r.kakaowork_email };
  },

  async updateNotifySettings(userId, s: NotifySettings) {
    const sb = await supabaseServer();
    check(await sb.from("profiles").update({
      notify_email: s.notifyEmail, notify_kakaowork: s.notifyKakaowork, kakaowork_email: s.kakaoworkEmail,
    }).eq("id", userId));
  },

  async dashboard(today) {
    const sb = await supabaseServer();
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    const [projects, progress, rollup, actual, issues, ms, staff] = await Promise.all([
      sb.from("projects").select("id,parent_id,name").neq("status", "archived"),
      sb.from("project_progress").select("project_id,progress_pct"),
      sb.from("budget_rollup").select("project_id,own_budget_supply,contract_supply"),
      sb.from("budget_vs_actual").select("project_id,spent_supply"),
      sb.from("issues").select("id,problem,solution,status,reported_at,project:projects(name),owner:profiles!issues_owner_id_fkey(name)")
        .neq("status", "resolved").order("reported_at", { ascending: false }),
      sb.from("milestones").select("id,title,due_date,done,project:projects(name)").eq("done", false).lte("due_date", until).order("due_date"),
      sb.from("project_members").select("role_label,profile:profiles(name),project:projects(name)"),
    ]);
    const pRows = check(projects) as any[];
    const prog = new Map((check(progress) as any[]).map((r) => [r.project_id, r.progress_pct]));
    const roll = new Map((check(rollup) as any[]).map((r) => [r.project_id, r]));
    const spent = new Map<string, number>();
    (check(actual) as any[]).forEach((r) => spent.set(r.project_id, (spent.get(r.project_id) ?? 0) + Number(r.spent_supply)));
    const nameOf = new Map(pRows.map((p) => [p.id, p.name]));
    const staffing = new Map<string, { name: string; role: string | null }[]>();
    (check(staff) as any[]).forEach((m) => {
      const person = one(m.profile)?.name ?? "";
      staffing.set(person, [...(staffing.get(person) ?? []), { name: one(m.project)?.name ?? "", role: m.role_label }]);
    });
    return {
      projects: pRows.map((p): DashboardProject => {
        const r = roll.get(p.id);
        return {
          id: p.id, name: p.name, parentName: p.parent_id ? nameOf.get(p.parent_id) ?? null : null,
          progressPct: prog.get(p.id) ?? null,
          budget: r ? { budgetSupply: Number(r.own_budget_supply), spentSupply: spent.get(p.id) ?? 0 } : null,
          contractSupply: r?.contract_supply == null ? null : Number(r.contract_supply),
        };
      }),
      openIssues: (check(issues) as any[]).map((i): IssueRow => ({
        id: i.id, problem: i.problem, solution: i.solution, status: i.status, reportedAt: i.reported_at,
        projectName: one(i.project)?.name ?? "", ownerName: one(i.owner)?.name ?? null,
      })),
      upcoming: (check(ms) as any[]).map((m): DueItem => ({ id: m.id, kind: "milestone", title: m.title,
        projectName: one(m.project)?.name ?? null, dueDate: m.due_date, done: m.done })),
      staffing: [...staffing.entries()].map(([personName, projects]) => ({ personName, projects })),
    } satisfies DashboardData;
  },
};
