export const LOCALES = ["en", "fr", "es", "ar"] as const;
export type Locale = typeof LOCALES[number];
export const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", fr: "Français", es: "Español", ar: "العربية" };
export const LANGUAGE_ENGLISH: Record<Locale, string> = { en: "English", fr: "French", es: "Spanish", ar: "Arabic" };
export const LOCALE_COOKIE = "carreadi_locale";
export const isLocale = (value: unknown): value is Locale => typeof value === "string" && LOCALES.includes(value as Locale);
export const direction = (locale: string) => locale === "ar" ? "rtl" : "ltr";

/** Stable message IDs allow English copy to remain readable at the call site. */
export function messageKey(source: string) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `m${(hash >>> 0).toString(36)}`;
}

export function negotiateLocale(accept = ""): Locale {
  const preferences = accept.split(",").map((part, index) => {
    const [tag, ...params] = part.trim().split(";");
    const q = params.find((p) => p.trim().startsWith("q="));
    return { locale: tag.toLowerCase().split("-")[0], quality: q ? Number(q.trim().slice(2)) : 1, index };
  }).filter((p) => Number.isFinite(p.quality) && p.quality > 0 && p.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return preferences.find((p) => isLocale(p.locale))?.locale as Locale ?? "en";
}

export function requestLocale(req: Request): Locale {
  const cookie = req.headers.get("cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1);
  const explicit = req.headers.get("x-carreadi-locale");
  return isLocale(explicit) ? explicit : isLocale(cookie) ? cookie : negotiateLocale(req.headers.get("accept-language") ?? "");
}
