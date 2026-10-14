/**
 * The only shape a review photo's storage key can have — what app/api/reviews/upload/route.ts
 * writes (`reviews/<draftId>/<16-hex hash>.<ext>`). The public review form sends keys back to the
 * server, so anything else is refused on submit, and file deletion never touches a key outside
 * `reviews/` (a review "photo" pointing at a product image must not delete the product image).
 */
export const REVIEW_PHOTO_KEY = /^reviews\/[A-Za-z0-9-]{1,64}\/[0-9a-f]{16}\.(jpg|png|webp)$/;
