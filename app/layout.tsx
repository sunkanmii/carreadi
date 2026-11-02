import type { Metadata } from "next";
import Link from "next/link";
import Analytics from "@/components/Analytics";
import PassBadge from "@/components/PassBadge";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carreadi — career readiness",
  description: "See what employers want, what you're missing, and what to do next.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            carreadi
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <Link href="/results" className="hover:text-ink">My roadmap</Link>
            <Link href="/jobs" className="hover:text-ink">Jobs</Link>
            <PassBadge />
          </nav>
        </header>
        <Analytics />
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5">{children}</main>
        <footer className="mx-auto flex w-full max-w-3xl gap-5 px-5 py-8 text-xs text-muted">
          <Link href="/plans" className="hover:text-ink">Pricing</Link>
          <Link href="/request" className="hover:text-ink">Request a company</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy &amp; data</Link>
        </footer>
      </body>
    </html>
  );
}
