type Text = (source: string, values?: Record<string, string | number>) => string;
// Updated only in a browser effect, never during server rendering.
let translate: Text = (source, values) => source.replace(/\{(\w+)\}/g, (match, key) => String(values?.[key] ?? match));
export const clientText: Text = (source, values) => translate(source, values);
export function installClientText(text: Text) { translate = text; }
export function clientLocale() { return typeof document === "undefined" ? "en" : document.documentElement.lang || "en"; }
