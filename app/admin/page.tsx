import AdminRequests from "@/components/AdminRequests";

export const metadata = { title: "Admin — Carreadi", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Admin</h1>
      <AdminRequests />
    </div>
  );
}
