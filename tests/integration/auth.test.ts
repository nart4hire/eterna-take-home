import { getRounds } from "bcryptjs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { POST as registerRoute } from "@/app/api/auth/register/route";
import { GET as sessionRoute } from "@/app/api/auth/session/route";
import { BCRYPT_COST, hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";
import { SESSION_EXPIRES_IN_SECONDS, getAuth } from "@/lib/auth/server";
import { getSessionUser, requireAuth } from "@/lib/auth/session";
import { AppError } from "@/lib/http";
import { getPrisma } from "@/lib/prisma";
import { FIXTURE_PASSWORD, makeRequest, readErrorBody, registerAndLogin, sessionCookieFrom, uniqueEmail, withCookie } from "../helpers";

afterAll(async () => { await getPrisma().$disconnect(); });

/** Pinned against the installed BetterAuth 1.7.5 (see the T03 card "Contract notes"). */
const SESSION_COOKIE_NAME = "better-auth.session_token";
const SESSION_LIFETIME_MS = SESSION_EXPIRES_IN_SECONDS * 1000;

const jsonRequest = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  makeRequest(path, { method: "POST", body: JSON.stringify(body), headers });

const cookieHeaders = (cookie: string): Record<string, string> => ({ cookie });

async function register(email: string, password = FIXTURE_PASSWORD): Promise<Response> {
  return registerRoute(jsonRequest("/api/auth/register", { email, password }));
}

async function login(email: string, password = FIXTURE_PASSWORD): Promise<Response> {
  return loginRoute(jsonRequest("/api/auth/login", { email, password }));
}

function logout(cookie: string): Promise<Response> {
  return logoutRoute(jsonRequest("/api/auth/logout", {}, cookieHeaders(cookie)));
}

function appErrorFrom(run: () => unknown): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Expected the call to throw an AppError");
}

describe("A1 A5: registration normalizes input and never signs the client in", () => {
  it("creates a normalized credential account without a session or cookie", async () => {
    const email = uniqueEmail("Mixed.Case");
    const response = await register(`  ${email.toUpperCase()}  `);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: string; email: string; name: string } };
    expect(body.data.email).toBe(email.toLowerCase());
    expect(body.data.id).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/password|token|session/i);
    // Automatic sign-in is disabled: registration forwards no cookie at all.
    expect(response.headers.getSetCookie()).toEqual([]);

    const prisma = getPrisma();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() }, include: { accounts: true } });
    expect(user.id).toBe(body.data.id);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({ providerId: "credential", accountId: user.id });
    expect(user.accounts[0]!.password).not.toBe(FIXTURE_PASSWORD);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects a duplicate email including case variants", async () => {
    const email = uniqueEmail("duplicate");
    expect((await register(email)).status).toBe(201);
    const duplicate = await register(email.toUpperCase());
    expect(duplicate.status).toBe(409);
    expect(await readErrorBody(duplicate)).toEqual({ error: { code: "REGISTRATION_FAILED", message: "Unable to register" } });
    expect(await getPrisma().user.count({ where: { email: email.toLowerCase() } })).toBe(1);
  });

  it("rejects malformed registration bodies with field errors", async () => {
    const malformed = await register("not-an-email");
    expect(malformed.status).toBe(422);
    expect((await readErrorBody(malformed)).error).toMatchObject({ code: "VALIDATION_ERROR", fields: { email: expect.any(Array) } });

    const unknownKey = await registerRoute(jsonRequest("/api/auth/register", { email: uniqueEmail(), password: FIXTURE_PASSWORD, userId: "attacker" }));
    expect(unknownKey.status).toBe(422);
    expect((await readErrorBody(unknownKey)).error.fields).toHaveProperty("userId");
    expect(await getPrisma().user.count()).toBe(0);
  });

  it("rejects non-JSON and malformed bodies as client errors", async () => {
    const wrongType = await registerRoute(makeRequest("/api/auth/register", { method: "POST", body: "email=x", headers: { "content-type": "text/plain" } }));
    expect(wrongType.status).toBe(400);
    expect((await readErrorBody(wrongType)).error.code).toBe("INVALID_JSON");

    const malformed = await registerRoute(makeRequest("/api/auth/register", { method: "POST", body: "{oops", headers: { "content-type": "application/json" } }));
    expect(malformed.status).toBe(400);
    expect((await readErrorBody(malformed)).error.code).toBe("INVALID_JSON");
  });

  it("stays 201 without a cookie when the automatic session cannot be revoked", async () => {
    // The cleanup step must not be able to fail the request: the client is handed no token either
    // way, so a sign-out outage has to degrade into an inert, unreachable session row instead of a
    // 500 returned after the account has already been committed.
    const auth = getAuth();
    const signOut = vi.spyOn(auth.api, "signOut").mockRejectedValueOnce(new Error("simulated sign-out outage"));
    try {
      const email = uniqueEmail("revoke-failure");
      const response = await register(email);
      expect(response.status).toBe(201);
      expect(response.headers.getSetCookie()).toEqual([]);
      const user = await getPrisma().user.findUniqueOrThrow({ where: { email } });
      expect(user.email).toBe(email);
    } finally {
      signOut.mockRestore();
    }
  });
});

describe("A4: stored credentials are bcrypt hashes with a unique salt per account", () => {
  it("hashes at the configured cost and verifies only the right password", async () => {
    const first = await hashPassword(FIXTURE_PASSWORD);
    const second = await hashPassword(FIXTURE_PASSWORD);
    expect(first).not.toBe(second); // identical passwords must not share a hash
    expect(getRounds(first)).toBe(BCRYPT_COST);
    expect(await verifyPassword({ password: FIXTURE_PASSWORD, hash: first })).toBe(true);
    expect(await verifyPassword({ password: `${FIXTURE_PASSWORD}!`, hash: first })).toBe(false);
    expect(await verifyPassword({ password: FIXTURE_PASSWORD, hash: await hashPassword(`${FIXTURE_PASSWORD}!`) })).toBe(false);
  });

  it("stores a verifiable cost-12 hash for a registered account", async () => {
    const email = uniqueEmail("bcrypt");
    expect((await register(email)).status).toBe(201);
    const account = await getPrisma().account.findFirstOrThrow({ where: { user: { email } } });
    expect(account.password).toMatch(/^\$2[aby]\$/);
    expect(getRounds(account.password!)).toBe(BCRYPT_COST);
    expect(await verifyPassword({ password: FIXTURE_PASSWORD, hash: account.password! })).toBe(true);
    expect(account.password).not.toContain(FIXTURE_PASSWORD);
  });
});

describe("A5: password policy counts code points and UTF-8 bytes", () => {
  it.each([
    ["too few code points", "pass123", false],
    ["exactly eight code points", "pass1234", true],
    ["eight astral code points", "😀".repeat(8), true],
    ["seven astral code points", "😀".repeat(7), false],
    ["seventy-two bytes of two-byte characters", "é".repeat(36), true],
    ["seventy-four bytes of two-byte characters", "é".repeat(37), false],
    ["seventy-three ASCII bytes", "a".repeat(73), false],
    ["empty password", "", false],
  ])("handles %s", (_label, password, accepted) => {
    const run = () => validatePassword(password);
    if (accepted) {
      expect(run).not.toThrow();
      return;
    }
    const error = appErrorFrom(run);
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
    expect(error.fields?.password?.[0]).toEqual(expect.any(String));
  });

  it("rejects policy-violating passwords through the register route", async () => {
    const short = await register(uniqueEmail("short"), "pass123");
    expect(short.status).toBe(422);
    expect((await readErrorBody(short)).error.fields).toHaveProperty("password");

    const tooLong = await register(uniqueEmail("long"), "é".repeat(37));
    expect(tooLong.status).toBe(422);
    expect((await readErrorBody(tooLong)).error.fields).toHaveProperty("password");
    expect(await getPrisma().user.count()).toBe(0);

    expect((await register(uniqueEmail("boundary"), "é".repeat(36))).status).toBe(201);
  });
});

describe("A9: unknown email and wrong password share one generic 401", () => {
  it("returns an identical body and no cookie for both failures", async () => {
    const { email } = await registerAndLogin();
    const before = await getPrisma().session.count();
    const wrongPassword = await login(email, `${FIXTURE_PASSWORD}-wrong`);
    const unknownEmail = await login(uniqueEmail("missing"), FIXTURE_PASSWORD);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    const expected = { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } };
    expect(await readErrorBody(wrongPassword)).toEqual(expected);
    expect(await readErrorBody(unknownEmail)).toEqual(expected);
    expect(wrongPassword.headers.getSetCookie()).toEqual([]);
    expect(unknownEmail.headers.getSetCookie()).toEqual([]);
    expect(await getPrisma().session.count()).toBe(before); // neither failure issues a session
  });
});

describe("A2: login issues a hardened session cookie that authenticates later requests", () => {
  it("sets one HttpOnly session cookie and exposes only public user fields", async () => {
    const { user, cookie } = await registerAndLogin();
    const before = await getPrisma().session.count({ where: { userId: user.id } });
    const [setCookie] = (await login(user.email)).headers.getSetCookie();
    expect(setCookie).toBeDefined();
    expect(setCookie!.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain(`Max-Age=${SESSION_EXPIRES_IN_SECONDS}`);
    expect(setCookie).not.toContain("Secure"); // the test origin is plain http
    expect(cookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);

    const response = await sessionRoute(makeRequest("/api/auth/session", withCookie(cookie)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body.data).toEqual({ id: user.id, email: user.email, name: user.name });
    expect(JSON.stringify(body)).not.toMatch(/token|password|expires/i);

    const sessions = await getPrisma().session.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
    expect(sessions).toHaveLength(before + 1); // the successful login added exactly one session
    const [newest] = sessions;
    expect(newest!.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_LIFETIME_MS - 60_000);
    expect(newest!.expiresAt.getTime()).toBeLessThan(Date.now() + SESSION_LIFETIME_MS + 60_000);
  });

  it("does not extend the session on read (fixed expiry, no cookie cache)", async () => {
    const { user, cookie } = await registerAndLogin();
    const before = (await getPrisma().session.findFirstOrThrow({ where: { userId: user.id } })).expiresAt;
    expect((await sessionRoute(makeRequest("/api/auth/session", withCookie(cookie)))).status).toBe(200);
    const after = (await getPrisma().session.findFirstOrThrow({ where: { userId: user.id } })).expiresAt;
    expect(after.getTime()).toBe(before.getTime());
  });
});

describe("A3: logout revokes the session immediately, even from a copied cookie", () => {
  it("invalidates the cookie, clears it and deletes the session row", async () => {
    const { user, cookie } = await registerAndLogin();
    const response = await logout(cookie);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const cleared = response.headers.getSetCookie();
    expect(cleared.some((value) => value.startsWith(`${SESSION_COOKIE_NAME}=;`) && value.includes("Max-Age=0"))).toBe(true);

    const copied = await sessionRoute(makeRequest("/api/auth/session", withCookie(cookie)));
    expect(copied.status).toBe(401);
    expect((await readErrorBody(copied)).error.code).toBe("UNAUTHORIZED");
    expect(await getPrisma().session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("stays harmless when repeated and allows a fresh login afterwards", async () => {
    expect((await logoutRoute(jsonRequest("/api/auth/logout", {}))).status).toBe(204);
    const { email, password, cookie } = await registerAndLogin();
    expect((await logout(cookie)).status).toBe(204);
    const repeated = await logout(cookie);
    expect(repeated.status).toBe(204);
    expect(repeated.headers.getSetCookie().some((value) => value.includes("Max-Age=0"))).toBe(true);
    const relogin = await login(email, password);
    expect(relogin.status).toBe(200);
    expect(sessionCookieFrom(relogin).startsWith(SESSION_COOKIE_NAME)).toBe(true);
  });
});

describe("A2 A3: expired sessions are rejected because sessions live in the database", () => {
  it("rejects an expired token even though its signature is valid", async () => {
    const { user, cookie } = await registerAndLogin();
    await getPrisma().session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    const expired = await sessionRoute(makeRequest("/api/auth/session", withCookie(cookie)));
    expect(expired.status).toBe(401);
    expect((await readErrorBody(expired)).error.code).toBe("UNAUTHORIZED");
    expect(await getSessionUser(new Headers({ cookie }))).toBeNull();
    expect((await login(user.email)).status).toBe(200);
  });
});

describe("N6: origin is enforced on every mutating auth route", () => {
  const foreign = { origin: "https://attacker.example" };

  it("rejects registration and login from a foreign origin before any write", async () => {
    const email = uniqueEmail("origin");
    const registered = await registerRoute(jsonRequest("/api/auth/register", { email, password: FIXTURE_PASSWORD }, foreign));
    expect(registered.status).toBe(403);
    expect((await readErrorBody(registered)).error.code).toBe("ORIGIN_REJECTED");

    await register(email);
    const loggedIn = await loginRoute(jsonRequest("/api/auth/login", { email, password: FIXTURE_PASSWORD }, foreign));
    expect(loggedIn.status).toBe(403);
    expect(loggedIn.headers.getSetCookie()).toEqual([]);
    expect(await getPrisma().session.count()).toBe(0);
  });

  it("rejects logout with a foreign origin and logout without an origin", async () => {
    const { cookie } = await registerAndLogin();
    const foreignLogout = await logoutRoute(jsonRequest("/api/auth/logout", {}, { ...foreign, cookie }));
    expect(foreignLogout.status).toBe(403);

    const missingOrigin = await logoutRoute(new Request("http://localhost:3100/api/auth/logout", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    }));
    expect(missingOrigin.status).toBe(403);
    expect(await getPrisma().session.count()).toBe(1);
  });

  it("rejects the near-miss origins a substring comparison would allow", async () => {
    for (const origin of ["https://stockflow.example.evil", "http://localhost:3100/", "null", ""]) {
      const response = await registerRoute(jsonRequest("/api/auth/register", { email: uniqueEmail("bypass"), password: FIXTURE_PASSWORD }, { origin }));
      expect(response.status).toBe(403);
      expect((await readErrorBody(response)).error.code).toBe("ORIGIN_REJECTED");
    }
    expect(await getPrisma().user.count()).toBe(0);
  });
});

describe("N6: session guards reject missing credentials consistently", () => {
  it("returns one 401 body without leaking session material", async () => {
    const missing = await sessionRoute(makeRequest("/api/auth/session"));
    expect(missing.status).toBe(401);
    expect(await readErrorBody(missing)).toEqual({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });

    const bogus = await sessionRoute(makeRequest("/api/auth/session", withCookie(`${SESSION_COOKIE_NAME}=not-a-real-session`)));
    expect(bogus.status).toBe(401);
    expect(await getSessionUser(new Headers())).toBeNull();
    await expect(requireAuth(new Headers())).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("returns the session user for a valid cookie through the shared guards", async () => {
    const { user, cookie } = await registerAndLogin();
    expect(await getSessionUser(new Headers({ cookie }))).toEqual(user);
    await expect(requireAuth(new Headers({ cookie }))).resolves.toEqual(user);
  });
});



