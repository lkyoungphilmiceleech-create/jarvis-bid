import { describe, expect, it } from "vitest";
import { detectColumns, importCardTab, normalizeKey, parseDate, parseWon, rowKey } from "./cardSheet";

describe("parseWon", () => {
  it("통화기호·쉼표·원·괄호 음수", () => {
    expect(parseWon("₩1,234,000")).toBe(1_234_000);
    expect(parseWon("55,000원")).toBe(55_000);
    expect(parseWon("(10,000)")).toBe(-10_000);
    expect(parseWon("-10,000")).toBe(-10_000);
    expect(parseWon("")).toBe(0);
    expect(parseWon(null)).toBe(0);
    expect(parseWon(33000)).toBe(33_000);
  });
  it("잘못된 금액 거부", () => {
    expect(() => parseWon("12a")).toThrow(RangeError);
  });
});

describe("parseDate", () => {
  it("여러 표기", () => {
    expect(parseDate("2026.09.01")).toBe("2026-09-01");
    expect(parseDate("2026-9-1")).toBe("2026-09-01");
    expect(parseDate("26.09.01")).toBe("2026-09-01");
    expect(parseDate("2026. 9. 1.")).toBe("2026-09-01");
    expect(parseDate(46266)).toBe("2026-09-01"); // 시트 일련번호
  });
  it("존재하지 않는 날짜 거부", () => {
    expect(() => parseDate("2026.02.30")).toThrow(RangeError);
  });
});

describe("detectColumns", () => {
  it("동의어·공백 무시", () => {
    expect(detectColumns(["사용 일자", "가맹점명", "이용금액", "프로젝트", "비고"])).toEqual({
      paidOn: 0, payee: 1, total: 2, project: 3, note: 4,
    });
  });
});

describe("rowKey", () => {
  it("같은 내용은 같은 키, 탭이 다르면 다른 키", () => {
    const a = rowKey("s", "홍길동", ["2026.09.01", "55,000"]);
    expect(rowKey("s", "홍길동", ["2026.09.01", "55,000"])).toBe(a);
    expect(rowKey("s", "김철수", ["2026.09.01", "55,000"])).not.toBe(a);
  });
});

describe("importCardTab", () => {
  const aliases = new Map([[normalizeKey("VivaTech"), "p-viva"], [normalizeKey("비바텍"), "p-viva"]]);

  it("금액 열 하나 → 과세 총액 분리, 프로젝트 별칭 연결, 모르는 표기는 미분류", () => {
    const { entries, issues } = importCardTab({
      spreadsheetId: "s", tabName: "홍길동", holderId: "u1", aliases,
      rows: [
        ["사용일", "가맹점", "이용금액", "프로젝트", "비고"],
        ["2026.09.01", "파리 택시", "55,000", "비바텍", ""],
        ["2026.09.02", "문구점", "11,000", "기타사업", "소모품"],
        [null, null, null, null, null],
      ],
    });
    expect(issues).toEqual([]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      paidOn: "2026-09-01", taxable: 50_000, vat: 5_000, zeroRated: 0,
      payee: "파리 택시", projectId: "p-viva", method: "corp_card", holderId: "u1", sheetRow: 2,
    });
    expect(entries[1]).toMatchObject({ projectLabel: "기타사업", projectId: null, note: "소모품" });
  });

  it("과세·영세 열이 있으면 각각 반영", () => {
    const { entries } = importCardTab({
      spreadsheetId: "s", tabName: "t", holderId: "u", aliases,
      rows: [["출금일", "과세", "영세", "프로젝트"], ["2026-09-03", "", "1,200,000", "VivaTech"]],
    });
    expect(entries[0]).toMatchObject({ taxable: 0, vat: 0, zeroRated: 1_200_000, projectId: "p-viva" });
  });

  it("행 오류는 건너뛰고 행 번호와 사유를 보고", () => {
    const { entries, issues } = importCardTab({
      spreadsheetId: "s", tabName: "t", holderId: "u", aliases,
      rows: [
        ["사용일", "금액"],
        ["2026.13.01", "1,000"],
        ["2026.09.01", "0"],
        ["2026.09.01", "2,200"],
        ["2026.09.01", "2,200"],
      ],
    });
    expect(entries).toHaveLength(1);
    expect(issues.map((i) => i.sheetRow)).toEqual([2, 3, 5]);
  });

  it("필수 열이 없으면 전체 중단", () => {
    const { entries, issues } = importCardTab({
      spreadsheetId: "s", tabName: "t", holderId: "u", aliases,
      rows: [["가맹점", "비고"], ["a", "b"]],
    });
    expect(entries).toHaveLength(0);
    expect(issues).toHaveLength(2);
  });
});
