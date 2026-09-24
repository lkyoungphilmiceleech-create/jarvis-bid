import "server-only";
import { redirect } from "next/navigation";
import { landingPath } from "../lib/landing";
import { repo } from "./index";
import type { Profile } from "./types";

/** 승인된 사용자만 통과. 관리자 전용 화면은 adminOnly */
export async function requireProfile(opts: { adminOnly?: boolean } = {}): Promise<Profile> {
  const profile = await repo.currentProfile();
  if (!profile || !profile.active) redirect(landingPath(profile));
  if (opts.adminOnly && profile.role !== "admin") redirect("/me");
  return profile;
}
