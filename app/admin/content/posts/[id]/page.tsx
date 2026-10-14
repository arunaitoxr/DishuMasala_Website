import { notFound, redirect } from "next/navigation";
import { requireStaffOrAdmin } from "@/lib/auth/session";
import { getAdminPostById, listProductsForRelatedPicker } from "@/lib/db/queries/admin-content";
import { PostForm } from "../PostForm";
import { DeleteContent } from "../../DeleteContent";

export const metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffOrAdmin();
  if (!session.ok) redirect("/login?callbackUrl=/admin/content");

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) notFound();

  const [post, products] = await Promise.all([getAdminPostById(postId), listProductsForRelatedPicker()]);
  if (!post) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{post.title}</h1>
      <div className="mt-6">
        <PostForm mode="edit" post={post} products={products} />
      </div>
      <div className="mt-8 max-w-3xl">
        <DeleteContent kind="post" id={post.id} slug={post.slug} />
      </div>
    </div>
  );
}
