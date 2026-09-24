// 로그인 직후 첫 화면 (설계안 §36): 관리자 → 대시보드, 직원 → 내 업무, 미승인 → 승인 대기

export interface SessionProfile {
  role: "admin" | "member";
  active: boolean;
}

export function landingPath(profile: SessionProfile | null): string {
  if (!profile) return "/login";
  if (!profile.active) return "/pending";
  return profile.role === "admin" ? "/dashboard" : "/me";
}
