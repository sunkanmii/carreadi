import type { Metadata } from "next";
import Link from "next/link";
import Analytics from "@/components/Analytics";
import MobileNav from "@/components/MobileNav";
import PassBadge from "@/components/PassBadge";
import PromoBanner from "@/components/PromoBanner";
import StaleReload from "@/components/StaleReload";
import { SUPPORT_EMAIL } from "@/lib/contact";
import "./globals.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { getText } from "@/i18n/server";
import { direction } from "@/lib/i18n";
import LanguagePicker from "@/components/LanguagePicker";
import { MotionConfig } from "motion/react";

const SITE = "https://carreadi.naijabukana.com";
const DESCRIPTION = "Upload your résumé, match it to live jobs, and see exactly what employers want, what you're missing, and what to do next.";

const metadata: Metadata = {
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getText();
  const description = t("Upload your résumé, match it to live jobs, and see exactly what employers want, what you're missing, and what to do next.");
  const title = `${t("Your next job isn’t a guessing game.")} — Carreadi`;
  return { ...metadata, title: t("Carreadi — career readiness"), description, openGraph: { ...metadata.openGraph, title, description }, twitter: { ...metadata.twitter, title, description } };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, t] = await Promise.all([getLocale(), getMessages(), getText()]);
  return (
    <html lang={locale} dir={direction(locale)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {locale === "ar" && <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />}
      </head>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        <MotionConfig reducedMotion="user">
        <a className="skip-link" href="#main-content">{t("Skip to main content")}</a>
        <header className="relative mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
          <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded-md" />
            carreadi
          </Link>
          <nav aria-label={t("Main navigation")} className="hidden items-center gap-4 text-sm text-muted md:flex">
            <Link href="/results" className="hover:text-ink">{t("My roadmap")}</Link>
            <Link href="/history" className="hover:text-ink">{t("History")}</Link>
            <Link href="/jobs" className="hover:text-ink">{t("Jobs")}</Link>
            <PassBadge />
          </nav>
          <div className="flex items-center gap-2">
          <LanguagePicker />
          <MobileNav />
          </div>
        </header>
        <PromoBanner />
        <Analytics />
        <StaleReload />
        <main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5">{children}</main>
        <footer className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-5 py-8 text-xs text-muted">
          <Link href="/plans" className="hover:text-ink">{t("Pricing")}</Link>
          <Link href="/request" className="hover:text-ink">{t("Request a company")}</Link>
          <Link href="/terms" className="hover:text-ink">{t("Terms")}</Link>
          <Link href="/privacy" className="hover:text-ink">{t("Privacy & data")}</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink">{t("Contact")}</a>
        </footer>
        </MotionConfig>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
