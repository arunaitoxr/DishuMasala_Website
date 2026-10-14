/**
 * The Supabase Storage client, spoken to over its S3-compatible protocol rather than
 * `@supabase/supabase-js`'s storage helper. Supabase exposes every bucket at
 * `<project>/storage/v1/s3`, so the AWS S3 SDK talks to it directly — which means the presigned
 * upload path, the `sharp` derivative pipeline and the key convention below are all the real
 * thing, unchanged from when this project ran on Cloudflare R2, instead of a second parallel
 * implementation. Only the endpoint, credentials and public base URL differ per environment.
 *
 * Deliberately has no `import "server-only"` of its own — it's consumed two ways:
 *   - lib/storage/storage.ts re-exports it WITH the server-only guard, for use from the Next.js
 *     app (server actions, route handlers) where accidental client-bundle inclusion must
 *     hard-fail.
 *   - scripts/migrate-images.ts imports this file directly, since standalone tsx/Node scripts
 *     have no "react-server" bundler condition and the `server-only` package throws
 *     unconditionally outside of it (see lib/db/script-client.ts for the same pattern on the DB
 *     side).
 * Never import this file from app/ or components/ — use lib/storage/storage.ts there instead.
 */
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.STORAGE_ENDPOINT;
const region = process.env.STORAGE_REGION || "local";
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const bucket = process.env.STORAGE_BUCKET;
const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL;

function assertConfigured(): void {
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error(
      "Supabase Storage is not configured. Set STORAGE_ENDPOINT, STORAGE_REGION, " +
        "STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY, STORAGE_BUCKET and " +
        "STORAGE_PUBLIC_BASE_URL (see .env.example).",
    );
  }
}

let cachedClient: S3Client | null = null;

function getClient(): S3Client {
  assertConfigured();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region,
      endpoint,
      // Supabase's S3 gateway addresses objects as `<endpoint>/<bucket>/<key>` and does not
      // support AWS/R2-style virtual-hosted buckets, so this is always on — not an env toggle
      // the way it had to be under R2 (real R2 = virtual-hosted, local MinIO = path-style).
      forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
  }
  return cachedClient;
}

export type StoragePrefix = "products" | "reviews" | "posts" | "brand" | "banners" | "sections";

/**
 * Key convention (CLAUDE.md §6 / PROMPTS Phase 0 item 7):
 * `products/<slug>/<hash>.<ext>`, `reviews/<reviewId>/<hash>.<ext>`, `posts/<slug>/<hash>.<ext>`.
 * `brand/<id>/<hash>.<ext>` is the same idea for the one-off site-identity assets (logo, favicon
 * source) — `<id>` is a fixed slot name ("logo", "favicon") rather than a per-row database id,
 * since there's exactly one of each. `banners/<slot>/<hash>.<ext>` is the same pattern again for
 * homepage promotional banners (scripts/_lib/banner-migrate.ts) — client-supplied marketing
 * creative, not derived from `data/catalog.json`. `sections/<slot>/<hash>.<ext>` is for one-off
 * editorial/lifestyle imagery inside a specific homepage section (no href, unlike a banner) —
 * e.g. Red Tea's lifestyle photo replacing its AI-placeholder slot.
 * `variant` lets a caller disambiguate multiple derivatives of the same source image (e.g. a
 * width) without breaking the base convention — the hash still identifies the source content.
 */
export function buildKey(prefix: StoragePrefix, id: string | number, hash: string, ext: string, variant?: string): string {
  const cleanExt = ext.replace(/^\./, "");
  const base = variant ? `${hash}-${variant}` : hash;
  return `${prefix}/${id}/${base}.${cleanExt}`;
}

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
/** 5MB ceiling — matches the review-photo upload limit (CLAUDE.md Phase 4). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function putObject(key: string, body: Uint8Array | Buffer, contentType: string): Promise<void> {
  assertConfigured();
  await getClient().send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
}

/**
 * Reads an object back out of storage — used by the admin image-upload flow (app/admin/products'
 * finalizeProductImageUpload et al.): the browser PUTs the original file straight to the bucket
 * via a presigned URL (bytes never pass through our server on the way in), then the server
 * fetches it back here to run the real `sharp` derivative pipeline, exactly as PROMPTS.md Phase 8
 * item 1 requires ("drag-and-drop upload straight to [storage] via a presigned URL ... sharp
 * derivatives generated server-side").
 */
export async function getObject(key: string): Promise<Buffer> {
  assertConfigured();
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = result.Body;
  if (!body) throw new Error(`getObject: no body for key "${key}"`);
  const chunks: Uint8Array[] = [];
  // @ts-expect-error -- the SDK's Body is a Node Readable at runtime in this environment.
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function deleteObject(key: string): Promise<void> {
  assertConfigured();
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Every key under a prefix (paginated through ListObjectsV2). */
export async function listKeys(prefix: string): Promise<string[]> {
  assertConfigured();
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await getClient().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * The stored image plus all its sibling derivatives. Uploads write `<prefix>/<id>/<hash>-w<width>.<avif|webp>`
 * for several widths and record only the largest WebP in the database, so deleting just that one key
 * used to leave up to five orphaned files behind per image. Returns `[key]` alone for a key that
 * doesn't follow the derivative naming.
 */
export async function listImageFamily(storageKey: string): Promise<string[]> {
  const match = /^(.*-w)\d+\.(?:webp|avif)$/.exec(storageKey);
  if (!match) return [storageKey];
  const family = await listKeys(match[1]);
  return family.length > 0 ? family : [storageKey];
}

export interface PresignUploadOptions {
  key: string;
  contentType: string;
  /**
   * Exact byte size of the file being uploaded. A presigned PUT signs and enforces the
   * Content-Length header exactly — S3-compatible stores reject a request whose body length
   * doesn't match — so this must be the real size (e.g. `File.size` in the browser), not a
   * maximum. Enforce a maximum by rejecting `contentLength > MAX_UPLOAD_BYTES` before signing,
   * as below.
   */
  contentLength: number;
  expiresInSeconds?: number;
}

/** A presigned PUT URL constrained to an allowed image content-type and an exact, size-capped Content-Length. */
export async function presignUpload(opts: PresignUploadOptions): Promise<{ url: string; key: string }> {
  assertConfigured();
  if (!ALLOWED_CONTENT_TYPES.has(opts.contentType)) {
    throw new Error(`presignUpload: content-type "${opts.contentType}" is not an allowed image type`);
  }
  if (!Number.isInteger(opts.contentLength) || opts.contentLength <= 0 || opts.contentLength > MAX_UPLOAD_BYTES) {
    throw new Error(`presignUpload: contentLength ${opts.contentLength} is invalid or exceeds the ${MAX_UPLOAD_BYTES}-byte ceiling`);
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLength,
  });

  const url = await getSignedUrl(getClient(), command, { expiresIn: opts.expiresInSeconds ?? 300 });
  return { url, key: opts.key };
}

/**
 * The bucket is public (supabase/config.toml's `[storage.buckets.dishu-media] public = true`), so
 * STORAGE_PUBLIC_BASE_URL is the `/storage/v1/object/public/<bucket>` base and the key appends
 * straight onto it — the same shape R2's public bucket URL had.
 */
export function publicUrl(key: string): string {
  assertConfigured();
  return `${publicBaseUrl!.replace(/\/$/, "")}/${key}`;
}
