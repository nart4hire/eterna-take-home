import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth/session";

/**
 * Home is a session router, not a landing page: visitors sign in, members land on products.
 * The session is validated server-side, so no cookie-only or proxy-only shortcut is trusted.
 */
export default async function Home() {
  await requirePageUser();
  redirect("/products");
}
