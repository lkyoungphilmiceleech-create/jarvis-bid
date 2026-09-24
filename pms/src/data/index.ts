import "server-only";
import { demoRepo } from "./demo";
import { supabaseRepo } from "./supabase";
import type { Repo } from "./types";

/** Supabase 환경변수가 있으면 운영 모드, 없으면 체험(데모) 모드 */
export const isLive = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const repo: Repo = isLive ? supabaseRepo : demoRepo;
