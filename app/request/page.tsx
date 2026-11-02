import RequestForm from "@/components/RequestForm";

export const metadata = { title: "Request a job — Carreadi" };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-xl py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Request a company</h1>
      <p className="mt-2 text-[15px] text-muted">Can&rsquo;t find a company you want to work for? Send us their careers page and we&rsquo;ll add their jobs.</p>
      <div className="mt-6">
        <RequestForm />
      </div>
    </div>
  );
}
