import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { assertSafeTestDatabase, DEFAULT_DEV_URL, DEFAULT_TEST_URL } from "../tests/support/database-target";
import { resetTestDatabase } from "../tests/support/reset";
export { assertSafeTestDatabase } from "../tests/support/database-target";
export type Subset = "unit" | "integration";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseRunnerSubset(value?: string): Subset | undefined {
  if (value === undefined) return undefined; // no argument means the complete release suite
  if (value === "unit" || value === "integration") return value;
  throw new Error("Invalid subset: expected unit|integration");
}

export function runCommand(command: string, args: string[], cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw new Error(`Unable to run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with exit code ${result.status ?? result.signal}`);
  return result;
}
function suiteExists(subset: Subset): boolean {
  const directory = path.join(root, "tests", subset);
  return existsSync(directory) && readdirSync(directory, { recursive: true, withFileTypes: true }).some(entry => entry.isFile() && entry.name.endsWith(".test.ts"));
}

export async function runTests(subset?: Subset): Promise<void> {
  const suites: Subset[] = subset ? [subset] : ["unit", "integration"];
  for (const suite of suites) {
    if (!suiteExists(suite)) throw new Error(`Unavailable ${suite} suite: implement its task before claiming coverage`);
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  config({ path: path.join(root, ".env"), processEnv: env, quiet: true });
  if (suites.every(suite => suite === "unit")) {
    runCommand("pnpm", ["db:generate"], root, env); // offline; keeps the unit path Docker-free but self-sufficient
    runCommand("pnpm", ["exec", "vitest", "run", "tests/unit"], root, env);
    return;
  }
  const devUrl = env.DATABASE_URL ?? DEFAULT_DEV_URL;
  const testUrl = env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;
  assertSafeTestDatabase(testUrl, devUrl);
  if (!existsSync(path.join(root, "prisma/schema.prisma")) || !existsSync(path.join(root, "prisma/migrations"))) {
    throw new Error("T01 schema/migration phase is unavailable");
  }
  Object.assign(env, {
    DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl, STOCKFLOW_DEV_DATABASE_URL: devUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:3100",
    NODE_ENV: "test", STOCKFLOW_TEST_DATABASE_READY: "1",
  });
  // Caller must hold the coordinator postgres-test lease.
  runCommand("docker", ["compose", "--profile", "test", "up", "-d", "--wait", "postgres-test"], root, env);
  runCommand("pnpm", ["db:generate"], root, env);
  runCommand("pnpm", ["db:migrate"], root, env);
  for (const suite of suites) {
    if (suite !== "unit") await resetTestDatabase(testUrl, devUrl);
    runCommand("pnpm", ["exec", "vitest", "run", `tests/${suite}`], root, env);
  }
  // Shared Compose services are intentionally not torn down by a worker.
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  Promise.resolve().then(() => {
    if (process.argv.length > 3) throw new Error("Expected at most one test subset");
    return runTests(parseRunnerSubset(process.argv[2]));
  }).catch(error => {
    console.error(error instanceof Error ? error.message : "Test runner failed");
    process.exitCode = 1;
  });
}
