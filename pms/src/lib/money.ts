// 정산 장부 금액 계산 규칙 (설계안 §16, §22)
// - 모든 금액은 원 단위 정수.
// - 과세는 '총액(부가세 포함)' 또는 '공급가액' 중 하나로 입력하며, 저장은 항상 공급가액 + 부가세로 분리한다.
// - 합계 = 과세 공급가액 + 영세 (공급가액 기준), 부가세는 같은 행 별도 칸.

export type TaxableBasis = "total" | "supply";

/** 총액 → 공급가액 환산 시 원 미만 처리 방식. 기본값은 반올림(카드전표 관행). */
export type Rounding = "round" | "floor" | "ceil";

export interface LedgerAmountInput {
  /** 과세 입력값 */
  taxable: number;
  /** 과세 입력값이 총액인지 공급가액인지 */
  taxableBasis: TaxableBasis;
  /** 영세(공급가액) */
  zeroRated: number;
  rounding?: Rounding;
}

export interface LedgerAmounts {
  /** 과세 공급가액 */
  taxableSupply: number;
  /** 영세 */
  zeroRated: number;
  /** 합계 = 과세 공급가액 + 영세 */
  supplyTotal: number;
  /** 부가세 */
  vat: number;
  /** 실제 지출액 = 합계 + 부가세 */
  grandTotal: number;
}

const VAT_RATE_NUM = 1; // 10% = 1/10
const VAT_RATE_DEN = 10;

function assertWon(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`${label}은(는) 원 단위 정수여야 합니다: ${n}`);
  }
}

/** 정수 나눗셈 a/b 를 지정 방식으로 정수화 (음수=취소·환불 건 대칭 처리). */
function divide(a: number, b: number, rounding: Rounding): number {
  const sign = Math.sign(a);
  const abs = Math.abs(a);
  const q = Math.floor(abs / b);
  const r = abs - q * b;
  let result = q;
  if (rounding === "round" && r * 2 >= b) result = q + 1;
  if (rounding === "ceil" && r > 0) result = q + 1;
  return sign * result;
}

/** 부가세 포함 총액을 공급가액과 부가세로 분리한다. 공급가액 + 부가세 = 총액이 항상 성립한다. */
export function splitTotal(total: number, rounding: Rounding = "round"): { supply: number; vat: number } {
  assertWon(total, "총액");
  const supply = divide(total * VAT_RATE_DEN, VAT_RATE_DEN + VAT_RATE_NUM, rounding);
  return { supply, vat: total - supply };
}

/** 공급가액에 대한 부가세. */
export function vatOnSupply(supply: number, rounding: Rounding = "round"): number {
  assertWon(supply, "공급가액");
  return divide(supply * VAT_RATE_NUM, VAT_RATE_DEN, rounding);
}

export function computeLedgerAmounts(input: LedgerAmountInput): LedgerAmounts {
  const rounding = input.rounding ?? "round";
  assertWon(input.zeroRated, "영세");

  let taxableSupply: number;
  let vat: number;
  if (input.taxableBasis === "total") {
    ({ supply: taxableSupply, vat } = splitTotal(input.taxable, rounding));
  } else {
    assertWon(input.taxable, "과세");
    taxableSupply = input.taxable;
    vat = vatOnSupply(taxableSupply, rounding);
  }

  const supplyTotal = taxableSupply + input.zeroRated;
  return {
    taxableSupply,
    zeroRated: input.zeroRated,
    supplyTotal,
    vat,
    grandTotal: supplyTotal + vat,
  };
}

/** 예산 대비 집행률(%) — 소수 첫째 자리까지. 예산 0이면 null. */
export function executionRate(spent: number, budget: number): number | null {
  if (budget === 0) return null;
  return Math.round((spent / budget) * 1000) / 10;
}
