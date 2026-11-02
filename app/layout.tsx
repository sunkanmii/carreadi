import type { Metadata } from "next";
import Link from "next/link";
import Analytics from "@/components/Analytics";
import PassBadge from "@/components/PassBadge";
import "./globals.css";

const SITE = "https://carreadi.naijabukana.com";
const DESCRIPTION = "Upload your résumé, match it to live jobs, and see exactly what employers want, what you're missing, and what to do next.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Carreadi — career readiness",
  description: DESCRIPTION,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  // Link previews on LinkedIn, X, WhatsApp, Slack…
  openGraph: {
    type: "website",
    url: SITE,
    siteName: "Carreadi",
    title: "Your next job isn't a guessing game. — Carreadi",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Carreadi: your next job isn't a guessing game." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Your next job isn't a guessing game. — Carreadi",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
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
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded-md" />
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
