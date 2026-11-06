import { getText } from "@/i18n/server";
import PassReturn from "@/components/PassReturn";

export async function generateMetadata() { const t = await getText(); return { title: t("Your pass — Carreadi"), robots: { index: false, follow: false } }; }

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl py-12">
      <PassReturn />
    </div>
  );
}
