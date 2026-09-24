// 알림 발송 작업 (Vercel Cron): 10분마다 발송함 처리, 매일 08:00 KST 마감 임박 알림 적재
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { dispatch, kakaoworkTransport, kstToday, MAX_ATTEMPTS, type PendingNotification, type Transports } from "../../../../src/lib/notify";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return Response.json({ error: "Supabase 미설정" }, { status: 503 });
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  let reminders: number | null = null;
  if (new URL(request.url).searchParams.get("reminders") === "1") {
    const { data, error } = await sb.rpc("enqueue_due_reminders", { p_today: kstToday() });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    reminders = data as number;
  }

  // 설정된 채널만 발송 (미설정 채널은 시도 횟수를 쓰지 않고 대기)
  const channels: ("email" | "kakaowork")[] = [];
  const smtp = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: Number(process.env.SMTP_PORT ?? 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
  if (smtp) channels.push("email");
  if (process.env.KAKAOWORK_BOT_KEY) channels.push("kakaowork");
  if (channels.length === 0) return Response.json({ reminders, sent: 0, note: "발송 채널 미설정" });

  const { data: rows, error } = await sb.from("notifications")
    .select("id,channel,title,body,link,attempts,user:profiles(name,email,kakaowork_email)")
    .is("sent_at", null).lt("attempts", MAX_ATTEMPTS).in("channel", channels)
    .order("created_at").limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const items: PendingNotification[] = (rows as any[]).map((r) => {
    const u = Array.isArray(r.user) ? r.user[0] : r.user;
    return { id: r.id, channel: r.channel, title: r.title, body: r.body, link: r.link, attempts: r.attempts,
      recipient: { name: u?.name ?? "", email: u?.email ?? "", kakaoworkEmail: u?.kakaowork_email ?? null } };
  });

  const transports: Transports = {
    email: async (to, subject, text) => {
      await smtp!.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, text });
    },
    kakaowork: process.env.KAKAOWORK_BOT_KEY ? kakaoworkTransport(process.env.KAKAOWORK_BOT_KEY) : async () => {},
  };
  const result = await dispatch(items, transports, process.env.APP_URL ?? "https://pms.miceleech.com");

  if (result.sent.length > 0) {
    await sb.from("notifications").update({ sent_at: new Date().toISOString() }).in("id", result.sent);
  }
  const attemptsOf = new Map(items.map((i) => [i.id, i.attempts]));
  for (const f of result.failed) {
    await sb.from("notifications").update({ attempts: (attemptsOf.get(f.id) ?? 0) + 1, last_error: f.error }).eq("id", f.id);
  }
  return Response.json({ reminders, sent: result.sent.length, failed: result.failed.length });
}
