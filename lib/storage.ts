import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Bucket = "mail-photos" | "scans" | "compliance" | "signatures";

/**
 * All buckets are private; clients never touch storage directly.
 * Uploads happen server-side after an authz check; reads use 60s signed URLs.
 */
export async function uploadPrivate(
  admin: SupabaseClient,
  bucket: Bucket,
  path: string,
  data: ArrayBuffer | Buffer | Blob,
  contentType: string
): Promise<string> {
  const { error } = await admin.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  return path;
}

export async function signedUrl(
  admin: SupabaseClient,
  bucket: Bucket,
  path: string,
  expiresInSeconds = 60
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}

export async function signedUrls(
  admin: SupabaseClient,
  bucket: Bucket,
  paths: string[],
  expiresInSeconds = 60
): Promise<string[]> {
  const urls: string[] = [];
  for (const p of paths) {
    const u = await signedUrl(admin, bucket, p, expiresInSeconds);
    if (u) urls.push(u);
  }
  return urls;
}
