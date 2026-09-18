import { compare, hash } from "bcryptjs";
import { AppError } from "@/lib/http";

/** Cost fixed by the plan; tests assert stored hashes carry exactly this cost. */
export const BCRYPT_COST = 12;
export const PASSWORD_MIN_CODE_POINTS = 8;
/** bcrypt silently ignores bytes past 72, so longer passwords would authenticate as their prefix. */
export const PASSWORD_MAX_BYTES = 72;

const byteLength = (password: string): number => new TextEncoder().encode(password).length;

/**
 * Shared password policy for HTTP routes, the seed and future callers.
 * Counts code points (what a user sees) for the minimum, UTF-8 bytes for the bcrypt ceiling.
 * Never trims: a leading space is part of the password.
 */
export function validatePassword(password: string): void {
  const messages: string[] = [];
  if (Array.from(password).length < PASSWORD_MIN_CODE_POINTS) messages.push("Password must contain at least 8 characters");
  else if (byteLength(password) > PASSWORD_MAX_BYTES) messages.push("Password must be at most 72 UTF-8 bytes");
  if (messages.length > 0) throw new AppError(422, "VALIDATION_ERROR", "Invalid input", { password: messages });
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

/** Rejects over-long candidates instead of letting bcrypt compare a truncated prefix. */
export async function verifyPassword(input: { password: string; hash: string }): Promise<boolean> {
  if (byteLength(input.password) > PASSWORD_MAX_BYTES) return false;
  return compare(input.password, input.hash);
}
