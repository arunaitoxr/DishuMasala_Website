/**
 * The shape of a post cover's storage key — what lib/storage/admin-upload.ts#finalizeContentImageUpload
 * writes for the `posts` prefix (`posts/<slug>/<16-hex hash>-w<width>.webp`). Post saves refuse any
 * other new cover key, and cover-file cleanup never touches a key outside it: a crafted save naming a
 * product image as the "cover" and then removing it must not delete the product image.
 */
export const POST_COVER_KEY = /^posts\/[a-z0-9-]+\/[0-9a-f]{16}-w\d+\.webp$/;
