import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "StockFlow", template: "%s · StockFlow" },
  description: "Inventory and invoicing for a small distributor: products, stock and draft-to-paid invoices.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="bg-background text-foreground flex min-h-full flex-col font-sans antialiased">{children}</body>
    </html>
  );
}
