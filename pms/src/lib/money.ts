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

// ── 외화(영세) 송금 (설계안 §26) ───────────────────────────────
// 현지 송금 금액을 원화로 환산해 영세 칸에 기록하고, 환율·수수료는 비고에 자동 표기한다.
// 부동소수점 오차를 피하기 위해 모든 소수 계산은 BigInt 정수 연산으로 처리한다.

/** 통화별 소수 자릿수 (기본 2) */
const MINOR_DIGITS: Record<string, number> = { KRW: 0, JPY: 0, VND: 0, TWD: 0, IDR: 0 };

/** 원화 고시 단위 (JPY·VND·IDR 은 100 단위당 원화로 고시) */
const DEFAULT_RATE_UNIT: Record<string, number> = { JPY: 100, VND: 100, IDR: 100 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency.toUpperCase()] ?? 2;
}

export function defaultRateUnit(currency: string): number {
  return DEFAULT_RATE_UNIT[currency.toUpperCase()] ?? 1;
}

/** "1,234.56" → { int: 123456n, scale: 2 } */
function parseDecimal(value: string, label: string): { int: bigint; scale: number } {
  const s = value.replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new RangeError(`${label} 형식이 올바르지 않습니다: ${value}`);
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const int = BigInt(whole + frac) * (s.startsWith("-") ? -1n : 1n);
  return { int, scale: frac.length };
}

/** 부호 대칭 반올림 정수 나눗셈 */
function divRoundHalfUp(a: bigint, b: bigint): bigint {
  const neg = a < 0n;
  const abs = neg ? -a : a;
  const q = (abs * 2n + b) / (b * 2n);
  return neg ? -q : q;
}

export interface ForeignConversionInput {
  currency: string;
  /** 현지 송금 금액 (예: "1,234.56") */
  foreignAmount: string;
  /** 송금일 기준 환율 (고시 단위당 원화, 예: "1,385.20") */
  rate: string;
  /** 고시 단위 (기본: JPY 100, 그 외 1) */
  rateUnit?: number;
}

/** 외화 금액 → 원화(원 단위 반올림) */
export function convertToKrw(input: ForeignConversionInput): number {
  const digits = minorDigits(input.currency);
  const amount = parseDecimal(input.foreignAmount, "송금 금액");
  if (amount.scale > digits) {
    throw new RangeError(`${input.currency}는 소수 ${digits}자리까지 입력할 수 있습니다: ${input.foreignAmount}`);
  }
  const rate = parseDecimal(input.rate, "환율");
  const unit = BigInt(input.rateUnit ?? defaultRateUnit(input.currency));
  const numerator = amount.int * rate.int;
  const denominator = 10n ** BigInt(amount.scale + rate.scale) * unit;
  return Number(divRoundHalfUp(numerator, denominator));
}

export interface RemittanceFee {
  /** 예: 송금수수료, 전신료, 중계은행수수료 */
  label: string;
  krw: number;
}

export interface RemittanceNoteInput extends ForeignConversionInput {
  /** 환율 기준일 (송금일) */
  rateDate: string;
  /** 환율 종류 (예: 전신환매도율, 매매기준율) */
  rateBasis?: string;
  fees?: RemittanceFee[];
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 비고 자동 문구: 현지 금액 × 환율(기준일) = 원화 / 수수료 내역 */
export function remittanceNote(input: RemittanceNoteInput): string {
  const krw = convertToKrw(input);
  const unit = input.rateUnit ?? defaultRateUnit(input.currency);
  const digits = minorDigits(input.currency);
  const amount = Number(input.foreignAmount.replace(/,/g, "")).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const rate = input.rate.replace(/,/g, "");
  const rateText = `${Number(rate).toLocaleString("ko-KR", { minimumFractionDigits: rate.split(".")[1]?.length ?? 0 })}원${unit === 1 ? "" : `/${unit}${input.currency.toUpperCase()}`}`;
  const basis = [input.rateDate, input.rateBasis].filter(Boolean).join(" ");
  let note = `${input.currency.toUpperCase()} ${amount} × ${rateText}(${basis}) = ${won(krw)}`;
  const fees = (input.fees ?? []).filter((f) => f.krw !== 0);
  if (fees.length > 0) {
    fees.forEach((f) => assertWon(f.krw, f.label));
    note += ` / ${fees.map((f) => `${f.label} ${won(f.krw)}`).join(", ")}`;
    note += ` (수수료 계 ${won(fees.reduce((s, f) => s + f.krw, 0))})`;
  }
  return note;
}
