"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isLive, repo } from "../src/data";
import { supabaseServer } from "../src/data/supabase";
import { requireProfile } from "../src/data/session";
import type { RequestStatus } from "../src/data/types";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function demoLogin(form: FormData) {
  if (isLive) return;
  const user = form.get("user") === "u-admin" ? "u-admin" : "u-kim";
  (await cookies()).set("demo_user", user, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function logout() {
  if (isLive) await (await supabaseServer()).auth.signOut();
  else (await cookies()).delete("demo_user");
  redirect("/login");
}

const STATUSES: RequestStatus[] = ["requested", "accepted", "rejected", "done"];

export async function setRequestStatus(form: FormData) {
  await requireProfile();
  const id = str(form, "id");
  const status = str(form, "status") as RequestStatus | null;
  if (!id || !status || !STATUSES.includes(status)) throw new Error("잘못된 요청입니다");
  await repo.updateRequestStatus(id, status);
  revalidatePath("/me");
}

export async function createIssue(form: FormData) {
  await requireProfile();
  const projectId = str(form, "projectId");
  const problem = str(form, "problem");
  if (!projectId || !problem) throw new Error("프로젝트와 문제점은 필수입니다");
  await repo.createIssue({ projectId, problem, impact: str(form, "impact"), solution: str(form, "solution") });
  revalidatePath("/dashboard");
  redirect("/me?done=issue");
}

export async function createRequest(form: FormData) {
  await requireProfile();
  const assigneeId = str(form, "assigneeId");
  const title = str(form, "title");
  if (!assigneeId || !title) throw new Error("받는 사람과 제목은 필수입니다");
  await repo.createRequest({
    projectId: str(form, "projectId"), assigneeId, title, body: str(form, "body"), dueDate: str(form, "dueDate"),
  });
  revalidatePath("/me");
  redirect("/me?done=request");
}

export async function resolveIssue(form: FormData) {
  await requireProfile();
  const id = str(form, "id");
  if (!id) throw new Error("잘못된 요청입니다");
  await repo.resolveIssue(id, str(form, "note"));
  revalidatePath("/me");
  revalidatePath("/dashboard");
}

export async function saveNotifySettings(form: FormData) {
  const me = await requireProfile();
  await repo.updateNotifySettings(me.id, {
    notifyEmail: form.get("notifyEmail") === "on",
    notifyKakaowork: form.get("notifyKakaowork") === "on",
    kakaoworkEmail: str(form, "kakaoworkEmail"),
  });
  redirect("/settings?saved=1");
}

export async function sendTestNotification() {
  await requireProfile();
  await repo.sendTestNotification();
  redirect("/settings?test=1");
}
