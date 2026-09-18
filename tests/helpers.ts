import { randomUUID } from "node:crypto";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { getPrisma } from "@/lib/prisma";
import type { ApiErrorBody, ProductDto, SessionUser } from "@/lib/types";
import { makeRequest } from "./support/request";

/** T00 harness request builder; re-exported so successors have one fixture import. */
export { makeRequest };


/** Public local-only credential used by fixtures; policy-compliant (>= 8 characters, <= 72 bytes). */
export const FIXTURE_PASSWORD = "Fixture-Password-2026";

export function uniqueEmail(prefix = "user"): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export async function readErrorBody(response: Response): Promise<ApiErrorBody> {
  return (await response.json()) as ApiErrorBody;
}

/** Names and values of every Set-Cookie header, individually preserved. */
export function sessionCookieFrom(response: Response): string {
  const cookie = response.headers.getSetCookie().find((value) => value.includes("session_token"));
  if (!cookie) throw new Error(`Response ${response.status} did not set a session cookie`);
  return cookie.split(";")[0]!;
}

export function withCookie(cookie: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return { ...init, headers };
}

export type AuthFixture = { user: SessionUser; cookie: string; email: string; password: string };

/** Real credential flow through the shipped route handlers: register, then log in. */
export async function registerAndLogin(input: { email?: string; password?: string } = {}): Promise<AuthFixture> {
  const email = (input.email ?? uniqueEmail()).toLowerCase();
  const password = input.password ?? FIXTURE_PASSWORD;
  const registered = await registerRoute(makeRequest("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }));
  if (registered.status !== 201) throw new Error(`Fixture registration failed with ${registered.status}: ${await registered.text()}`);
  const { data: user } = (await registered.json()) as { data: SessionUser };
  const login = await loginRoute(makeRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
  if (login.status !== 200) throw new Error(`Fixture login failed with ${login.status}: ${await login.text()}`);
  return { user, cookie: sessionCookieFrom(login), email, password };
}

export type ProductFixtureOverrides = { sku?: string; name?: string; description?: string | null; unitPrice?: number; quantityOnHand?: number };

/**
 * Creates an owner-scoped product row directly through Prisma: product endpoints belong to T05,
 * so fixtures must not depend on routes that do not exist yet. Unique data per call.
 */
export async function createProductFixture(userId: string, overrides: ProductFixtureOverrides = {}): Promise<ProductDto> {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const row = await getPrisma().product.create({
    data: {
      userId,
      sku: overrides.sku ?? `SKU-${suffix}`,
      name: overrides.name ?? `Fixture Product ${suffix}`,
      description: overrides.description ?? "Created by tests/helpers.ts",
      unitPrice: overrides.unitPrice ?? 1299,
      quantityOnHand: overrides.quantityOnHand ?? 25,
    },
  });
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    unitPrice: row.unitPrice,
    quantityOnHand: row.quantityOnHand,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
