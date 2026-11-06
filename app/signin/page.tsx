import { getText } from "@/i18n/server";
import SignIn from "@/components/SignIn";

export async function generateMetadata() { const t = await getText(); return { title: t("Sign in — Carreadi"), robots: { index: false, follow: false } }; }

export default function Page() {
  return <SignIn />;
}
