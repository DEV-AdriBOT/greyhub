import fs from "node:fs/promises";
import path from "node:path";
import { get } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadDirectory, type UploadKind } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; filename: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return new Response("Unauthorized", { status: 401 });

  const { kind, filename } = await params;
  if (
    !["profiles", "proofs"].includes(kind) ||
    path.basename(filename) !== filename ||
    !/^(?:[a-f0-9-]+\.(?:jpe?g|png|webp|gif)|user-\d+)$/i.test(filename)
  ) {
    return new Response("Not found", { status: 404 });
  }

  if (process.env.VERCEL) {
    const result = await get(`${kind}/${filename}`, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") || undefined,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (result?.statusCode === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }
    if (result?.statusCode === 200) {
      return new Response(result.stream, {
        headers: {
          "Content-Type": result.blob.contentType || "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      });
    }
    if (kind === "profiles" && /^user-\d+$/.test(filename)) {
      return profileFallback(Number(filename.slice(5)));
    }
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await fs.readFile(
      path.join(uploadDirectory(kind as UploadKind), filename),
    );
    return new Response(file, {
      headers: {
        "Content-Type":
          contentTypes[path.extname(filename).toLowerCase()] ||
          "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function profileFallback(userId: number) {
  const user = db
    .prepare("SELECT username FROM users WHERE id = ?")
    .get(userId) as { username: string } | undefined;
  const initials = (user?.username || "GH").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2d302c"/><text x="50" y="56" text-anchor="middle" dominant-baseline="middle" fill="#d6d1c3" font-family="Arial,sans-serif" font-size="34" font-weight="700">${initials}</text></svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
