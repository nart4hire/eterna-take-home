import { describe, expect, it } from "vitest";
import { calculateTotals, formatMoney, parseMoney } from "@/lib/money";

describe("V2 V3: exact bounded money", () => {
  it.each([["0", 0], ["1.1", 110], ["0.29", 29], ["21474836.47", 2147483647]])("parses %s exactly", (value, cents) => {
    expect(parseMoney(value)).toBe(cents);
  });
  it.each(["", "-1", "+1", "1e2", ".1", "1.", "1.001", " 1 ", "21474836.48", "9".repeat(100)])("rejects invalid decimal %s", (value) => {
    expect(() => parseMoney(value)).toThrow();
  });
  it("formats fixed USD", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(() => formatMoney(-1)).toThrow();
  });
  it("rounds half-up once on subtotal, not per line", () => {
    expect(calculateTotals([{ unitPrice: 5, quantity: 1 }], 1000)).toEqual({ lineTotals: [5], subtotal: 5, taxAmount: 1, total: 6 });
    expect(calculateTotals([{ unitPrice: 5, quantity: 1 }, { unitPrice: 5, quantity: 1 }], 1000).taxAmount).toBe(1);
    expect(calculateTotals([{ unitPrice: 4, quantity: 1 }], 1000).taxAmount).toBe(0);
    expect(calculateTotals([{ unitPrice: 100, quantity: 2 }], 1100).total).toBe(222);
  });
  it("accepts the money maximum with zero tax", () => {
    expect(calculateTotals([{ unitPrice: 2147483647, quantity: 1 }], 0).total).toBe(2147483647);
  });
  it("rejects line, subtotal and total overflow with 422", () => {
    for (const [lines, rate] of [
      [[{ unitPrice: 2147483647, quantity: 2 }], 0],
      [[{ unitPrice: 2147483647, quantity: 1 }, { unitPrice: 1, quantity: 1 }], 0],
      [[{ unitPrice: 2147483647, quantity: 1 }], 1],
    ] as const) {
      expect(() => calculateTotals(lines, rate)).toThrow(expect.objectContaining({ status: 422 }));
    }
  });
  it("rejects unsafe, fractional and out-of-range arithmetic inputs", () => {
    for (const n of [-1, NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER]) {
      expect(() => calculateTotals([{ unitPrice: n, quantity: 1 }], 0)).toThrow();
      expect(() => calculateTotals([{ unitPrice: 0, quantity: n }], 0)).toThrow();
      expect(() => calculateTotals([], n)).toThrow();
    }
    expect(() => calculateTotals([{ unitPrice: 0, quantity: 0 }], 0)).toThrow();
    expect(() => calculateTotals([], 10001)).toThrow();
  });
});
