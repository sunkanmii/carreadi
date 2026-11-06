import { getText } from "@/i18n/server";

import { useText } from "@/lib/useText";
import AdminRequests from "@/components/AdminRequests";

export async function generateMetadata() { const t = await getText(); return { title: t("Admin — Carreadi"), robots: { index: false, follow: false } }; }

export default function Page() {
  const tr = useText();
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{tr("Admin")}</h1>
      <AdminRequests />
    </div>
  );
}
