import JobsExplorer from "@/components/JobsExplorer";

export const metadata = { title: "Jobs — Carreadi" };

// Rendered per request like every other page: a cached copy could outlive a deploy and point at
// script files that no longer exist. The jobs themselves load from the API either way.
export const dynamic = "force-dynamic";

export default function Page() {
  return <JobsExplorer />;
}
