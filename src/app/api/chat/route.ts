import { getCurrentUser } from "@/lib/auth";
import { chatMessagesAfter, createChatMessage } from "@/lib/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.status === "suspended") return json({ error: "Suspended" }, 403);

  const afterValue = new URL(request.url).searchParams.get("after") || "0";
  const after = Number(afterValue);
  if (!Number.isInteger(after) || after < 0) {
    return json({ error: "Invalid message cursor" }, 400);
  }

  return json({ messages: chatMessagesAfter(after) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (user.status === "suspended") return json({ error: "Suspended" }, 403);

  if (Number(request.headers.get("content-length") || 0) > 2_000) {
    return json({ error: "Message is too long" }, 413);
  }

  let body = "";
  try {
    const data = (await request.json()) as { body?: unknown };
    body = typeof data.body === "string" ? data.body.trim() : "";
  } catch {
    return json({ error: "Invalid message" }, 400);
  }

  if (!body || body.length > 500) {
    return json({ error: "Write between 1 and 500 characters" }, 400);
  }

  return json({ message: createChatMessage(user.id, body) }, 201);
}
