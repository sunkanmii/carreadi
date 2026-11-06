import { createTranslator } from "next-intl";
import { getLocale } from "next-intl/server";
import { isLocale, messageKey, type Locale } from "@/lib/i18n";

export async function loadMessages(locale: Locale) {
  const loaders = { en: () => import("@/messages/en.json"), fr: () => import("@/messages/fr.json"), es: () => import("@/messages/es.json"), ar: () => import("@/messages/ar.json") };
  return (await loaders[locale]()).default;
}

export async function textFor(locale: Locale) {
  const messages = await loadMessages(locale);
  const t = createTranslator({ locale, messages: messages as { ui: Record<string, string> }, namespace: "ui" });
  return (source: string, values?: Record<string, string | number>) => t.has(messageKey(source)) ? t(messageKey(source), values) : source.replace(/\{(\w+)\}/g, (match, key) => String(values?.[key] ?? match));
}

export async function getText() {
  const locale = await getLocale();
  return textFor(isLocale(locale) ? locale : "en");
}

