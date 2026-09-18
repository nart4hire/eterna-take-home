import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Sign in",
};

type LoginPageProps = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { registered } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">Use your StockFlow email and password.</p>
      </div>
      {registered ? (
        <Alert role="status">
          <AlertDescription>Account created. Sign in to continue.</AlertDescription>
        </Alert>
      ) : null}
      <AuthForm mode="login" />
      <p className="text-muted-foreground text-sm">
        Need an account?{" "}
        <Link className="text-foreground underline underline-offset-4" href="/register">
          Create one
        </Link>
      </p>
    </div>
  );
}
