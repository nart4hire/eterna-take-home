import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { withSerializableRetry } from "@/lib/services/transaction";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ $transaction: transaction }) }));
const conflict = () => new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "7.9.1" });
beforeEach(() => { transaction.mockReset(); });

describe("V6: bounded serializable transactions", () => {
  it("returns the callback value and requests Serializable isolation", async () => {
    const tx = {} as Prisma.TransactionClient;
    const work = vi.fn(async () => 42);
    transaction.mockImplementationOnce((callback) => callback(tx));
    expect(await withSerializableRetry(work)).toBe(42);
    expect(work).toHaveBeenCalledWith(tx);
    expect(transaction).toHaveBeenCalledWith(work, { isolationLevel: 'Serializable' });
  });
  it("retries recognized conflicts and succeeds on the third total attempt", async () => {
    transaction.mockRejectedValueOnce(conflict()).mockRejectedValueOnce(conflict()).mockResolvedValueOnce('ok');
    expect(await withSerializableRetry(async () => 'ok')).toBe('ok');
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it("rethrows the final recognized error unchanged after three attempts", async () => {
    const error = conflict();
    transaction.mockRejectedValue(error);
    await expect(withSerializableRetry(async () => 1)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it.each([
    new Error('application failure'),
    { code: 'P2034' },
    new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: '7.9.1' }),
  ])("does not retry unrecognized/nonretryable errors: %s", async (error) => {
    transaction.mockRejectedValue(error);
    await expect(withSerializableRetry(async () => 1)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
