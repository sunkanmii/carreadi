import { getText } from "@/i18n/server";

import { useText } from "@/lib/useText";
import BuyPass from "@/components/BuyPass";
import PassManager from "@/components/PassManager";

export async function generateMetadata() { const t = await getText(); return { title: t("Plans — Carreadi") }; }

export default function Page() {
  const tr = useText();
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight">{tr("See everything. Close the gap.")}</h1>
      <p className="mt-2 text-center text-[15px] text-muted">{tr("Free: one preview a week showing what your CV already proves for the job, plus one gap and its first step. A pass unlocks every gap and your full roadmap.")}</p>
      <div className="mt-6">
        <PassManager />
      </div>
      <div className="mt-6">
        <BuyPass />
      </div>
    </div>
  );
}
