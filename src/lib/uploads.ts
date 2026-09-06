import path from "node:path";
import fs from "node:fs/promises";
import { put } from "@vercel/blob";

export type UploadKind = "profiles" | "proofs";

export function uploadDirectory(kind: UploadKind) {
  if (process.env.VERCEL) {
    return path.join("/tmp", "greyhub-uploads", kind);
  }
  return path.join(process.cwd(), "public", "uploads", kind);
}

export function uploadUrl(kind: UploadKind, filename: string) {
  return process.env.VERCEL
    ? `/api/uploads/${kind}/${filename}`
    : `/uploads/${kind}/${filename}`;
}

export async function saveUpload(
  kind: UploadKind,
  filename: string,
  file: File,
  allowOverwrite = false,
) {
  if (process.env.VERCEL) {
    await put(`${kind}/${filename}`, file, {
      access: "private",
      allowOverwrite,
      contentType: file.type,
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return uploadUrl(kind, filename);
  }

  const uploadDir = uploadDirectory(kind);
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(
    path.join(/*turbopackIgnore: true*/ uploadDir, filename),
    Buffer.from(await file.arrayBuffer()),
  );
  return uploadUrl(kind, filename);
}
