import "server-only";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { hashPassword, PASSWORD_MAX_BYTES, PASSWORD_MIN_CODE_POINTS, verifyPassword } from "@/lib/auth/password";
import { readEnv, type ServerEnv } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";

/** Fixed absolute session lifetime (7 days). Refresh is disabled, so expiry never slides. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7;

type Auth = ReturnType<typeof betterAuth>;
const globalForAuth = globalThis as typeof globalThis & { stockflowAuth?: Auth };
let instance: Auth | undefined;

/** Options are typed as BetterAuthOptions so the instance keeps the shared Auth contract. */
function createAuth(env: ServerEnv): Auth {
  const options: BetterAuthOptions = {
    baseURL: env.authUrl,
    secret: env.authSecret,
    trustedOrigins: [env.authUrl],
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_CODE_POINTS,
      maxPasswordLength: PASSWORD_MAX_BYTES,
      // bcryptjs instead of the default scrypt; T01 stores the hash in Account.password.
      password: { hash: hashPassword, verify: verifyPassword },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      disableSessionRefresh: true,
      // Database-backed sessions: revocation and expiry take effect on the next request.
      cookieCache: { enabled: false },
    },
    advanced: { useSecureCookies: env.authUrl.startsWith("https:") },
  };
  return betterAuth(options);
}

/**
 * Lazy BetterAuth instance behind the explicit auth wrappers: importing this module never reads
 * configuration or opens a connection. No catch-all route is mounted, so only the four explicit
 * routes in app/api/auth expose auth behavior.
 */
export function getAuth(): Auth {
  const cached = instance ?? globalForAuth.stockflowAuth;
  if (cached) return cached;
  const env = readEnv(process.env);
  const created = createAuth(env);
  if (env.nodeEnv !== "production") globalForAuth.stockflowAuth = created;
  instance = created;
  return created;
}

