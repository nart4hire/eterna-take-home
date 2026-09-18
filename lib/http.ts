import { z } from "zod";
import type { ApiErrorBody, SessionUser } from "@/lib/types";

export class AppError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly fields?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
  }
}

export function dataResponse<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status, headers: { "cache-control": "no-store" } });
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new AppError(400, "INVALID_JSON", "Expected an application/json body");
  let body: unknown;
  try { body = await request.json(); } catch { throw new AppError(400, "INVALID_JSON", "Malformed JSON body"); }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

/** Resolve only the origin lazily; pure helpers do not import server env. */
export function assertSameOrigin(request: Request): void {
  const trusted = process.env.BETTER_AUTH_URL;
  try {
    const url = new URL(trusted ?? "");
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== trusted) throw new Error();
  } catch { throw new AppError(500, "CONFIGURATION_ERROR", "Invalid origin configuration"); }
  if (request.headers.get("origin") !== trusted) throw new AppError(403, "ORIGIN_REJECTED", "Request origin is not allowed");
}

function validationError(error: z.ZodError): AppError {
  const fields: Record<string, string[]> = Object.create(null);
  for (const issue of error.issues) {
    const paths = issue.code === "unrecognized_keys" ? issue.keys.map((key) => [...issue.path, key].join(".")) : [issue.path.join(".") || "_root"];
    for (const path of paths) (fields[path] ??= []).push(issue.message);
  }
  return new AppError(422, "VALIDATION_ERROR", "Invalid input", fields);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) error = validationError(error);
  let mapped = error instanceof AppError && error.status >= 400 && error.status < 500 ? error : new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  // Structural recognition avoids importing generated Prisma/T01 modules.
  if (error instanceof Error && error.name === "PrismaClientKnownRequestError" && "code" in error && error.code === "P2034" && "clientVersion" in error && typeof error.clientVersion === "string") mapped = new AppError(409, "TRANSACTION_CONFLICT", "Concurrent update; please retry");
  const body: ApiErrorBody = { error: { code: mapped.code, message: mapped.message, ...(mapped.fields ? { fields: mapped.fields } : {}) } };
  return Response.json(body, { status: mapped.status, headers: { "cache-control": "no-store" } });
}

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn(); } catch (error) { return errorResponse(error); }
}

export async function forwardAuthResponse(response: Response, kind: "login" | "register" | "logout"): Promise<Response> {
  let result: Response;
  if (!response.ok) {
    const status = response.status;
    const error = status >= 500 ? new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred")
      : status === 403 ? new AppError(403, "ORIGIN_REJECTED", "Request origin is not allowed")
      : status === 429 ? new AppError(429, "RATE_LIMITED", "Too many requests; please retry later")
      : kind === "login" ? new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
      : kind === "register" ? new AppError(409, "REGISTRATION_FAILED", "Unable to register")
      : new AppError(401, "UNAUTHORIZED", "Authentication required");
    result = errorResponse(error);
  } else if (kind === "logout") {
    result = new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } else {
    try {
      const body: unknown = await response.json();
      const parsed = z.object({ user: z.object({ id: z.string(), email: z.string(), name: z.string() }) }).parse(body);
      const user: SessionUser = { id: parsed.user.id, email: parsed.user.email, name: parsed.user.name };
      result = dataResponse(user, kind === "register" ? 201 : 200);
    } catch { result = errorResponse(new Error("Invalid auth response")); }
  }
  for (const cookie of response.headers.getSetCookie()) result.headers.append("set-cookie", cookie);
  return result;
}
