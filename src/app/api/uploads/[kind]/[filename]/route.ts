import fs from "node:fs/promises";
import path from "node:path";
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
  _request: Request,
  { params }: { params: Promise<{ kind: string; filename: string }> },
) {
  const { kind, filename } = await params;
  if (
    !["profiles", "proofs"].includes(kind) ||
    path.basename(filename) !== filename ||
    !/^[a-f0-9-]+\.(?:jpe?g|png|webp|gif)$/i.test(filename)
  ) {
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
