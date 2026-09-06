"use server";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addActivity,
  addNotification,
  db,
  hasPermission,
  orderCode,
} from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { crewLimit, orderStatusAfterAbandon, shouldSuspend } from "@/lib/rules";

const statusPaths = [
  "/dashboard",
  "/orders",
  "/history",
  "/employees",
  "/admin",
];

function refreshOrder(orderId?: number) {
  for (const pathName of statusPaths) revalidatePath(pathName);
  if (orderId) revalidatePath(`/orders/${orderId}`);
}

function activeWorkerIds(orderId: number) {
  return (
    db
      .prepare(
        "SELECT user_id FROM order_workers WHERE order_id = ? AND abandoned_at IS NULL",
      )
      .all(orderId) as { user_id: number }[]
  ).map((row) => row.user_id);
}

function syncDings(userId: number) {
  const count = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM dings WHERE user_id = ? AND removed_at IS NULL",
      )
      .get(userId) as { count: number }
  ).count;
  db.prepare(
    "UPDATE users SET dings_count = ?, status = CASE WHEN ? THEN 'suspended' ELSE status END WHERE id = ?",
  ).run(count, shouldSuspend(count) ? 1 : 0, userId);
  return count;
}

export async function createOrder(formData: FormData) {
  const user = await requireUser("manage_orders");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const clientName = String(formData.get("client_name") || "").trim();
  const reward = Number(formData.get("reward"));
  const teamType = String(formData.get("team_type") || "solo");
  const notes = String(formData.get("notes") || "").trim();
  const maxWorkers = crewLimit(teamType, Number(formData.get("max_workers")));

  if (
    !title ||
    !description ||
    !clientName ||
    !Number.isFinite(reward) ||
    reward < 0 ||
    !["solo", "dual", "team"].includes(teamType)
  ) {
    redirect("/orders/new?error=Check+the+required+fields");
  }

  const result = db
    .prepare(
      `
    INSERT INTO orders (title, description, client_name, reward, created_by, team_type, max_workers, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      title,
      description,
      clientName,
      reward,
      user.id,
      teamType,
      maxWorkers,
      notes,
    );
  const orderId = Number(result.lastInsertRowid);
  addActivity(user.id, "order_created", { orderId, details: title });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Order+created`);
}

export async function updateOrder(orderId: number, formData: FormData) {
  const user = await requireUser("manage_orders");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const clientName = String(formData.get("client_name") || "").trim();
  const reward = Number(formData.get("reward"));
  const notes = String(formData.get("notes") || "").trim();
  if (
    !title ||
    !description ||
    !clientName ||
    !Number.isFinite(reward) ||
    reward < 0
  )
    redirect(`/orders/${orderId}?error=Check+the+order+fields`);
  db.prepare(
    "UPDATE orders SET title = ?, description = ?, client_name = ?, reward = ?, notes = ? WHERE id = ?",
  ).run(title, description, clientName, reward, notes, orderId);
  addActivity(user.id, "order_updated", { orderId, details: title });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Order+updated`);
}

export async function claimOrder(orderId: number) {
  const user = await requireUser();
  const order = db
    .prepare("SELECT title, status, max_workers FROM orders WHERE id = ?")
    .get(orderId) as
    | { title: string; status: string; max_workers: number }
    | undefined;
  if (!order || order.status !== "available")
    redirect(`/orders/${orderId}?error=This+order+is+not+available`);
  if (activeWorkerIds(orderId).length >= order.max_workers)
    redirect(`/orders/${orderId}?error=The+crew+is+already+full`);

  db.prepare(
    `
    INSERT INTO order_workers (order_id, user_id) VALUES (?, ?)
    ON CONFLICT(order_id, user_id) DO UPDATE SET abandoned_at = NULL, assigned_at = CURRENT_TIMESTAMP
  `,
  ).run(orderId, user.id);
  db.prepare("UPDATE orders SET status = 'claimed' WHERE id = ?").run(orderId);
  addActivity(user.id, "order_claimed", { orderId, details: order.title });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Order+claimed`);
}

export async function startOrder(orderId: number) {
  const user = await requireUser();
  const assigned = db
    .prepare(
      "SELECT 1 FROM order_workers WHERE order_id = ? AND user_id = ? AND abandoned_at IS NULL",
    )
    .get(orderId, user.id);
  if (!assigned)
    redirect(`/orders/${orderId}?error=You+are+not+assigned+to+this+order`);
  db.prepare(
    "UPDATE orders SET status = 'in_progress' WHERE id = ? AND status = 'claimed'",
  ).run(orderId);
  addActivity(user.id, "work_started", { orderId });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Work+started`);
}

export async function requestToJoin(orderId: number) {
  const user = await requireUser();
  const order = db
    .prepare("SELECT title, status, max_workers FROM orders WHERE id = ?")
    .get(orderId) as
    | { title: string; status: string; max_workers: number }
    | undefined;
  if (!order || !["claimed", "in_progress"].includes(order.status))
    redirect(`/orders/${orderId}?error=This+order+is+not+accepting+requests`);
  const workerIds = activeWorkerIds(orderId);
  if (workerIds.includes(user.id))
    redirect(`/orders/${orderId}?error=You+are+already+on+this+crew`);
  if (workerIds.length >= order.max_workers)
    redirect(`/orders/${orderId}?error=The+crew+is+full`);

  db.prepare(
    `
    INSERT INTO join_requests (order_id, user_id) VALUES (?, ?)
    ON CONFLICT(order_id, user_id) DO UPDATE SET status = 'pending', requested_at = CURRENT_TIMESTAMP, reviewed_at = NULL, reviewed_by = NULL
  `,
  ).run(orderId, user.id);
  for (const workerId of workerIds)
    addNotification(
      workerId,
      "join_request",
      `${user.username} wants to join ${orderCode(orderId)}.`,
      `/orders/${orderId}`,
    );
  addActivity(user.id, "join_requested", { orderId, details: order.title });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Join+request+sent`);
}

export async function reviewJoinRequest(
  requestId: number,
  decision: "approved" | "rejected",
) {
  const user = await requireUser();
  const request = db
    .prepare(
      `
    SELECT join_requests.*, orders.max_workers, orders.title, users.username
    FROM join_requests JOIN orders ON orders.id = join_requests.order_id JOIN users ON users.id = join_requests.user_id
    WHERE join_requests.id = ? AND join_requests.status = 'pending'
  `,
    )
    .get(requestId) as
    | {
        id: number;
        order_id: number;
        user_id: number;
        max_workers: number;
        title: string;
        username: string;
      }
    | undefined;
  if (!request) redirect("/orders?error=Request+not+found");
  const reviewerAssigned = db
    .prepare(
      "SELECT 1 FROM order_workers WHERE order_id = ? AND user_id = ? AND abandoned_at IS NULL",
    )
    .get(request.order_id, user.id);
  if (!reviewerAssigned && !hasPermission(user.id, "manage_orders"))
    redirect(
      `/orders/${request.order_id}?error=Only+the+crew+can+review+join+requests`,
    );

  const applyDecision = db.transaction(() => {
    let finalDecision = decision;
    if (decision === "approved") {
      if (activeWorkerIds(request.order_id).length >= request.max_workers)
        finalDecision = "rejected";
      else
        db.prepare(
          "INSERT OR REPLACE INTO order_workers (order_id, user_id, assigned_at, approved_by, abandoned_at) VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL)",
        ).run(request.order_id, request.user_id, user.id);
    }
    db.prepare(
      "UPDATE join_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?",
    ).run(finalDecision, user.id, request.id);
    return finalDecision;
  });
  const finalDecision = applyDecision();
  addNotification(
    request.user_id,
    "join_request_reviewed",
    `Your request to join ${orderCode(request.order_id)} was ${finalDecision}.`,
    `/orders/${request.order_id}`,
  );
  addActivity(
    user.id,
    finalDecision === "approved" ? "worker_joined" : "join_rejected",
    {
      orderId: request.order_id,
      userId: request.user_id,
      details: request.username,
    },
  );
  refreshOrder(request.order_id);
  redirect(`/orders/${request.order_id}?notice=Request+${finalDecision}`);
}

export async function abandonOrder(orderId: number) {
  const user = await requireUser();
  const order = db
    .prepare("SELECT title, status FROM orders WHERE id = ?")
    .get(orderId) as { title: string; status: string } | undefined;
  const assigned = db
    .prepare(
      "SELECT 1 FROM order_workers WHERE order_id = ? AND user_id = ? AND abandoned_at IS NULL",
    )
    .get(orderId, user.id);
  if (!order || !assigned || ["completed", "cancelled"].includes(order.status))
    redirect(`/orders/${orderId}?error=This+order+cannot+be+abandoned`);

  db.transaction(() => {
    db.prepare(
      "UPDATE order_workers SET abandoned_at = CURRENT_TIMESTAMP WHERE order_id = ? AND user_id = ?",
    ).run(orderId, user.id);
    db.prepare(
      "INSERT INTO dings (user_id, reason, order_id, added_by) VALUES (?, ?, ?, ?)",
    ).run(user.id, `Abandoned ${orderCode(orderId)}`, orderId, user.id);
    const workersLeft = activeWorkerIds(orderId).length;
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(
      orderStatusAfterAbandon(workersLeft),
      orderId,
    );
    syncDings(user.id);
  })();
  addNotification(
    user.id,
    "ding_added",
    `You received a ding for abandoning ${orderCode(orderId)}.`,
    "/profile",
  );
  addActivity(user.id, "worker_abandoned", {
    orderId,
    userId: user.id,
    details: order.title,
  });
  refreshOrder(orderId);
  redirect("/history?notice=Order+abandoned+and+one+ding+added");
}

export async function submitProof(orderId: number, formData: FormData) {
  const user = await requireUser();
  const assigned = db
    .prepare(
      "SELECT 1 FROM order_workers WHERE order_id = ? AND user_id = ? AND abandoned_at IS NULL",
    )
    .get(orderId, user.id);
  const order = db
    .prepare("SELECT title, status FROM orders WHERE id = ?")
    .get(orderId) as { title: string; status: string } | undefined;
  if (!assigned || !order || !["claimed", "in_progress"].includes(order.status))
    redirect(
      `/orders/${orderId}?error=Proof+cannot+be+submitted+for+this+order`,
    );

  const files = formData
    .getAll("proofs")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (!files.length || files.length > 6)
    redirect(`/orders/${orderId}?error=Add+between+one+and+six+proof+images`);
  const allowed: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  if (files.some((file) => !allowed[file.type] || file.size > 5 * 1024 * 1024))
    redirect(`/orders/${orderId}?error=Proofs+must+be+images+under+5MB`);

  const uploadDir = path.join(process.cwd(), "public", "uploads", "proofs");
  await fs.mkdir(uploadDir, { recursive: true });
  for (const file of files) {
    const filename = `${crypto.randomUUID()}${allowed[file.type]}`;
    await fs.writeFile(
      path.join(uploadDir, filename),
      Buffer.from(await file.arrayBuffer()),
    );
    db.prepare(
      "INSERT INTO proof_images (order_id, user_id, path, original_name) VALUES (?, ?, ?, ?)",
    ).run(
      orderId,
      user.id,
      `/uploads/proofs/${filename}`,
      file.name.slice(0, 200),
    );
  }
  db.prepare("UPDATE orders SET status = 'pending_review' WHERE id = ?").run(
    orderId,
  );
  const reviewers = db
    .prepare(
      `
    SELECT DISTINCT users.id FROM users
    JOIN user_roles ON user_roles.user_id = users.id JOIN roles ON roles.id = user_roles.role_id
    WHERE roles.permissions LIKE '%review_orders%' OR roles.permissions LIKE '%admin%'
  `,
    )
    .all() as { id: number }[];
  for (const reviewer of reviewers)
    addNotification(
      reviewer.id,
      "proof_submitted",
      `${user.username} submitted proof for ${orderCode(orderId)}.`,
      `/orders/${orderId}`,
    );
  addActivity(user.id, "proof_submitted", {
    orderId,
    details: `${files.length} image${files.length === 1 ? "" : "s"}`,
  });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Proof+submitted+for+review`);
}

export async function reviewProof(
  orderId: number,
  decision: "accepted" | "rejected",
  formData?: FormData,
) {
  const user = await requireUser("review_orders");
  const order = db
    .prepare("SELECT title, status FROM orders WHERE id = ?")
    .get(orderId) as { title: string; status: string } | undefined;
  if (!order || order.status !== "pending_review")
    redirect(`/orders/${orderId}?error=This+order+is+not+pending+review`);
  const workers = activeWorkerIds(orderId);

  if (decision === "accepted") {
    db.transaction(() => {
      db.prepare(
        "UPDATE orders SET status = 'completed', completion_date = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(orderId);
      for (const workerId of workers)
        db.prepare(
          "UPDATE users SET completed_orders = completed_orders + 1 WHERE id = ?",
        ).run(workerId);
    })();
    for (const workerId of workers)
      addNotification(
        workerId,
        "proof_accepted",
        `Proof accepted for ${orderCode(orderId)}. Payment is still recorded separately.`,
        `/orders/${orderId}`,
      );
    addActivity(user.id, "order_completed", { orderId, details: order.title });
  } else {
    const note = String(
      formData?.get("review_note") || "More proof or corrections are needed.",
    ).trim();
    db.prepare("UPDATE orders SET status = 'in_progress' WHERE id = ?").run(
      orderId,
    );
    for (const workerId of workers)
      addNotification(
        workerId,
        "proof_rejected",
        `Proof rejected for ${orderCode(orderId)}: ${note}`,
        `/orders/${orderId}`,
      );
    addActivity(user.id, "proof_rejected", { orderId, details: note });
  }
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Proof+${decision}`);
}

export async function cancelOrder(orderId: number) {
  const user = await requireUser("manage_orders");
  db.prepare(
    "UPDATE orders SET status = 'cancelled' WHERE id = ? AND status != 'completed'",
  ).run(orderId);
  for (const workerId of activeWorkerIds(orderId))
    addNotification(
      workerId,
      "order_cancelled",
      `${orderCode(orderId)} was cancelled.`,
      `/orders/${orderId}`,
    );
  addActivity(user.id, "order_cancelled", { orderId });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Order+cancelled`);
}

export async function assignWorker(orderId: number, formData: FormData) {
  const user = await requireUser("manage_orders");
  const workerId = Number(formData.get("worker_id"));
  const order = db
    .prepare("SELECT max_workers, status FROM orders WHERE id = ?")
    .get(orderId) as { max_workers: number; status: string } | undefined;
  if (
    !order ||
    !workerId ||
    activeWorkerIds(orderId).length >= order.max_workers
  )
    redirect(`/orders/${orderId}?error=Could+not+assign+that+worker`);
  db.prepare(
    `INSERT INTO order_workers (order_id, user_id, approved_by) VALUES (?, ?, ?) ON CONFLICT(order_id, user_id) DO UPDATE SET abandoned_at = NULL, approved_by = excluded.approved_by, assigned_at = CURRENT_TIMESTAMP`,
  ).run(orderId, workerId, user.id);
  if (order.status === "available")
    db.prepare("UPDATE orders SET status = 'claimed' WHERE id = ?").run(
      orderId,
    );
  addNotification(
    workerId,
    "order_assigned",
    `You were assigned to ${orderCode(orderId)}.`,
    `/orders/${orderId}`,
  );
  addActivity(user.id, "worker_assigned", { orderId, userId: workerId });
  refreshOrder(orderId);
  redirect(`/orders/${orderId}?notice=Worker+assigned`);
}
