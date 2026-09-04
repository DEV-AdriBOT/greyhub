"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addActivity, addNotification, db, orderCode } from "@/lib/db";

function refresh(orderId: number) {
  revalidatePath(`/orders/${orderId}`); revalidatePath("/dashboard"); revalidatePath("/history"); revalidatePath("/employees"); revalidatePath("/admin");
}

export async function recordPayment(orderId: number, formData: FormData) {
  const manager = await requireUser("manage_orders");
  const order = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string } | undefined;
  if (!order || order.status !== "completed") redirect(`/orders/${orderId}?error=Only+completed+orders+can+be+paid`);
  const workers = db.prepare("SELECT user_id FROM order_workers WHERE order_id = ? AND abandoned_at IS NULL").all(orderId) as { user_id: number }[];
  const amount = Number(formData.get("amount"));
  const splits = workers.map(({ user_id }) => ({ userId: user_id, amount: Number(formData.get(`split_${user_id}`)) || 0 }));
  const splitTotal = splits.reduce((sum, split) => sum + split.amount, 0);
  if (!Number.isFinite(amount) || amount < 0 || splits.some((split) => split.amount < 0) || Math.abs(splitTotal - amount) > 0.009) redirect(`/orders/${orderId}?error=Worker+splits+must+add+up+to+the+payment+amount`);
  const paidAt = String(formData.get("paid_at") || new Date().toISOString().slice(0, 10));
  const note = String(formData.get("payment_note") || "").trim().slice(0, 500);

  db.transaction(() => {
    const existing = db.prepare("SELECT id FROM payments WHERE order_id = ?").get(orderId) as { id: number } | undefined;
    if (existing) {
      const oldSplits = db.prepare("SELECT user_id, amount FROM payment_splits WHERE payment_id = ?").all(existing.id) as { user_id: number; amount: number }[];
      for (const split of oldSplits) db.prepare("UPDATE users SET money_earned = money_earned - ? WHERE id = ?").run(split.amount, split.user_id);
      db.prepare("DELETE FROM payments WHERE id = ?").run(existing.id);
    }
    const paymentId = Number(db.prepare("INSERT INTO payments (order_id, amount, paid_at, note, recorded_by) VALUES (?, ?, ?, ?, ?)").run(orderId, amount, paidAt, note, manager.id).lastInsertRowid);
    for (const split of splits) {
      db.prepare("INSERT INTO payment_splits (payment_id, user_id, amount) VALUES (?, ?, ?)").run(paymentId, split.userId, split.amount);
      db.prepare("UPDATE users SET money_earned = money_earned + ? WHERE id = ?").run(split.amount, split.userId);
    }
    db.prepare("UPDATE orders SET payment_status = 'paid' WHERE id = ?").run(orderId);
  })();
  for (const split of splits) addNotification(split.userId, "payment_recorded", `$${split.amount.toFixed(2)} was recorded for ${orderCode(orderId)}.`, `/orders/${orderId}`);
  addActivity(manager.id, "payment_recorded", { orderId, details: `$${amount.toFixed(2)}` });
  refresh(orderId);
  redirect(`/orders/${orderId}?notice=Payment+recorded`);
}

export async function markUnpaid(orderId: number) {
  const manager = await requireUser("manage_orders");
  db.transaction(() => {
    const payment = db.prepare("SELECT id FROM payments WHERE order_id = ?").get(orderId) as { id: number } | undefined;
    if (payment) {
      const splits = db.prepare("SELECT user_id, amount FROM payment_splits WHERE payment_id = ?").all(payment.id) as { user_id: number; amount: number }[];
      for (const split of splits) db.prepare("UPDATE users SET money_earned = money_earned - ? WHERE id = ?").run(split.amount, split.user_id);
      db.prepare("DELETE FROM payments WHERE id = ?").run(payment.id);
    }
    db.prepare("UPDATE orders SET payment_status = 'unpaid' WHERE id = ?").run(orderId);
  })();
  addActivity(manager.id, "payment_reverted", { orderId });
  refresh(orderId);
  redirect(`/orders/${orderId}?notice=Order+marked+unpaid`);
}
