import { getText } from "@/i18n/server";
import Results from "@/components/Results";

export async function generateMetadata() { const t = await getText(); return { title: t("My roadmap — Carreadi") }; }

export default function Page() {
  return <Results />;
}
