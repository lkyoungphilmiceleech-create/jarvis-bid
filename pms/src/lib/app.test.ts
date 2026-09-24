import { describe, expect, it } from "vitest";
import { landingPath } from "./landing";
import { bucketOf, dday, groupDueItems, localToday, type DueItem } from "./myWork";
import { buildTree } from "./tree";

describe("landingPath", () => {
  it("역할별 첫 화면", () => {
    expect(landingPath(null)).toBe("/login");
    expect(landingPath({ role: "admin", active: false })).toBe("/pending");
    expect(landingPath({ role: "admin", active: true })).toBe("/dashboard");
    expect(landingPath({ role: "member", active: true })).toBe("/me");
  });
});

describe("myWork", () => {
  const today = "2026-09-24";
  it("버킷 경계", () => {
    expect(bucketOf("2026-09-23", today)).toBe("overdue");
    expect(bucketOf("2026-09-24", today)).toBe("today");
    expect(bucketOf("2026-10-01", today)).toBe("week");
    expect(bucketOf("2026-10-02", today)).toBe("later");
    expect(bucketOf(null, today)).toBe("later");
  });
  it("월말·연말 경계", () => {
    expect(bucketOf("2027-01-01", "2026-12-31")).toBe("week");
  });
  it("완료 제외 + 마감순 정렬", () => {
    const item = (id: string, dueDate: string | null, done = false): DueItem =>
      ({ id, kind: "task", title: id, projectName: null, dueDate, done });
    const g = groupDueItems([item("b", "2026-09-28"), item("a", "2026-09-25"), item("x", "2026-09-24", true)], today);
    expect(g.week.map((i) => i.id)).toEqual(["a", "b"]);
    expect(g.today).toEqual([]);
  });
  it("D-day", () => {
    expect(dday("2026-09-24", today)).toBe("D-DAY");
    expect(dday("2026-09-27", today)).toBe("D-3");
    expect(dday("2026-09-22", today)).toBe("D+2");
  });
  it("기기 시간대 기준 오늘", () => {
    expect(localToday(new Date(2026, 8, 24, 23, 59))).toBe("2026-09-24");
  });
});

describe("buildTree", () => {
  it("하위 중첩·이름순, 상위 없으면 최상위", () => {
    const rows = [
      { id: "p", parent_id: null, name: "KOCCA 해외마켓" },
      { id: "s", parent_id: "p", name: "SWITCH" },
      { id: "a", parent_id: "p", name: "Ai4" },
      { id: "o", parent_id: "missing", name: "고아" },
    ];
    const t = buildTree(rows);
    expect(t.map((n) => n.project.id)).toEqual(["p", "o"].sort((x, y) =>
      rows.find((r) => r.id === x)!.name.localeCompare(rows.find((r) => r.id === y)!.name, "ko")));
    expect(t.find((n) => n.project.id === "p")!.children.map((n) => n.project.name)).toEqual(["Ai4", "SWITCH"]);
  });
});
