export const DEFAULT_DEV_URL = "postgresql://stockflow:local_only_change_me@localhost:5432/stockflow";
export const DEFAULT_TEST_URL = "postgresql://stockflow:local_test_only@localhost:5433/stockflow_test";

function parseDatabaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Expected a PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Expected a PostgreSQL URL");
  }
  // libpq query parameters can override the validated host/database coordinates.
  if (url.search || url.hash) throw new Error("Database URL parameters/fragments are not allowed for safe test database access");
  return url;
}
const localHost = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);

export function assertSafeTestDatabase(testUrl: string, devUrl: string): void {
  const test = parseDatabaseUrl(testUrl);
  const dev = parseDatabaseUrl(devUrl);
  const sameHost = test.hostname === dev.hostname || (localHost(test.hostname) && localHost(dev.hostname));
  if (sameHost && (test.port || "5432") === (dev.port || "5432") && decodeURIComponent(test.pathname) === decodeURIComponent(dev.pathname)) {
    throw new Error("Refusing development database access");
  }
  if (!localHost(test.hostname)) throw new Error("Safe test database must use localhost or a loopback address");
  if (test.port !== "5433") throw new Error("Safe test database requires port 5433");
  if (test.pathname !== "/stockflow_test") throw new Error("Safe test database must be stockflow_test");
}

/** Construct pg options explicitly; never allow ambient PGHOST/PGOPTIONS overrides. */
export function safeConnectionOptions(testUrl: string, devUrl: string) {
  assertSafeTestDatabase(testUrl, devUrl);
  const url = new URL(testUrl);
  return {
    host: url.hostname === "[::1]" ? "::1" : url.hostname === "localhost" ? "127.0.0.1" : url.hostname,
    port: 5433, database: "stockflow_test", user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), ssl: false as const, options: "",
    connectionTimeoutMillis: 5000, statement_timeout: 10000,
  };
}
