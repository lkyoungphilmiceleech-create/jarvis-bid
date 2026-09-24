import { describe, expect, it, vi } from "vitest";
import { dispatch, kakaoworkTransport, kstToday, MAX_ATTEMPTS, messageText, type PendingNotification } from "./notify";

const base: PendingNotification = {
  id: "n1", channel: "email", title: "[업무요청] 자료 요청", body: "김매니저님이 업무를 요청했습니다.", link: "/me", attempts: 0,
  recipient: { name: "직원", email: "staff@company.com", kakaoworkEmail: null },
};

describe("messageText", () => {
  it("앱 링크 포함", () => {
    expect(messageText(base, "https://pms.miceleech.com/")).toBe(
      "[업무요청] 자료 요청\n\n김매니저님이 업무를 요청했습니다.\n\n바로가기: https://pms.miceleech.com/me");
  });
});

describe("dispatch", () => {
  it("채널별 전송, 카카오워크 전용 이메일 우선, 실패는 기록, 재시도 한도 초과는 건너뜀", async () => {
    const email = vi.fn(async () => {});
    const kakaowork = vi.fn(async (to: string) => { if (to === "bad@company.com") throw new Error("user_not_found"); });
    const r = await dispatch([
      base,
      { ...base, id: "n2", channel: "kakaowork", recipient: { ...base.recipient, kakaoworkEmail: "kw@company.com" } },
      { ...base, id: "n3", channel: "kakaowork", recipient: { ...base.recipient, email: "bad@company.com" } },
      { ...base, id: "n4", attempts: MAX_ATTEMPTS },
    ], { email, kakaowork }, "https://pms.miceleech.com");
    expect(r.sent).toEqual(["n1", "n2"]);
    expect(r.failed).toEqual([{ id: "n3", error: "user_not_found" }]);
    expect(r.skipped).toEqual(["n4"]);
    expect(email).toHaveBeenCalledWith("staff@company.com", "[MICELEECH PMS] [업무요청] 자료 요청", expect.any(String));
    expect(kakaowork).toHaveBeenCalledWith("kw@company.com", expect.any(String));
  });
});

describe("kakaoworkTransport", () => {
  it("요청 형식", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    await kakaoworkTransport("KEY", f as unknown as typeof fetch)("a@b.com", "hi");
    expect(f).toHaveBeenCalledWith("https://api.kakaowork.com/v1/messages.send_by_email", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer KEY", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", text: "hi" }),
    }));
  });
  it("success:false 는 실패", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: "user_not_found", message: "x" } })));
    await expect(kakaoworkTransport("KEY", f as unknown as typeof fetch)("a@b.com", "hi")).rejects.toThrow("user_not_found");
  });
});

describe("kstToday", () => {
  it("UTC 15시 이후는 한국 다음 날", () => {
    expect(kstToday(new Date("2026-09-24T14:59:00Z"))).toBe("2026-09-24");
    expect(kstToday(new Date("2026-09-24T15:00:00Z"))).toBe("2026-09-25");
  });
});
