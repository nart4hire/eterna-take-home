import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, assertSameOrigin, dataResponse, errorResponse, forwardAuthResponse, handleRoute, readJson } from "@/lib/http";

afterEach(() => vi.unstubAllEnvs());
describe("N6: JSON and safe errors", () => {
  it("maps direct query/parameter Zod errors to indexed 422 errors", async () => {
    const response = await handleRoute(async () => { z.object({ page: z.number().positive() }).parse({ page: 0 }); return dataResponse(null); });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields.page).toBeDefined();
  });
  it("separates malformed JSON/media type (400) from schema errors (422)", async () => {
    const schema = z.strictObject({ items: z.array(z.strictObject({ quantity: z.number().int().positive() })) });
    const request = (body: string, type = "application/json") => new Request("http://localhost", { method: "POST", headers: { "content-type": type }, body });
    await expect(readJson(request("{"), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(request("{}", "text/plain"), schema)).rejects.toMatchObject({ status: 400 });
    const response = await handleRoute(async () => dataResponse(await readJson(request('{"items":[{"quantity":0}]}'), schema)));
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields["items.0.quantity"]).toBeDefined();
    expect(await readJson(request('{"items":[{"quantity":2}]}', "application/json; charset=utf-8"), schema)).toEqual({ items: [{ quantity: 2 }] });
  });
  it("maps AppError, recognized Prisma conflict and sanitized unexpected errors", async () => {
    expect(errorResponse(new AppError(404, "NOT_FOUND", "Not found")).status).toBe(404);
    const conflict = Object.assign(new Error("secret SQL"), { name: "PrismaClientKnownRequestError", code: "P2034", clientVersion: "7.9.1" });
    expect(errorResponse(conflict).status).toBe(409);
    for (const error of [new Error("secret password"), { code: "P2034" }, new AppError(500, "INTERNAL", "secret SQL")]) {
      const response = errorResponse(error);
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
    }
    const response = dataResponse({ id: "x" }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ data: { id: "x" } });
  });
  it("requires exact configured origin, never the request Host", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://stockflow.example");
    const request = (origin?: string) => new Request("https://attacker.example", { method: "POST", headers: origin ? { origin } : {} });
    expect(() => assertSameOrigin(request("https://stockflow.example"))).not.toThrow();
    for (const origin of [undefined, "null", "https://attacker.example", "https://stockflow.example/", "https://stockflow.example.evil"]) expect(() => assertSameOrigin(request(origin))).toThrow(expect.objectContaining({ status: 403 }));
  });
});

describe("N6: auth forwarding boundary (real auth integration belongs to T03)", () => {
  it("projects only public user fields and preserves every Set-Cookie separately", async () => {
    const headers = new Headers();
    const cookies = ["session=abc; Path=/; HttpOnly", "other=xyz; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/"];
    for (const cookie of cookies) headers.append("set-cookie", cookie);
    const input = Response.json({ user: { id: "1", email: "a@b.com", name: "A", password: "secret" }, token: "secret-token" }, { headers });
    const response = await forwardAuthResponse(input, "login");
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(cookies);
    expect(await response.json()).toEqual({ data: { id: "1", email: "a@b.com", name: "A" } });
    const logout = await forwardAuthResponse(new Response(null, { status: 200, headers }), "logout");
    expect(logout.status).toBe(204);
    expect(await logout.text()).toBe("");
    expect(logout.headers.getSetCookie()).toEqual(cookies);
    expect((await forwardAuthResponse(Response.json({ user: { id: "1", email: "a@b.com", name: "A" } }), "register")).status).toBe(201);
  });
  it("normalizes auth failures and rejects malformed success without leaks", async () => {
    for (const status of [400, 401, 404]) {
      const response = await forwardAuthResponse(Response.json({ message: "user missing" }, { status }), "login");
      expect(response.status).toBe(401);
      expect((await response.json()).error.message).toBe("Invalid email or password");
    }
    expect((await forwardAuthResponse(Response.json({}, { status: 422 }), "register")).status).toBe(409);
    expect((await forwardAuthResponse(Response.json({}, { status: 403 }), "login")).status).toBe(403);
    expect((await forwardAuthResponse(Response.json({}, { status: 429 }), "login")).status).toBe(429);
    expect((await forwardAuthResponse(Response.json({ token: "secret" }), "login")).status).toBe(500);
    expect((await forwardAuthResponse(new Response("not json", { status: 200 }), "login")).status).toBe(500);
  });
});
