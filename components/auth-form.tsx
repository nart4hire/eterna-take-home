"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, apiFetch } from "@/lib/client-api";

export type AuthFormMode = "login" | "register";
export type AuthFormProps = { mode: AuthFormMode };

type FieldErrors = Record<string, string[]>;

/** First message for a field path so inputs can render inline text through aria-describedby. */
function fieldMessage(fields: FieldErrors, path: string): string | undefined {
  return fields[path]?.[0];
}

/**
 * Credential form for both entry points. Registration never signs the visitor in, so it returns
 * to the login form; a failed attempt keeps the values and the message on screen (no silent
 * navigation, no blank form) and disables resubmission while the request is in flight.
 */
export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const emailError = fieldMessage(fieldErrors, "email");
  const passwordError = fieldMessage(fieldErrors, "password");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage(null);
    setFieldErrors({});
    try {
      await apiFetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // The sign-in redirect target is a fixed internal route: no return URL is ever honoured.
      router.replace(isRegister ? "/login?registered=1" : "/products");
    } catch (error) {
      setPending(false);
      if (error instanceof ApiClientError) {
        setMessage(error.body.error.message);
        setFieldErrors(error.body.error.fields ?? {});
      } else {
        setMessage("An unexpected error occurred");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={pending} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          disabled={pending}
        />
        {emailError ? (
          <p id="email-error" className="text-destructive text-sm">
            {emailError}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
          disabled={pending}
        />
        {isRegister ? <p className="text-muted-foreground text-sm">At least 8 characters.</p> : null}
        {passwordError ? (
          <p id="password-error" className="text-destructive text-sm">
            {passwordError}
          </p>
        ) : null}
      </div>
      {message ? (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {isRegister ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
