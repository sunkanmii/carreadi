import { useTranslations } from "next-intl";
import { messageKey } from "./i18n";

export const displayValue = (value: unknown): string | number => typeof value === "string" || typeof value === "number" ? value : "";

export function useText() {
  const t = useTranslations("ui");
  return (source: string, values?: Record<string, string | number>) => t.has(messageKey(source)) ? t(messageKey(source), values) : source.replace(/\{(\w+)\}/g, (match, key) => String(values?.[key] ?? match));
}
