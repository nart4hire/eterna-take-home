import { Client } from "pg";
import { DEFAULT_DEV_URL, safeConnectionOptions } from "./database-target";

export function deletionOrder(tables: string[], foreignKeys: { child: string; parent: string }[]): string[] {
  const pending = new Set(tables);
  const ordered: string[] = [];
  while (pending.size) {
    const next = [...pending].filter(parent => !foreignKeys.some(fk => fk.parent === parent && fk.child !== parent && pending.has(fk.child))).sort();
    if (!next.length) throw new Error("Cannot safely reset cyclic foreign keys");
    for (const table of next) { ordered.push(table); pending.delete(table); }
  }
  return ordered;
}
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Discover actual tables/foreign keys: no Prisma schema or auth fixture dependency. */
export async function resetTestDatabase(testUrl: string, devUrl = process.env.STOCKFLOW_DEV_DATABASE_URL ?? DEFAULT_DEV_URL): Promise<void> {
  const client = new Client(safeConnectionOptions(testUrl, devUrl));
  try {
    await client.connect();
    const identity = await client.query<{ db: string }>("SELECT current_database() AS db");
    if (identity.rows[0]?.db !== "stockflow_test") throw new Error("Unsafe connected database identity");
    await client.query("BEGIN");
    const tables = await client.query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'");
    const keys = await client.query<{ child: string; parent: string }>(`SELECT child.relname AS child, parent.relname AS parent
      FROM pg_constraint fk JOIN pg_class child ON child.oid = fk.conrelid
      JOIN pg_class parent ON parent.oid = fk.confrelid JOIN pg_namespace ns ON ns.oid = child.relnamespace
      WHERE fk.contype = 'f' AND ns.nspname = 'public'`);
    for (const table of deletionOrder(tables.rows.map(row => row.name), keys.rows)) {
      await client.query(`DELETE FROM public.${quote(table)}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end(); }
}
