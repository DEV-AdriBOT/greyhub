import path from "node:path";

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
