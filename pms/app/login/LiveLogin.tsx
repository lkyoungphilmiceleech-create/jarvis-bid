"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";

export default function LiveLogin() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setMsg(null);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const res = mode === "in"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { data: { name: String(form.get("name")) } } });
    setBusy(false);
    if (res.error) return setMsg(res.error.message);
    if (mode === "up" && !res.data.session) {
      return setMsg("가입 확인 메일을 보냈습니다. 메일 확인 후 로그인하면 관리자 승인 대기 상태가 됩니다.");
    }
    window.location.href = "/";
  }

  return (
    <div className="card">
      <h2>{mode === "in" ? "로그인" : "가입 신청"}</h2>
      <form action={submit} className="stack">
        {mode === "up" && <label>이름<input name="name" required autoComplete="name" /></label>}
        <label>이메일<input name="email" type="email" required autoComplete="email" /></label>
        <label>비밀번호<input name="password" type="password" required minLength={8}
          autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        <button disabled={busy}>{mode === "in" ? "로그인" : "가입 신청"}</button>
      </form>
      {msg && <p className="sub">{msg}</p>}
      <p className="sub">
        {mode === "in" ? "처음이신가요? " : "이미 계정이 있나요? "}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); }}>
          {mode === "in" ? "가입 신청" : "로그인"}
        </a>
      </p>
    </div>
  );
}
