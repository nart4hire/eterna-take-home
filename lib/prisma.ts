import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { stockflowPrisma?: PrismaClient };
let client: PrismaClient | undefined;

/** No environment access or connection until explicitly requested. */
export function getPrisma(): PrismaClient {
  if (client) return client;
  if (globalForPrisma.stockflowPrisma) return globalForPrisma.stockflowPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  if (process.env.NODE_ENV !== "production") globalForPrisma.stockflowPrisma = client;
  return client;
}
