import { notFound, redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getAdminCollectionById } from "@/lib/db/queries/admin-collections";
import { CollectionForm } from "../CollectionForm";
import { DeleteCollection } from "../DeleteCollection";

export const metadata = { title: "Edit collection" };

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/collections");

  const { id } = await params;
  const collectionId = Number(id);
  if (!Number.isInteger(collectionId)) notFound();

  const collection = await getAdminCollectionById(collectionId);
  if (!collection) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{collection.title}</h1>
      <div className="mt-6">
        <CollectionForm mode="edit" collection={collection} />
      </div>
      <div className="mt-8 max-w-2xl">
        <DeleteCollection id={collection.id} slug={collection.slug} title={collection.title} />
      </div>
    </div>
  );
}
