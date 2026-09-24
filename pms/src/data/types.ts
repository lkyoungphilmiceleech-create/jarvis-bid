import type { DueItem } from "../lib/myWork";

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
}

export interface ProjectRow {
  id: string;
  parent_id: string | null;
  name: string;
  status: string;
  pm_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

export type RequestStatus = "requested" | "accepted" | "rejected" | "done";

export interface RequestRow {
  id: string;
  title: string;
  projectName: string | null;
  requesterName: string;
  assigneeName: string;
  dueDate: string | null;
  status: RequestStatus;
}

export interface IssueRow {
  id: string;
  projectName: string;
  problem: string;
  solution: string | null;
  ownerName: string | null;
  status: "open" | "in_progress" | "resolved";
  reportedAt: string;
}

export interface PmIssueRow {
  id: string;
  projectName: string;
  problem: string;
  solution: string | null;
  status: "open" | "in_progress";
  reporterName: string | null;
}

export interface NotifySettings {
  notifyEmail: boolean;
  notifyKakaowork: boolean;
  kakaoworkEmail: string | null;
}

export interface NewIssue {
  projectId: string;
  problem: string;
  impact: string | null;
  solution: string | null;
}

export interface NewRequest {
  projectId: string | null;
  assigneeId: string;
  title: string;
  body: string | null;
  dueDate: string | null;
}

export interface DashboardProject {
  id: string;
  name: string;
  parentName: string | null;
  progressPct: number | null;
  /** 예산 권한 없으면 null */
  budget: { budgetSupply: number; spentSupply: number } | null;
  contractSupply: number | null;
}

export interface DashboardData {
  projects: DashboardProject[];
  openIssues: IssueRow[];
  upcoming: DueItem[];
  staffing: { personName: string; projects: { name: string; role: string | null }[] }[];
}

export interface Repo {
  mode: "demo" | "live";
  currentProfile(): Promise<Profile | null>;
  listProfiles(): Promise<Pick<Profile, "id" | "name">[]>;
  listProjects(): Promise<ProjectRow[]>;
  myDueItems(userId: string): Promise<DueItem[]>;
  myRequests(userId: string): Promise<{ received: RequestRow[]; sent: RequestRow[] }>;
  updateRequestStatus(id: string, status: RequestStatus): Promise<void>;
  createRequest(input: NewRequest): Promise<void>;
  createIssue(input: NewIssue): Promise<void>;
  /** 내가 PM(상속 포함)인 프로젝트의 미해결 이슈 */
  myPmIssues(userId: string): Promise<PmIssueRow[]>;
  /** PM만 가능 (DB 규칙이 강제) */
  resolveIssue(id: string, note: string | null): Promise<void>;
  getNotifySettings(userId: string): Promise<NotifySettings>;
  updateNotifySettings(userId: string, s: NotifySettings): Promise<void>;
  /** 본인에게 테스트 알림 적재 (10분 안에 발송) */
  sendTestNotification(): Promise<void>;
  dashboard(today: string): Promise<DashboardData>;
}
