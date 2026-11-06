import { getText } from "@/i18n/server";
import History from "@/components/History";

export async function generateMetadata() { const t = await getText(); return { title: t("My checks — Carreadi"), robots: { index: false, follow: false } }; }

export default function Page() {
  return <History />;
}
