import { describe, expect, it } from "vitest";
import { readEnv } from "@/lib/env";

const source = { DATABASE_URL: "postgresql://user:private-password@localhost:5432/stockflow", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "a-test-secret-with-at-least-32-characters", NODE_ENV: "test" as const };
describe("A8 V3: server environment", () => {
  it("reads only server configuration and defaults omitted tax", () => {
    expect(readEnv(source)).toEqual({ databaseUrl: source.DATABASE_URL, authUrl: source.BETTER_AUTH_URL, authSecret: source.BETTER_AUTH_SECRET, nodeEnv: "test", taxRateBps: 1100 });
    for (const tax of ["0", "1100", "10000"]) expect(readEnv({ ...source, TAX_RATE_BPS: tax }).taxRateBps).toBe(Number(tax));
  });
  it("rejects missing values and placeholder secrets without disclosing values", () => {
    for (const key of Object.keys(source)) expect(() => readEnv({ ...source, [key]: undefined })).toThrow();
    for (const secret of ["short", "REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS", "change_me".repeat(8), " ".repeat(40)]) expect(() => readEnv({ ...source, BETTER_AUTH_SECRET: secret })).toThrow();
    try { readEnv({ ...source, TAX_RATE_BPS: "bad" }); } catch (error) {
      expect(String(error)).not.toContain(source.DATABASE_URL);
      expect(String(error)).not.toContain(source.BETTER_AUTH_SECRET);
    }
  });
  it("rejects malformed URLs, non-origins and invalid modes/rates", () => {
    for (const url of ["bad", "mysql://localhost/db", "postgresql://localhost", "postgresql:///db"]) expect(() => readEnv({ ...source, DATABASE_URL: url })).toThrow();
    for (const url of ["bad", "ftp://localhost", "https://user:pw@example.com", "https://example.com/path", "https://example.com?x=1", "https://example.com#x"]) expect(() => readEnv({ ...source, BETTER_AUTH_URL: url })).toThrow();
    for (const tax of ["", "-1", "10001", "1.5", "1e3", " 1", "Infinity"]) expect(() => readEnv({ ...source, TAX_RATE_BPS: tax })).toThrow();
    // Runtime environment can violate Next's compile-time NODE_ENV union.
    expect(() => readEnv({ ...source, NODE_ENV: "staging" } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});
