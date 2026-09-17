export function makeRequest(path: string, options: RequestInit = {}): Request {
  const origin = "http://localhost:3100";
  const headers = new Headers(options.headers);
  if (!headers.has("origin")) headers.set("origin", origin);
  if (typeof options.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(new URL(path, origin), { ...options, headers });
}
