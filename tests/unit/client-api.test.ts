import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, apiFetch } from "@/lib/client-api";

const JSON_HEADERS = { "content-type": "application/json" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { ...init, headers: { ...JSON_HEADERS, ...init.headers } });
}

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** A browser-only module: the tests stand in for window.location. */
function stubNavigation() {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign, href: "http://localhost:3100/login" } });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch success path", () => {
  it("returns the parsed body with same-origin credentials and JSON accept headers", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ data: { id: "user-1" } })));

    const result = await apiFetch<{ data: { id: string } }>("/api/auth/session");

    expect(result).toEqual({ data: { id: "user-1" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/session");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.credentials).toBe("same-origin");
    const headers = new Headers(init?.headers);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("content-type")).toBeNull();
  });

  it("sends a JSON content type for string bodies and preserves caller headers", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ data: null })));

    await apiFetch("/api/auth/logout", { method: "POST", body: "{}", headers: { "x-trace": "abc" } });

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-trace")).toBe("abc");
  });

  it("resolves undefined for an empty 204 response without parsing a body", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    await expect(apiFetch("/api/auth/logout", { method: "POST", body: "{}" })).resolves.toBeUndefined();
  });

  it("rejects a successful response whose body is not JSON", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>proxy error</html>", { status: 200, headers: { "content-type": "text/html" } })));

    await expect(apiFetch("/api/products")).rejects.toMatchObject({
      status: 200,
      body: { error: { code: "INVALID_RESPONSE" } },
    });
  });
});

describe("apiFetch error handling", () => {
  it("exposes status, message and field errors for a validation failure", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid input",
              fields: { email: ["Invalid email address"], password: ["Password must contain at least 8 characters"] },
            },
          },
          { status: 422 },
        ),
      ),
    );

    const failure: unknown = await apiFetch("/api/auth/register", { method: "POST", body: "{}" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiClientError);
    const error = failure as ApiClientError;
    expect(error.name).toBe("ApiClientError");
    expect(error.status).toBe(422);
    expect(error.message).toBe("Invalid input");
    expect(error.body.error.fields?.password).toEqual(["Password must contain at least 8 characters"]);
  });

  it("falls back to a sanitized message when a failure is not our JSON contract", async () => {
    stubFetch(() => Promise.resolve(new Response("bad gateway", { status: 502 })));

    await expect(apiFetch("/api/products")).rejects.toMatchObject({
      status: 502,
      body: { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
    });
  });

  it("reports an unreachable server as a network failure without navigating", async () => {
    const assign = stubNavigation();
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    await expect(apiFetch("/api/products")).rejects.toMatchObject({
      status: 0,
      body: { error: { code: "NETWORK_ERROR" } },
    });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("apiFetch session expiry", () => {
  it("navigates to the login page when a protected request answers 401", async () => {
    const assign = stubNavigation();
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 })),
    );

    await expect(apiFetch("/api/products")).rejects.toMatchObject({ status: 401 });

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("keeps the 401 inside the form on the login and register entry points", async () => {
    const assign = stubNavigation();
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }, { status: 401 })),
    );

    await expect(apiFetch("/api/auth/login", { method: "POST", body: "{}" })).rejects.toMatchObject({ status: 401 });
    await expect(apiFetch("http://localhost:3100/api/auth/register", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 401,
    });

    expect(assign).not.toHaveBeenCalled();
  });

  it("does not touch a browser location when none exists", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 })),
    );

    await expect(apiFetch("/api/products")).rejects.toMatchObject({ status: 401 });
  });
});
