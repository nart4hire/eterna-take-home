import type { ApiErrorBody } from "@/lib/types";

/**
 * Normalized client-side failure. Forms read `status`, `message` and `body.error.fields`
 * instead of parsing responses or guessing at transport errors.
 */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error.message);
    this.name = "ApiClientError";
  }
}

/**
 * Credential entry points keep their own 401 in the form: a rejected login must not navigate
 * the visitor away from /login, which would discard the message they need to read.
 */
const PUBLIC_AUTH_ENTRY_POINTS = ["/api/auth/login", "/api/auth/register"];
const LOGIN_PATH = "/login";

function isAuthEntryPoint(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return PUBLIC_AUTH_ENTRY_POINTS.some((entry) => path.endsWith(entry));
}

function isFieldMap(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(
      (messages) => Array.isArray(messages) && messages.every((message) => typeof message === "string"),
    )
  );
}

/** Accepts our error contract; anything else (proxy HTML, empty body) becomes a sanitized message. */
function errorBody(status: number, payload: unknown): ApiErrorBody {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "object" && error !== null) {
      const { code, message, fields } = error as { code?: unknown; message?: unknown; fields?: unknown };
      if (typeof code === "string" && typeof message === "string") {
        return { error: { code, message, ...(isFieldMap(fields) ? { fields } : {}) } };
      }
    }
  }
  return {
    error:
      status >= 500
        ? { code: "INTERNAL_ERROR", message: "An unexpected error occurred" }
        : { code: "REQUEST_FAILED", message: "The request could not be completed" },
  };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Client-only side effect: no window (tests, SSR import) means nothing to navigate. */
function navigateToLogin(): void {
  if (typeof window === "undefined") return;
  // Framework-free module on purpose: it cannot reach a router, and a full navigation is what
  // guarantees an expired session stops rendering private content immediately.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(LOGIN_PATH);
}

/**
 * Typed same-origin JSON fetch for client forms and lists.
 * Returns the parsed body (undefined for 204), throws ApiClientError for every failure, and
 * navigates to /login when a protected request answers 401.
 */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...init, headers });
  } catch {
    throw new ApiClientError(0, {
      error: { code: "NETWORK_ERROR", message: "Network request failed. Check your connection and try again." },
    });
  }
  if (response.status === 401 && !isAuthEntryPoint(url)) navigateToLogin();
  const payload = await readPayload(response);
  if (!response.ok) throw new ApiClientError(response.status, errorBody(response.status, payload));
  if (response.status === 204) return undefined as T;
  if (payload === undefined) {
    throw new ApiClientError(response.status, {
      error: { code: "INVALID_RESPONSE", message: "The server returned an unexpected response" },
    });
  }
  return payload as T;
}
