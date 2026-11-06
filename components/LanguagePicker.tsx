"use client";
import { useEffect, useId, useTransition, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LANGUAGE_NAMES, LOCALES, LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { useText } from "@/lib/useText";
import { installClientText } from "@/lib/client/locale";

export default function LanguagePicker() {
  const tr = useText();
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [ready, setReady] = useState(false);
  useEffect(() => { installClientText(tr); setReady(true); }, [tr]);
  return <div className="flex items-center gap-2 text-xs">
    <label htmlFor={id} className="sr-only">{tr("Language")}</label>
    <select id={id} value={locale} disabled={pending || !ready} aria-busy={pending} className="min-h-10 max-w-32 rounded-lg border border-line bg-white px-2 text-ink" onChange={(event) => {
      const next = event.target.value;
      if (!isLocale(next)) return;
      document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      startTransition(() => router.refresh());
    }}>
      {LOCALES.map((language) => <option key={language} value={language} lang={language}>{LANGUAGE_NAMES[language]}</option>)}
    </select>
    <span role="status" className="sr-only">{pending ? tr("Changing language…") : ""}</span>
  </div>;
}
