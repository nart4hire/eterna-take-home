import { AppError } from "@/lib/http";
import type { MoneyTotals } from "@/lib/types";

/** Integer-cent bounds from the implementation plan: single line, subtotal and total. */
const MONEY_MAX = 2147483647;

function assertBounded(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MONEY_MAX) {
    throw new AppError(422, "ARITHMETIC_BOUNDS", `${label} must be an integer between 0 and ${MONEY_MAX} cents`);
  }
}

/** Parses an exact decimal money string digit-by-digit; never parseFloat. */
export function parseMoney(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) {
    throw new AppError(422, "INVALID_MONEY", "Expected a nonnegative decimal amount with up to two fraction digits");
  }
  const [units, fraction = ""] = value.split(".");
  let cents = 0;
  for (const digit of units + fraction.padEnd(2, "0")) {
    cents = cents * 10 + digit.charCodeAt(0) - 48;
    assertBounded(cents, "Amount");
  }
  return cents;
}

export function formatMoney(cents: number): string {
  assertBounded(cents, "Cents");
  return `$${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function calculateTotals(lines: readonly { unitPrice: number; quantity: number }[], taxRateBps: number): MoneyTotals {
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10000) throw new AppError(422, "ARITHMETIC_BOUNDS", "Tax rate must be an integer between 0 and 10000 basis points");
  let subtotal = 0;
  const lineTotals = lines.map(({ unitPrice, quantity }) => {
    assertBounded(unitPrice, "Unit price");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) throw new AppError(422, "ARITHMETIC_BOUNDS", "Quantity must be an integer between 1 and 1000000");
    const lineTotal = unitPrice * quantity;
    assertBounded(lineTotal, "Line total");
    subtotal += lineTotal;
    assertBounded(subtotal, "Subtotal");
    return lineTotal;
  });
  const numerator = subtotal * taxRateBps;
  if (!Number.isSafeInteger(numerator)) throw new AppError(422, "ARITHMETIC_BOUNDS", "Tax computation exceeded safe integer bounds");
  const taxAmount = Math.floor(numerator / 10000) + (numerator % 10000 >= 5000 ? 1 : 0);
  const total = subtotal + taxAmount;
  assertBounded(total, "Total");
  return { lineTotals, subtotal, taxAmount, total };
}
