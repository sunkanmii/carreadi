import PassReturn from "@/components/PassReturn";

export const metadata = { title: "Your pass — Carreadi", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl py-12">
      <PassReturn />
    </div>
  );
}
