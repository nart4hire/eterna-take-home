"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/client-api";

/**
 * Revokes the session through the API before leaving the page, then performs a full navigation so
 * no cached server render keeps showing authenticated content. A failure stays visible and usable.
 */
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    setFailure(null);
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: "{}" });
      // A full navigation is deliberate: it drops every cached server render of the old session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login");
    } catch (error) {
      setPending(false);
      setFailure(error instanceof ApiClientError ? error.body.error.message : "An unexpected error occurred");
    }
  }

  return (
    <span className="flex items-center gap-3">
      {failure ? (
        <span role="alert" className="text-destructive text-sm">
          {failure}
        </span>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={handleLogout} disabled={pending} aria-busy={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
    </span>
  );
}
