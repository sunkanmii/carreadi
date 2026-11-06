import { getText } from "@/i18n/server";
import JobsExplorer from "@/components/JobsExplorer";

export async function generateMetadata() { const t = await getText(); return { title: t("Jobs — Carreadi") }; }

// Rendered per request like every other page: a cached copy could outlive a deploy and point at
// script files that no longer exist. The jobs themselves load from the API either way.
export const dynamic = "force-dynamic";

export default function Page() {
  return <JobsExplorer />;
}
