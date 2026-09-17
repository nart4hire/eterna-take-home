import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
describe("A8 N2: safe environment inventory", () => {
  it("ships the complete server-only example inventory", () => {
    const file = path.join(root, ".env.example");
    expect(existsSync(file)).toBe(true);
    const example = readFileSync(file, "utf8");
    for (const key of ["DATABASE_URL", "TEST_DATABASE_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "TEST_POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "TAX_RATE_BPS", "NODE_ENV"]) {
      expect(example).toMatch(new RegExp(`^${key}=.+`, "m"));
    }
    expect(example).toContain("REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS");
    expect(example).not.toContain("NEXT_PUBLIC_");
  });
  it("ignores secrets and worktrees but makes the example trackable", () => {
    const ignored = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: root, input: ".env\n.env.local\n.env.example\n.worktrees/probe/file.ts\n", encoding: "utf8",
    }).trim().split("\n");
    expect(ignored).toEqual([".env", ".env.local", ".worktrees/probe/file.ts"]);
  });
});
