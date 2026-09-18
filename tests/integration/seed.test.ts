import { getRounds } from "bcryptjs";
import { afterAll, describe, expect, it } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { BCRYPT_COST, hashPassword, verifyPassword } from "@/lib/auth/password";
import { getPrisma } from "@/lib/prisma";
import { DEMO_PASSWORD, DEMO_PRODUCTS, DEMO_USER, seed } from "@/prisma/seed";
import { makeRequest, sessionCookieFrom, withCookie } from "../helpers";

afterAll(async () => { await getPrisma().$disconnect(); });

const loginDemo = () => loginRoute(makeRequest("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: DEMO_USER.email, password: DEMO_PASSWORD }),
}));

describe("N3: the seed creates a demo owner, five products and a working credential", () => {
  it("seeds exactly one demo user with five owned products", async () => {
    expect(DEMO_PRODUCTS).toHaveLength(5);
    await seed();

    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_USER.email }, include: { accounts: true, products: true } });
    expect(user.name).toBe(DEMO_USER.name);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({ providerId: "credential", accountId: user.id });
    expect(getRounds(user.accounts[0]!.password!)).toBe(BCRYPT_COST);
    expect(await verifyPassword({ password: DEMO_PASSWORD, hash: user.accounts[0]!.password! })).toBe(true);

    expect(user.products).toHaveLength(5);
    expect(new Set(user.products.map((product) => product.sku))).toEqual(new Set(DEMO_PRODUCTS.map((product) => product.sku)));
    for (const product of user.products) {
      const expected = DEMO_PRODUCTS.find((candidate) => candidate.sku === product.sku)!;
      expect(product).toMatchObject({ unitPrice: expected.unitPrice, quantityOnHand: expected.quantityOnHand, deletedAt: null, userId: user.id });
    }
  });

  it("lets the documented demo credentials authenticate through the real routes", async () => {
    await seed();
    const login = await loginDemo();
    expect(login.status).toBe(200);
    const cookie = sessionCookieFrom(login);
    const session = await sessionRoute(makeRequest("/api/auth/session", withCookie(cookie)));
    expect(session.status).toBe(200);
    const body = (await session.json()) as { data: { email: string } };
    expect(body.data.email).toBe(DEMO_USER.email);
  });
});

describe("N3: reseeding is idempotent and never resets stock or passwords", () => {
  it("keeps existing stock, soft deletion and credentials unchanged", async () => {
    await seed();
    const prisma = getPrisma();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_USER.email } });
    const [renamed, removed] = await prisma.product.findMany({ where: { userId: owner.id }, orderBy: { sku: "asc" } });
    await prisma.product.update({ where: { id: renamed!.id }, data: { name: "Renamed by the test", quantityOnHand: 3 } });
    await prisma.product.update({ where: { id: removed!.id }, data: { deletedAt: new Date() } });
    const rotated = await hashPassword("Rotated-Password-2026");
    await prisma.account.updateMany({ where: { userId: owner.id }, data: { password: rotated } });

    await seed();

    const afterUser = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_USER.email }, include: { accounts: true } });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.product.count({ where: { userId: owner.id } })).toBe(5);
    const afterRenamed = await prisma.product.findUniqueOrThrow({ where: { id: renamed!.id } });
    expect(afterRenamed).toMatchObject({ name: "Renamed by the test", quantityOnHand: 3 });
    const afterRemoved = await prisma.product.findUniqueOrThrow({ where: { id: removed!.id } });
    expect(afterRemoved.deletedAt).not.toBeNull(); // soft deletion is not resurrected
    expect(afterUser.accounts[0]!.password).toBe(rotated); // credentials are never rewritten
    expect(await prisma.session.count()).toBe(0); // seeding never signs anyone in
  });

  it("refuses to run with NODE_ENV=production", async () => {
    // Next.js types mark NODE_ENV read-only; the mutable view matches what the process really has.
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      await expect(seed()).rejects.toThrow(/production/i);
    } finally {
      env.NODE_ENV = previous;
    }
    expect(await getPrisma().user.count()).toBe(0);
    expect(await getPrisma().product.count()).toBe(0);
  });
});

