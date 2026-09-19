import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getWishlistCards } from "@/lib/db/queries/wishlist";
import { WishlistGrid } from "@/components/account/WishlistGrid";
import { publicUrl } from "@/lib/storage/storage";

/** Storage key -> public URL, server-side (a client component can't resolve one). */
function imageUrlFor(storageKey: string | null): string | null {
  if (!storageKey) return null;
  try {
    return publicUrl(storageKey);
  } catch {
    return null;
  }
}

export const metadata = { title: "Your wishlist", robots: { index: false, follow: false } };

export default async function AccountWishlistPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const cards = await getWishlistCards(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Wishlist</h1>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-2">Nothing saved yet — tap the heart on any product to add it here.</p>
          <Link href="/shop/" className="mt-3 inline-block text-sm font-medium text-ink underline underline-offset-4">
            Browse the shop
          </Link>
        </div>
      ) : (
        <WishlistGrid items={cards.map((card) => ({ ...card, imageUrl: imageUrlFor(card.imageStorageKey) }))} />
      )}
    </div>
  );
}
