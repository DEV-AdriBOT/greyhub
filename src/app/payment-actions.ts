"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addActivity, addNotification, db, orderCode } from "@/lib/db";
import { paymentSplitsAreValid } from "@/lib/rules";
import { sendTreasuryPayout } from "@/lib/treasury";

function refresh(orderId: number) {
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/employees");
  revalidatePath("/admin");
}

type PaymentWorker = { user_id: number; username: string };

function paymentInput(formData: FormData, workers: PaymentWorker[]) {
  const amount = Number(formData.get("amount"));
  const splits = workers.map(({ user_id, username }) => ({
    userId: user_id,
    username,
    amount: Number(formData.get(`split_${user_id}`)) || 0,
  }));
  if (
    !paymentSplitsAreValid(
      amount,
      splits.map((split) => split.amount),
    )
  )
    return null;
  return {
    amount,
    splits,
    paidAt: String(
      formData.get("paid_at") || new Date().toISOString().slice(0, 10),
    ),
    note: String(formData.get("payment_note") || "")
      .trim()
      .slice(0, 500),
  };
}

function finalizePayment(values: {
  orderId: number;
  amount: number;
  splits: { userId: number; amount: number }[];
  paidAt: string;
  note: string;
  managerId: number;
  method: "manual" | "treasury";
  externalReference?: string;
}) {
  db.transaction(() => {
    const existing = db
      .prepare("SELECT id, method FROM payments WHERE order_id = ?")
      .get(values.orderId) as { id: number; method: string } | undefined;
    if (existing) {
      if (existing.method === "treasury")
        throw new Error("Treasury payments cannot be overwritten");
      const oldSplits = db
        .prepare(
          "SELECT user_id, amount FROM payment_splits WHERE payment_id = ?",
        )
        .all(existing.id) as { user_id: number; amount: number }[];
      for (const split of oldSplits)
        db.prepare(
          "UPDATE users SET money_earned = money_earned - ? WHERE id = ?",
        ).run(split.amount, split.user_id);
      db.prepare("DELETE FROM payments WHERE id = ?").run(existing.id);
    }
    const paymentId = Number(
      db
        .prepare(
          `INSERT INTO payments
           (order_id, amount, paid_at, note, method, external_reference, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          values.orderId,
          values.amount,
          values.paidAt,
          values.note,
          values.method,
          values.externalReference ?? null,
          values.managerId,
        ).lastInsertRowid,
    );
    for (const split of values.splits) {
      db.prepare(
        "INSERT INTO payment_splits (payment_id, user_id, amount) VALUES (?, ?, ?)",
      ).run(paymentId, split.userId, split.amount);
      db.prepare(
        "UPDATE users SET money_earned = money_earned + ? WHERE id = ?",
      ).run(split.amount, split.userId);
    }
    db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(
      values.orderId,
    );
  })();
}

export async function recordPayment(orderId: number, formData: FormData) {
  const manager = await requireUser("manage_orders");
  const order = db
    .prepare("SELECT status FROM orders WHERE id = ?")
    .get(orderId) as { status: string } | undefined;
  if (!order || order.status !== "completed")
    redirect(`/orders/${orderId}?error=Only+completed+orders+can+be+paid`);
  const workers = db
    .prepare(
      `SELECT order_workers.user_id, users.username
       FROM order_workers JOIN users ON users.id = order_workers.user_id
       WHERE order_id = ? AND abandoned_at IS NULL`,
    )
    .all(orderId) as PaymentWorker[];
  const input = paymentInput(formData, workers);
  if (!input)
    redirect(
      `/orders/${orderId}?error=Worker+splits+must+add+up+to+the+payment+amount`,
    );
  try {
    finalizePayment({
      orderId,
      ...input,
      managerId: manager.id,
      method: "manual",
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Payment could not be recorded";
    redirect(`/orders/${orderId}?error=${encodeURIComponent(text)}`);
  }
  for (const split of input.splits)
    addNotification(
      split.userId,
      "payment_recorded",
      `$${split.amount.toFixed(2)} was recorded for ${orderCode(orderId)}.`,
      `/orders/${orderId}`,
    );
  addActivity(manager.id, "payment_recorded", {
    orderId,
    details: `$${input.amount.toFixed(2)}`,
  });
  refresh(orderId);
  redirect(`/orders/${orderId}?notice=Payment+recorded`);
}

export async function payWithTreasury(orderId: number, formData: FormData) {
  const manager = await requireUser("manage_orders");
  const order = db
    .prepare(
      "SELECT status, payment_status, title, created_at FROM orders WHERE id = ?",
    )
    .get(orderId) as
    | {
        status: string;
        payment_status: string;
        title: string;
        created_at: string;
      }
    | undefined;
  if (!order || order.status !== "completed")
    redirect(`/orders/${orderId}?error=Only+completed+orders+can+be+paid`);
  if (order.payment_status === "paid")
    redirect(`/orders/${orderId}?error=This+order+is+already+paid`);

  const workers = db
    .prepare(
      `SELECT order_workers.user_id, users.username
       FROM order_workers JOIN users ON users.id = order_workers.user_id
       WHERE order_id = ? AND abandoned_at IS NULL`,
    )
    .all(orderId) as PaymentWorker[];
  const input = paymentInput(formData, workers);
  if (!input || input.amount <= 0)
    redirect(
      `/orders/${orderId}?error=Enter+a+positive+payment+with+valid+worker+splits`,
    );
  if (workers.some((worker) => !/^[A-Za-z0-9_]{3,16}$/.test(worker.username)))
    redirect(
      `/orders/${orderId}?error=Worker+usernames+must+match+their+Minecraft+names`,
    );

  const transactions: string[] = [];
  try {
    for (const split of input.splits) {
      if (split.amount === 0) continue;
      const payout = await sendTreasuryPayout({
        orderId,
        userId: split.userId,
        payoutReference: `${orderId}:${order.created_at}:${order.title}`,
        username: split.username,
        amount: split.amount.toFixed(2),
        memo: `${orderCode(orderId)} GreyHub order payment`,
      });
      if (payout.txnId) transactions.push(payout.txnId);
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : "Treasury payout failed";
    redirect(
      `/orders/${orderId}?error=${encodeURIComponent(`Treasury stopped: ${text}. Successful transfers will not repeat when retried.`)}`,
    );
  }

  finalizePayment({
    orderId,
    ...input,
    note: input.note || `Treasury transactions: ${transactions.join(", ")}`,
    managerId: manager.id,
    method: "treasury",
    externalReference: transactions.join(","),
  });
  for (const split of input.splits)
    addNotification(
      split.userId,
      "payment_recorded",
      `$${split.amount.toFixed(2)} was paid through Treasury for ${orderCode(orderId)}.`,
      `/orders/${orderId}`,
    );
  addActivity(manager.id, "treasury_payment_sent", {
    orderId,
    details: `$${input.amount.toFixed(2)}`,
  });
  refresh(orderId);
  redirect(`/orders/${orderId}?notice=Treasury+payment+completed`);
}

export async function markUnpaid(orderId: number) {
  const manager = await requireUser("manage_orders");
  const recorded = db
    .prepare("SELECT method FROM payments WHERE order_id = ?")
    .get(orderId) as { method: string } | undefined;
  if (recorded?.method === "treasury")
    redirect(
      `/orders/${orderId}?error=Treasury+payments+cannot+be+undone+inside+GreyHub`,
    );
  db.transaction(() => {
    const payment = db
      .prepare("SELECT id FROM payments WHERE order_id = ?")
      .get(orderId) as { id: number } | undefined;
    if (payment) {
      const splits = db
        .prepare(
          "SELECT user_id, amount FROM payment_splits WHERE payment_id = ?",
        )
        .all(payment.id) as { user_id: number; amount: number }[];
      for (const split of splits)
        db.prepare(
          "UPDATE users SET money_earned = money_earned - ? WHERE id = ?",
        ).run(split.amount, split.user_id);
      db.prepare("DELETE FROM payments WHERE id = ?").run(payment.id);
    }
    db.prepare("UPDATE orders SET payment_status = 'unpaid' WHERE id = ?").run(
      orderId,
    );
  })();
  addActivity(manager.id, "payment_reverted", { orderId });
  refresh(orderId);
  redirect(`/orders/${orderId}?notice=Order+marked+unpaid`);
}
