import "server-only";

export type ServerEnv = { databaseUrl: string; authUrl: string; authSecret: string; nodeEnv: "development" | "test" | "production"; taxRateBps: number };

/** Lazy validation: importing this module never reads secrets or opens a DB. */
export function readEnv(source: NodeJS.ProcessEnv): ServerEnv {
  const invalid = (name: string): never => { throw new Error(`Invalid server configuration: ${name}`); };
  const databaseUrl = source.DATABASE_URL ?? invalid("DATABASE_URL");
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2 || url.hash) invalid("DATABASE_URL");
  } catch { invalid("DATABASE_URL"); }
  const authUrl = source.BETTER_AUTH_URL ?? invalid("BETTER_AUTH_URL");
  try {
    const url = new URL(authUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== authUrl || url.username || url.password) invalid("BETTER_AUTH_URL");
  } catch { invalid("BETTER_AUTH_URL"); }
  const authSecret = source.BETTER_AUTH_SECRET ?? invalid("BETTER_AUTH_SECRET");
  if (authSecret.trim().length < 32 || /replace[_ -]?with|change[_ -]?me|placeholder/i.test(authSecret)) invalid("BETTER_AUTH_SECRET");
  const nodeEnv = source.NODE_ENV;
  if (nodeEnv !== "development" && nodeEnv !== "test" && nodeEnv !== "production") return invalid("NODE_ENV");
  const tax = source.TAX_RATE_BPS ?? "1100";
  if (!/^\d+$/.test(tax) || !Number.isSafeInteger(Number(tax)) || Number(tax) > 10000) invalid("TAX_RATE_BPS");
  return { databaseUrl, authUrl, authSecret, nodeEnv, taxRateBps: Number(tax) };
}
