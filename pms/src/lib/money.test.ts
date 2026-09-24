import { describe, expect, it } from "vitest";
import {
  computeLedgerAmounts,
  convertToKrw,
  executionRate,
  remittanceNote,
  splitTotal,
  vatOnSupply,
} from "./money";

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

describe("convertToKrw", () => {
  it("USD 센트 단위 × 환율, 원 단위 반올림", () => {
    // 1,234.56 × 1,385.20 = 1,710,112.51…
    expect(convertToKrw({ currency: "USD", foreignAmount: "1,234.56", rate: "1,385.20" })).toBe(1_710_113);
  });

  it("EUR", () => {
    expect(convertToKrw({ currency: "EUR", foreignAmount: "10000", rate: "1512.35" })).toBe(15_123_500);
  });

  it("JPY 는 100엔당 환율로 계산", () => {
    // 250,000엔 × 930.50원/100엔 = 2,326,250원
    expect(convertToKrw({ currency: "JPY", foreignAmount: "250000", rate: "930.50" })).toBe(2_326_250);
  });

  it("부동소수점 오차 없음 (0.1 × 3 류)", () => {
    expect(convertToKrw({ currency: "USD", foreignAmount: "0.10", rate: "3" })).toBe(0);
    expect(convertToKrw({ currency: "USD", foreignAmount: "0.50", rate: "1" })).toBe(1);
    expect(convertToKrw({ currency: "USD", foreignAmount: "1.15", rate: "1000.10" })).toBe(1_150);
  });

  it("통화 소수 자릿수 초과·형식 오류 거부", () => {
    expect(() => convertToKrw({ currency: "JPY", foreignAmount: "100.5", rate: "930" })).toThrow(RangeError);
    expect(() => convertToKrw({ currency: "USD", foreignAmount: "abc", rate: "1" })).toThrow(RangeError);
  });
});

describe("remittanceNote", () => {
  it("환율 기준일·수수료를 비고에 표기", () => {
    expect(
      remittanceNote({
        currency: "USD",
        foreignAmount: "1234.56",
        rate: "1385.20",
        rateDate: "2026-09-01",
        rateBasis: "전신환매도율",
        fees: [
          { label: "송금수수료", krw: 10_000 },
          { label: "전신료", krw: 8_000 },
          { label: "중계은행수수료", krw: 0 },
        ],
      }),
    ).toBe(
      "USD 1,234.56 × 1,385.20원(2026-09-01 전신환매도율) = 1,710,113원 / 송금수수료 10,000원, 전신료 8,000원 (수수료 계 18,000원)",
    );
  });

  it("엔화는 고시 단위 표기", () => {
    expect(
      remittanceNote({ currency: "JPY", foreignAmount: "250000", rate: "930.50", rateDate: "2026-09-01" }),
    ).toBe("JPY 250,000 × 930.50원/100JPY(2026-09-01) = 2,326,250원");
  });
});
