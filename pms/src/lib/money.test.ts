import { describe, expect, it } from "vitest";
import { computeLedgerAmounts, executionRate, splitTotal, vatOnSupply } from "./money";

describe("splitTotal", () => {
  it("나누어떨어지는 총액", () => {
    expect(splitTotal(11_000)).toEqual({ supply: 10_000, vat: 1_000 });
  });

  it("원 미만 반올림 (기본값)", () => {
    // 10,005 / 1.1 = 9,095.45…
    expect(splitTotal(10_005)).toEqual({ supply: 9_095, vat: 910 });
  });

  it("원 미만 절사/절상 선택", () => {
    expect(splitTotal(10_005, "floor")).toEqual({ supply: 9_095, vat: 910 });
    expect(splitTotal(10_005, "ceil")).toEqual({ supply: 9_096, vat: 909 });
  });

  it("공급가액 + 부가세 = 총액이 항상 성립", () => {
    for (let t = 0; t < 5_000; t += 7) {
      for (const r of ["round", "floor", "ceil"] as const) {
        const { supply, vat } = splitTotal(t, r);
        expect(supply + vat).toBe(t);
      }
    }
  });

  it("취소·환불(음수)은 양수와 대칭", () => {
    expect(splitTotal(-10_005)).toEqual({ supply: -9_095, vat: -910 });
  });

  it("원 단위 정수가 아니면 거부", () => {
    expect(() => splitTotal(100.5)).toThrow(RangeError);
  });
});

describe("vatOnSupply", () => {
  it("공급가액의 10%", () => {
    expect(vatOnSupply(10_000)).toBe(1_000);
    expect(vatOnSupply(9_095)).toBe(910);
  });
});

describe("computeLedgerAmounts", () => {
  it("과세 총액 입력 → 공급가액·부가세 자동 분리, 합계는 공급가 기준", () => {
    expect(
      computeLedgerAmounts({ taxable: 110_000, taxableBasis: "total", zeroRated: 50_000 }),
    ).toEqual({
      taxableSupply: 100_000,
      zeroRated: 50_000,
      supplyTotal: 150_000,
      vat: 10_000,
      grandTotal: 160_000,
    });
  });

  it("과세 공급가액 입력 → 부가세만 계산", () => {
    expect(
      computeLedgerAmounts({ taxable: 100_000, taxableBasis: "supply", zeroRated: 0 }),
    ).toMatchObject({ taxableSupply: 100_000, vat: 10_000, supplyTotal: 100_000 });
  });

  it("영세만 있는 해외 결제 건", () => {
    expect(
      computeLedgerAmounts({ taxable: 0, taxableBasis: "total", zeroRated: 1_234_567 }),
    ).toMatchObject({ taxableSupply: 0, vat: 0, supplyTotal: 1_234_567 });
  });
});

describe("executionRate", () => {
  it("소수 첫째 자리", () => {
    expect(executionRate(1, 3)).toBe(33.3);
  });
  it("예산 0이면 null", () => {
    expect(executionRate(100, 0)).toBeNull();
  });
});
