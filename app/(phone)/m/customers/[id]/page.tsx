import CustomerDetail from "@/components/phone/CustomerDetail";

export const metadata = { title: "Customer · Myna" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  return <CustomerDetail id={decodeURIComponent((await params).id)} />;
}
