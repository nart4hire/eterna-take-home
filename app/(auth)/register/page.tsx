import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = {
  title: "Create account",
};

/** Registration leads to the login form: the account is created but no session is issued. */
export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground text-sm">
          Your products and invoices stay private to this login. After registering, sign in to continue.
        </p>
      </div>
      <AuthForm mode="register" />
      <p className="text-muted-foreground text-sm">
        Already registered?{" "}
        <Link className="text-foreground underline underline-offset-4" href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
