import BuyPass from "@/components/BuyPass";
import PassManager from "@/components/PassManager";

export const metadata = { title: "Plans — Carreadi" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight">See everything. Close the gap.</h1>
      <p className="mt-2 text-center text-[15px] text-muted">
        Free: one preview a week showing what your CV already proves for the job. A pass unlocks every gap and your full roadmap.
      </p>
      <div className="mt-6">
        <PassManager />
      </div>
      <div className="mt-6">
        <BuyPass />
      </div>
    </div>
  );
}
