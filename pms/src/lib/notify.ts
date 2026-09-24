// 알림 발송 (설계안 §39): notifications 발송함 → 이메일(회사 SMTP) · 카카오워크(Bot 메시지)
// 전송 수단은 주입받아 테스트와 운영을 분리한다.

export interface PendingNotification {
  id: string;
  channel: "email" | "kakaowork";
  title: string;
  body: string;
  link: string | null;
  attempts: number;
  recipient: { name: string; email: string; kakaoworkEmail: string | null };
}

export interface Transports {
  email(to: string, subject: string, text: string): Promise<void>;
  kakaowork(email: string, text: string): Promise<void>;
}

export interface DispatchResult {
  sent: string[];
  failed: { id: string; error: string }[];
  skipped: string[];
}

/** 이 횟수 이상 실패한 알림은 더 이상 재시도하지 않는다 */
export const MAX_ATTEMPTS = 5;

export function messageText(n: PendingNotification, appUrl: string): string {
  const url = n.link ? `${appUrl.replace(/\/$/, "")}${n.link}` : appUrl;
  return `${n.title}\n\n${n.body}\n\n바로가기: ${url}`;
}

export async function dispatch(
  items: PendingNotification[], transports: Transports, appUrl: string,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: [], failed: [], skipped: [] };
  for (const n of items) {
    if (n.attempts >= MAX_ATTEMPTS) {
      result.skipped.push(n.id);
      continue;
    }
    try {
      const text = messageText(n, appUrl);
      if (n.channel === "email") {
        await transports.email(n.recipient.email, `[MICELEECH PMS] ${n.title}`, text);
      } else {
        await transports.kakaowork(n.recipient.kakaoworkEmail ?? n.recipient.email, text);
      }
      result.sent.push(n.id);
    } catch (e) {
      result.failed.push({ id: n.id, error: (e as Error).message.slice(0, 500) });
    }
  }
  return result;
}

/** 카카오워크 Bot: 이메일로 사용자를 찾아 1:1 채팅방에 메시지 전송 */
export function kakaoworkTransport(appKey: string, fetchImpl: typeof fetch = fetch): Transports["kakaowork"] {
  return async (email, text) => {
    const res = await fetchImpl("https://api.kakaowork.com/v1/messages.send_by_email", {
      method: "POST",
      headers: { Authorization: `Bearer ${appKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, text }),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { code?: string; message?: string } };
    if (!res.ok || body.success === false) {
      throw new Error(`카카오워크 ${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim());
    }
  };
}

/** 한국 시간 기준 오늘 (마감 알림 기준일) */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
