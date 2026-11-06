import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { requestLocale } from "@/lib/i18n";
import { loadMessages } from "./server";

export default getRequestConfig(async () => {
  const h = await headers();
  const locale = requestLocale(new Request("https://carreadi.local", { headers: h }));
  return { locale, messages: await loadMessages(locale), timeZone: "UTC" };
});
