import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_DEV_URL, safeConnectionOptions } from "../support/database-target";
import { getPrisma } from "@/lib/prisma";
import { withSerializableRetry } from "@/lib/services/transaction";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

afterAll(async () => { await getPrisma().$disconnect(); });

const client = new Client(safeConnectionOptions(
  process.env.TEST_DATABASE_URL!, DEFAULT_DEV_URL,
));
beforeAll(() => client.connect());
afterAll(() => client.end());

describe("N1 A1: deployed persistence schema", () => {
  it("contains all auth and domain tables in PostgreSQL", async () => {
    const result = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    expect(result.rows.map(row => row.tablename)).toEqual(expect.arrayContaining([
      "User", "Account", "Session", "Verification", "Product", "Invoice", "InvoiceItem",
    ]));
  });
});


async function fixtures() {
  await client.query(`INSERT INTO "User" (id, name, email, "updatedAt") VALUES ('owner', 'Owner', 'owner@example.com', now())`);
  const product = (await client.query<{ id: string }>(`INSERT INTO "Product" (id, "userId", sku, name, "unitPrice", "quantityOnHand", "updatedAt") VALUES (gen_random_uuid(), 'owner', 'SKU', 'Widget', 100, 10, now()) RETURNING id`)).rows[0].id;
  const invoice = (await client.query<{ id: string }>(`INSERT INTO "Invoice" (id, "userId", "invoiceNumber", "customerName", "issueDate", "dueDate", "taxRateBps", subtotal, "taxAmount", total, "updatedAt") VALUES (gen_random_uuid(), 'owner', 'INV-test', 'Customer', '2026-09-18', '2026-09-19', 1100, 200, 22, 222, now()) RETURNING id`)).rows[0].id;
  const item = (await client.query<{ id: string }>(`INSERT INTO "InvoiceItem" (id, "invoiceId", "productId", "productName", "unitPrice", quantity, "lineTotal", position) VALUES (gen_random_uuid(), $1, $2, 'Widget', 100, 2, 200, 0) RETURNING id`, [invoice, product])).rows[0].id;
  return { product, invoice, item };
}

describe("I3 I4 V6: SQL invariants", () => {
  it.each([
    ['Product', 'unitPrice', -1], ['Product', 'quantityOnHand', -1],
    ['Product', 'quantityOnHand', 1000001], ['Product', 'version', -1],
    ['Invoice', 'subtotal', -1], ['Invoice', 'taxAmount', -1], ['Invoice', 'total', -1],
    ['Invoice', 'taxRateBps', -1], ['Invoice', 'taxRateBps', 10001], ['Invoice', 'version', -1],
    ['InvoiceItem', 'unitPrice', -1], ['InvoiceItem', 'quantity', 0],
    ['InvoiceItem', 'quantity', 1000001], ['InvoiceItem', 'lineTotal', -1],
    ['InvoiceItem', 'lineTotal', 201], ['InvoiceItem', 'position', -1],
  ])("rejects %s.%s = %s", async (table, field, value) => {
    await fixtures();
    await expect(client.query(`UPDATE "${table}" SET "${field}" = $1`, [value])).rejects.toMatchObject({ code: '23514' });
  });

  it("rejects reversed dates and bigint-safe overflowing line multiplication", async () => {
    await fixtures();
    await expect(client.query(`UPDATE "Invoice" SET "dueDate" = '2026-09-17'`)).rejects.toMatchObject({ code: '23514' });
    await expect(client.query(`UPDATE "InvoiceItem" SET "unitPrice" = 2147483647, quantity = 1000000`)).rejects.toMatchObject({ code: '23514' });
  });

  it("enforces integer storage and valid invoice status", async () => {
    await fixtures();
    await expect(client.query(`UPDATE "Product" SET "unitPrice" = $1`, ['1.5'])).rejects.toMatchObject({ code: '22P02' });
    await expect(client.query(`UPDATE "Product" SET "unitPrice" = $1`, ['2147483648'])).rejects.toMatchObject({ code: '22003' });
    await expect(client.query(`UPDATE "Invoice" SET status = 'UNKNOWN'`)).rejects.toMatchObject({ code: '22P02' });
  });

  it("reserves SKU after soft deletion, but permits the same SKU for another owner", async () => {
    await fixtures();
    await client.query(`UPDATE "Product" SET "deletedAt" = now()`);
    await expect(client.query(`INSERT INTO "Product" SELECT gen_random_uuid(), "userId", sku, name, description, "unitPrice", "quantityOnHand", version, "deletedAt", "createdAt", "updatedAt" FROM "Product"`)).rejects.toMatchObject({ code: '23505' });
    await client.query(`INSERT INTO "User" (id, name, email, "updatedAt") VALUES ('other', 'Other', 'other@example.com', now())`);
    await client.query(`INSERT INTO "Product" (id, "userId", sku, name, "unitPrice", "quantityOnHand", "updatedAt") VALUES (gen_random_uuid(), 'other', 'SKU', 'Widget', 0, 0, now())`);
    expect((await client.query(`SELECT count(*) FROM "Product"`)).rows[0].count).toBe('2');
  });

  it("restricts product and owner deletion; invoice deletion cascades only its items", async () => {
    await fixtures();
    await expect(client.query(`DELETE FROM "Product"`)).rejects.toMatchObject({ code: '23503' });
    await expect(client.query(`DELETE FROM "User"`)).rejects.toMatchObject({ code: '23503' });
    await client.query(`DELETE FROM "Invoice"`);
    expect((await client.query(`SELECT count(*) FROM "InvoiceItem"`)).rows[0].count).toBe('0');
    expect((await client.query(`SELECT count(*) FROM "Product"`)).rows[0].count).toBe('1');
  });
});


describe("N1 V6: real Prisma persistence and atomicity", () => {
  it("uses a singleton and persists data across independent connections", async () => {
    const { product } = await fixtures();
    expect(getPrisma()).toBe(getPrisma());
    await getPrisma().product.update({ where: { id: product }, data: { name: 'Updated' } });
    const second = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
    try {
      expect((await second.product.findUniqueOrThrow({ where: { id: product } })).name).toBe('Updated');
    } finally { await second.$disconnect(); }
  });

  it("rolls back stock and invoice status on a late failure", async () => {
    const { product, invoice } = await fixtures();
    const failure = new Error('late failure');
    let calls = 0;
    await expect(withSerializableRetry(async tx => {
      calls++;
      const isolation = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`;
      expect(isolation[0].transaction_isolation).toBe('serializable');
      await tx.product.update({ where: { id: product }, data: { quantityOnHand: { decrement: 2 }, version: { increment: 1 } } });
      await tx.invoice.update({ where: { id: invoice }, data: { status: 'ISSUED', version: { increment: 1 } } });
      throw failure;
    })).rejects.toBe(failure);
    expect(calls).toBe(1);
    expect(await getPrisma().product.findUniqueOrThrow({ where: { id: product } })).toMatchObject({ quantityOnHand: 10, version: 0 });
    expect(await getPrisma().invoice.findUniqueOrThrow({ where: { id: invoice } })).toMatchObject({ status: 'DRAFT', version: 0 });
  });

  it("retries an actual PostgreSQL serialization conflict without losing an update", async () => {
    const { product } = await fixtures();
    let ready!: () => void;
    let release!: () => void;
    const read = new Promise<void>(resolve => { ready = resolve; });
    const updated = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    const pending = withSerializableRetry(async tx => {
      attempts++;
      await tx.product.findUniqueOrThrow({ where: { id: product } });
      if (attempts === 1) { ready(); await updated; }
      await tx.product.update({ where: { id: product }, data: { quantityOnHand: { decrement: 1 } } });
    });
    await read;
    try {
      await getPrisma().product.update({ where: { id: product }, data: { quantityOnHand: { decrement: 1 } } });
    } finally { release(); }
    await pending;
    expect(attempts).toBe(2);
    expect((await getPrisma().product.findUniqueOrThrow({ where: { id: product } })).quantityOnHand).toBe(8);
  });

  it("matches pinned BetterAuth core fields and round-trips credential/session records", async () => {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const authRequire = createRequire(require.resolve('better-auth'));
    const { getAuthTables } = await import(authRequire.resolve('@better-auth/core/db'));
    const tables = getAuthTables({});
    for (const name of ['user', 'account', 'session', 'verification']) {
      const columns = await client.query<{ column_name: string; data_type: string; is_nullable: string }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND lower(table_name) = $1`, [name],
      );
      for (const [field, definition] of Object.entries(tables[name].fields)) {
        const expected = definition as { type: string; required?: boolean };
        const actual = columns.rows.find(column => column.column_name === field);
        const types: Record<string, string> = { string: 'text', boolean: 'boolean', date: 'timestamp without time zone' };
        expect(actual, `${name}.${field}`).toMatchObject({ data_type: types[expected.type] });
        if (expected.required) expect(actual?.is_nullable).toBe('NO');
      }
    }
    const prisma = getPrisma();
    await prisma.user.create({ data: { id: 'auth', name: 'Auth', email: 'auth@example.com' } });
    await prisma.account.create({ data: { id: 'credential', accountId: 'auth', providerId: 'credential', userId: 'auth', password: 'opaque-test-hash' } });
    await prisma.session.create({ data: { id: 'session', token: 'opaque-test-token', userId: 'auth', expiresAt: new Date('2026-10-01') } });
    expect((await prisma.account.findUniqueOrThrow({ where: { id: 'credential' } })).password).toBe('opaque-test-hash');
    await expect(prisma.user.create({ data: { id: 'duplicate', name: 'Duplicate', email: 'auth@example.com' } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.user.delete({ where: { id: 'auth' } });
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
  });
});
