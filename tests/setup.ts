import { beforeEach, expect } from "vitest";
import { resetTestDatabase } from "./support/reset";

beforeEach(async () => {
  const testPath = expect.getState().testPath ?? "";
  if (!testPath.includes("/tests/integration/")) return;
  if (process.env.STOCKFLOW_TEST_DATABASE_READY !== "1" || !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error("Run integration tests through pnpm test:integration with the database lease");
  }
  await resetTestDatabase(process.env.TEST_DATABASE_URL);
});
