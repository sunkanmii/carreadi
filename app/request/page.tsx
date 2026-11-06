import { getText } from "@/i18n/server";

import { useText } from "@/lib/useText";
import RequestForm from "@/components/RequestForm";

export async function generateMetadata() { const t = await getText(); return { title: t("Request a job — Carreadi") }; }

export default function Page() {
  const tr = useText();
  return (
    <div className="mx-auto w-full max-w-xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{tr("Request a company")}</h1>
      <p className="mt-2 text-[15px] text-muted">{tr("Can’t find a company you want to work for? Send us their careers page and we’ll add their jobs.")}</p>
      <div className="mt-6">
        <RequestForm />
      </div>
    </div>
  );
}
