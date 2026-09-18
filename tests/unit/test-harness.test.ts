import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assertSafeTestDatabase,
  parseRunnerSubset,
  runCommand,
} from "../../scripts/test";
import { resetTestDatabase, deletionOrder } from "../support/reset";

/**
 * T00 — N4/N2 harness tests.
 * Pure tests (no Docker, no database): prove the runner refuses unsafe
 * database targets, validates its subset argument, propagates child failures
 * as nonzero exits, and constrains configuration used to claim coverage.
 */

const WT_ROOT = path.resolve(__dirname, "..", "..");
const CANONICAL_TEST_URL =
  "postgresql://stockflow:pw@localhost:5433/stockflow_test";
const CANONICAL_DEV_URL = "postgresql://stockflow:pw@localhost:5432/stockflow_dev";

describe("HARNESS T00: assertSafeTestDatabase target guard", () => {
  it("T00-H1 accepts the canonical localhost:5433/stockflow_test URL", () => {
    expect(() =>
      assertSafeTestDatabase(CANONICAL_TEST_URL, CANONICAL_DEV_URL),
    ).not.toThrow();
  });

  it("T00-H2 rejects non-PostgreSQL URLs", () => {
    for (const url of [
      "mysql://stockflow:pw@localhost:5433/stockflow_test",
      "file:///tmp/stockflow_test",
      "https://localhost:5433/stockflow_test",
      "not-a-url",
    ]) {
      expect(() => assertSafeTestDatabase(url, CANONICAL_DEV_URL)).toThrow(
        /PostgreSQL/i,
      );
    }
  });

  it("T00-H3 accepts both postgres:// and postgresql:// schemes for the safe target", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgres://stockflow:pw@localhost:5433/stockflow_test",
        CANONICAL_DEV_URL,
      ),
    ).not.toThrow();
  });

  it("T00-H4 rejects the development database coordinates (host/port/db collision)", () => {
    const devSameHost =
      "postgresql://stockflow:pw@localhost:5432/stockflow_dev";
    expect(() => assertSafeTestDatabase(devSameHost, CANONICAL_DEV_URL)).toThrow(
      /development/i,
    );
  });

  it("T00-H5 rejects a database other than stockflow_test even on 5433", () => {
    expect(() =>
      assertSafeTestDatabase(
        "postgresql://stockflow:pw@localhost:5433/stockflow",
        CANONICAL_DEV_URL,
      ),
    ).toThrow(/stockflow_test/);
  });

  it("T00-H6 rejects ports other than 5433", () => {
    for (const port of ["5432", "5434"]) {
      expect(() =>
        assertSafeTestDatabase(
          `postgresql://stockflow:pw@localhost:${port}/stockflow_test`,
          CANONICAL_DEV_URL,
        ),
      ).toThrow(/5433/);
    }
  });

  it("T00-H7 rejects remote (non-loopback) hosts", () => {
    for (const host of ["db.example.com", "10.0.0.5", "192.168.1.20"]) {
      expect(() =>
        assertSafeTestDatabase(
          `postgresql://stockflow:pw@${host}:5433/stockflow_test`,
          CANONICAL_DEV_URL,
        ),
      ).toThrow(/localhost/i);
    }
  });
});

describe("HARNESS T00: runner subset argument", () => {
  it("T00-H8 accepts exactly unit | integration", () => {
    expect(parseRunnerSubset("unit")).toBe("unit");
    expect(parseRunnerSubset("integration")).toBe("integration");
  });

  it("T00-H9 rejects unknown, missing and retired subsets instead of guessing", () => {
    for (const bad of ["", "all", "UNIT", "smoke", "e2e"]) {
      expect(() => parseRunnerSubset(bad)).toThrow(
        /unit\|integration|subset/i,
      );
    }
    expect(parseRunnerSubset(undefined)).toBeUndefined(); // full suite per plan
  });
});

describe("HARNESS T00: child failure propagation and process hygiene", () => {
  it("T00-H10 runCommand surfaces a failing child's exit code as an error", () => {
    expect(() =>
      runCommand(
        process.execPath,
        ["-e", "process.exit(7)"],
        path.resolve(__dirname, "..", ".."),
      ),
    ).toThrow(/exit code 7/);
  });

  it("T00-H11 runCommand succeeds and returns when the child exits zero", () => {
    const result = runCommand(
      process.execPath,
      ["-e", "process.stdout.write('ok')"],
      path.resolve(__dirname, "..", ".."),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ok");
  });
});


describe("HARNESS T00: configuration that prevents false coverage claims", () => {
  const pkg = JSON.parse(
    readFileSync(path.join(WT_ROOT, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("T00-H12 `pnpm test` is the explicit subset runner, not a bare pass-through", () => {
    expect(pkg.scripts.test).toBe("tsx scripts/test.ts");
  });

  it("T00-H13 vitest config disables passWithNoTests so missing suites fail", () => {
    const config = readFileSync(path.join(WT_ROOT, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/passWithNoTests:\s*false/);
    expect(config).toMatch(/include:[\s\S]*tests/);
  });

  it("T00-H14 vitest config keeps files serial with a sane default timeout", () => {
    const config = readFileSync(path.join(WT_ROOT, "vitest.config.ts"), "utf8");
    expect(config).toMatch(/fileParallelism:\s*false/);
    expect(config).toMatch(/testTimeout:\s*\d+/);
  });

  it("T00-H24 the retired Playwright layer is gone from config, manifest and ignores", () => {
    expect(existsSync(path.join(WT_ROOT, "playwright.config.ts"))).toBe(false);
    const manifest = JSON.parse(
      readFileSync(path.join(WT_ROOT, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(manifest.scripts["test:e2e"]).toBeUndefined();
    expect(manifest.devDependencies["@playwright/test"]).toBeUndefined();
    const runner = readFileSync(path.join(WT_ROOT, "scripts/test.ts"), "utf8");
    expect(runner).not.toMatch(/playwright/i);
    const ignore = readFileSync(path.join(WT_ROOT, ".gitignore"), "utf8");
    expect(ignore).not.toMatch(/playwright-report|test-results/);
    const eslint = readFileSync(path.join(WT_ROOT, "eslint.config.mjs"), "utf8");
    expect(eslint).not.toMatch(/playwright/i);
  });

  it("T00-H16 compose test database is isolated on localhost:5433 with tmpfs and profile", () => {
    const compose = readFileSync(
      path.join(WT_ROOT, "docker-compose.yml"),
      "utf8",
    );
    expect(compose).toMatch(/5433:5432/);
    expect(compose).toMatch(/tmpfs:/);
    expect(compose).toMatch(/profiles:([\s\S]*)test/);
    expect(compose).toMatch(/stockflow_test/);
    expect(compose).toMatch(/5432:5432/);
    expect(compose).toMatch(/postgres:17/);
  });

  it("T00-H25 the container contract pins the mise versions and starts the migrated app", () => {
    const dockerfile = readFileSync(path.join(WT_ROOT, "Dockerfile"), "utf8");
    expect(dockerfile).toMatch(/FROM node:24\.21\.0/);
    expect(dockerfile).toMatch(/pnpm@12\.4\.2/);
    const entrypoint = readFileSync(
      path.join(WT_ROOT, "docker", "entrypoint.sh"),
      "utf8",
    );
    expect(entrypoint).toMatch(/db:migrate/);
    expect(entrypoint).toMatch(/db:seed/);
    expect(entrypoint).toMatch(/pnpm start/);
    const compose = readFileSync(
      path.join(WT_ROOT, "docker-compose.yml"),
      "utf8",
    );
    expect(compose).toMatch(/app:/);
    expect(compose).toMatch(/3000:3000/);
    expect(compose).toMatch(/condition: service_healthy/);
    expect(compose).toMatch(/DATABASE_URL:.*@postgres:5432/);
    expect(compose).toMatch(/BETTER_AUTH_SECRET/);
  });
});

describe("HARNESS T00: schema-independent reset helper", () => {
  it("T00-H17 reset refuses the development database before any mutation", async () => {
    await expect(
      resetTestDatabase(
        "postgresql://stockflow:pw@localhost:5432/stockflow_dev",
      ),
    ).rejects.toThrow(/development|safe test database/i);
  });

  it("T00-H18 reset refuses remote hosts and wrong databases/ports", async () => {
    await expect(
      resetTestDatabase(
        "postgresql://stockflow:pw@10.1.2.3:5433/stockflow_test",
      ),
    ).rejects.toThrow(/localhost/i);
    await expect(
      resetTestDatabase(
        "postgresql://stockflow:pw@localhost:5433/other_db",
      ),
    ).rejects.toThrow(/stockflow_test/);
  });

  it("T00-H19 FK delete order runs children before parents and ends with user", () => {
    const order = deletionOrder(["user", "product", "invoice", "invoice_item", "account", "session"], [
      { child: "invoice_item", parent: "invoice" }, { child: "invoice_item", parent: "product" },
      { child: "invoice", parent: "user" }, { child: "invoice", parent: "product" },
      { child: "product", parent: "user" }, { child: "account", parent: "user" }, { child: "session", parent: "user" },
    ]);
    expect(order.length).toBeGreaterThan(0);
    expect(order[order.length - 1]).toBe("user");
    const position = (t: string) => order.indexOf(t.toLowerCase());
    expect(position("invoice_item")).toBeLessThan(position("invoice"));
    expect(position("invoice")).toBeLessThan(position("product"));
    expect(position("session")).toBeLessThan(position("user"));
    expect(position("account")).toBeLessThan(position("user"));
  });

  it("T00-H20 runner exposes the documented safety and child primitives", () => {
    const runner = readFileSync(path.join(WT_ROOT, "scripts/test.ts"), "utf8");
    expect(runner).toMatch(/runCommand/);
    expect(runner).toMatch(/assertSafeTestDatabase/);
  });
});

describe("HARNESS FIX: every local gate generates the Prisma client itself", () => {
  const pkg = JSON.parse(
    readFileSync(path.join(WT_ROOT, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("T00-H21 the unit fast path generates the client before vitest", () => {
    const runner = readFileSync(path.join(WT_ROOT, "scripts/test.ts"), "utf8");
    const fastPath =
      /if \(suites\.every\(suite => suite === "unit"\)\)[\s\S]*?\n  \}/.exec(
        runner,
      );
    expect(fastPath, "unit fast path not found in scripts/test.ts").not.toBeNull();
    const block = fastPath![0];
    expect(block).toMatch(/\["db:generate"\]/);
    expect(block.indexOf("db:generate")).toBeLessThan(block.indexOf("vitest"));
  });

  it("T00-H22 `pnpm test:unit` goes through the runner so it generates too", () => {
    expect(pkg.scripts["test:unit"]).toBe("tsx scripts/test.ts unit");
  });

  it("T00-H23 typecheck and build generate the client themselves", () => {
    for (const script of ["typecheck", "build"]) {
      expect(pkg.scripts[script], `${script} must generate first`).toMatch(
        /^prisma generate && /,
      );
    }
  });

  it("T00-H27 the documented local workflow generates the client itself", () => {
    // Found by the T10 release rehearsal: on a fresh clone `generated/prisma` is absent, so
    // `pnpm db:seed` (tsx imports @/generated/prisma/client) and `pnpm dev` (first request compiles
    // lib/prisma.ts) failed with MODULE_NOT_FOUND, while the README promised no manual generate step.
    for (const script of ["dev", "db:migrate", "db:seed"]) {
      expect(pkg.scripts[script], `${script} must generate first`).toMatch(
        /^prisma generate && /,
      );
    }
  });
});

describe("HARNESS FIX: DB-backed children get a deterministic test environment", () => {
  it("T00-H26 the runner pins TAX_RATE_BPS for its children instead of inheriting .env", () => {
    // Invoice suites assert exact cents derived from the tax rate, so a developer's .env (or its
    // absence) must not change them: the runner assigns its own value after loading .env, exactly
    // like DATABASE_URL, BETTER_AUTH_URL and NODE_ENV.
    const runner = readFileSync(path.join(WT_ROOT, "scripts/test.ts"), "utf8");
    const injected = /Object\.assign\(env,\s*\{([\s\S]*?)\n  \}\);/.exec(runner);
    expect(injected, "injected child environment not found in scripts/test.ts").not.toBeNull();
    expect(injected![1]).toMatch(/TAX_RATE_BPS:\s*"1100"/);
  });
});

