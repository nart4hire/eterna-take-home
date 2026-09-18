/**
 * Idempotent demo seed for StockFlow.
 *
 * `pnpm db:seed` runs this through `tsx prisma/seed.ts`, i.e. outside a React Server environment.
 * It therefore cannot import the `server-only`-guarded `lib/prisma.ts` / `lib/auth/server.ts`
 * (those throw on plain Node). It builds the client from the same generated Prisma client + pg
 * adapter, and hashes with the shared `lib/auth/password.ts` policy that BetterAuth is configured
 * with, so a seeded credential authenticates through the real login route.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { PrismaClient } from "@/generated/prisma/client";

export const DEMO_USER = { name: "Demo User", email: "demo@stockflow.local" } as const;
/** Public, local-only demo credential; documented for the README by T10. */
export const DEMO_PASSWORD = "StockFlowDemo!2026";

export const DEMO_PRODUCTS = [
  { sku: "DEMO-001", name: "A4 copy paper (500 sheets)", description: "Bright 80 gsm ream for everyday printing.", unitPrice: 749, quantityOnHand: 120 },
  { sku: "DEMO-002", name: "Ballpoint pens (box of 12)", description: "Black ink, medium point.", unitPrice: 899, quantityOnHand: 200 },
  { sku: "DEMO-003", name: "Desk organizer", description: "Five compartments, powder-coated steel.", unitPrice: 2450, quantityOnHand: 40 },
  { sku: "DEMO-004", name: "Wireless mouse", description: "2.4 GHz, USB receiver included.", unitPrice: 2999, quantityOnHand: 35 },
  { sku: "DEMO-005", name: "USB-C cable (2 m)", description: "60 W charging and 480 Mbps data.", unitPrice: 1299, quantityOnHand: 80 },
] as const;

/**
 * Converges the demo workspace without ever overwriting existing data:
 * the owner and credential are only created when missing, and products use an empty `update`,
 * so a rerun preserves edited stock, names, prices and soft deletion.
 */
export async function seed(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data with NODE_ENV=production");
  validatePassword(DEMO_PASSWORD);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required to seed");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO_USER.email }, include: { accounts: true } });
    const userId = existing?.id ?? randomUUID();
    if (!existing) {
      await prisma.user.create({
        data: {
          id: userId,
          name: DEMO_USER.name,
          email: DEMO_USER.email,
          accounts: {
            create: { id: randomUUID(), providerId: "credential", accountId: userId, password: await hashPassword(DEMO_PASSWORD) },
          },
        },
      });
    } else if (!existing.accounts.some((account) => account.providerId === "credential")) {
      // Repair a half-seeded owner; an existing password hash is never replaced.
      await prisma.account.create({
        data: { id: randomUUID(), userId: existing.id, providerId: "credential", accountId: existing.id, password: await hashPassword(DEMO_PASSWORD) },
      });
    }
    for (const product of DEMO_PRODUCTS) {
      await prisma.product.upsert({
        where: { userId_sku: { userId, sku: product.sku } },
        update: {},
        create: { userId, ...product },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seeding failed");
    process.exitCode = 1;
  });
}

