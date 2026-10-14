import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { CustomerForm } from "../CustomerForm";

export const metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/customers/new");
  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/customers" className="text-sm text-ink-2 underline underline-offset-4">← Back to customers</Link>
      <h1 className="font-display text-2xl font-semibold text-ink">Add a customer</h1>
      <CustomerForm mode="create" />
    </div>
  );
}
