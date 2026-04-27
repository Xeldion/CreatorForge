import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 storage client.
 *
 * R2 is S3-compatible with zero egress fees.
 * Used for: AI-generated thumbnails, user face references, generated PDFs.
 *
 * ⚠️  NEVER store user-uploaded images in the database.
 * Store URLs in PostgreSQL, binary data in R2.
 */

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? `https://${BUCKET}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * Upload a file to R2.
 * Returns the public URL.
 */
export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable", // Cache forever — use unique keys
    })
  );

  return `${PUBLIC_URL}/${key}`;
}

/**
 * Upload a PNG thumbnail image.
 */
export async function uploadThumbnail(
  userId: string,
  testId: string,
  variant: string,
  buffer: Buffer
): Promise<string> {
  const key = `thumbnails/${userId}/${testId}/${variant}.png`;
  return uploadFile(key, buffer, "image/png");
}

/**
 * Upload a user's face reference photo.
 */
export async function uploadFaceReference(
  userId: string,
  buffer: Buffer,
  extension = "jpg"
): Promise<string> {
  const key = `faces/${userId}/reference.${extension}`;
  return uploadFile(key, buffer, `image/${extension}`);
}

/**
 * Generate a pre-signed URL for temporary access (valid 1 hour).
 */
export async function getSignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

/**
 * Delete a file from R2.
 */
export async function deleteFile(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Build a public URL from a key.
 */
export function publicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}
