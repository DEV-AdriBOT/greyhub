import { acceptTreasuryWebhook } from "@/lib/treasury";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 64_000)
    return Response.json({ error: "payload_too_large" }, { status: 413 });

  const token = new URL(request.url).searchParams.get("token") || "";
  const rawBody = await request.text();
  if (rawBody.length > 64_000)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  const body = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return null;
    }
  })();
  if (!(await acceptTreasuryWebhook(token, body)))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  return new Response(null, { status: 204 });
}
