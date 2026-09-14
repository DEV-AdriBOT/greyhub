"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActionUser } from "@/lib/auth";
import {
  addActivity,
  addNotification,
  db,
  isVisitorUserId,
  orderCode,
} from "@/lib/db";
import { martFoods, martTotal } from "@/lib/mart";

type CheckoutLine = {
  foodId: string;
  workerId: number;
};

export async function checkoutMart(formData: FormData) {
  const user = await requireActionUser();
  let lines: CheckoutLine[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("cart") || "")) as unknown;
    if (Array.isArray(parsed)) lines = parsed as CheckoutLine[];
  } catch {
    redirect("/mart?error=The+counter+could+not+read+that+basket");
  }

  const validFoodIds = new Set(martFoods.map((food) => food.id));
  if (
    !lines.length ||
    lines.length > 24 ||
    lines.some(
      (line) =>
        !line ||
        !validFoodIds.has(line.foodId as (typeof martFoods)[number]["id"]) ||
        !Number.isInteger(line.workerId),
    )
  ) {
    redirect("/mart?error=The+basket+contains+an+invalid+item");
  }

  const workerIds = [...new Set(lines.map((line) => line.workerId))];
  const placeholders = workerIds.map(() => "?").join(", ");
  const workers = db
    .prepare(
      `SELECT id, username FROM users
       WHERE status = 'active' AND id IN (${placeholders})`,
    )
    .all(...workerIds) as { id: number; username: string }[];
  if (
    workers.length !== workerIds.length ||
    workerIds.some((workerId) => isVisitorUserId(workerId))
  ) {
    redirect("/mart?error=Choose+an+active+crew+member+for+every+item");
  }

  const memberPass = formData.get("member_pass") === "yes";
  const total = martTotal(
    lines.map((line) => line.foodId),
    memberPass,
  );
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.username]));
  const quantities = new Map<string, number>();
  for (const line of lines)
    quantities.set(line.foodId, (quantities.get(line.foodId) ?? 0) + 1);
  const description = martFoods
    .filter((food) => quantities.has(food.id))
    .map((food) => `${quantities.get(food.id)}× ${food.name}`)
    .join(", ");
  const assignments = lines
    .map((line) => {
      const food = martFoods.find((item) => item.id === line.foodId);
      return `${workerNames.get(line.workerId)}: ${food?.name}`;
    })
    .join("; ");
  const teamType = workerIds.length === 1 ? "solo" : workerIds.length === 2 ? "dual" : "team";

  const orderId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO orders
         (title, description, client_name, reward, created_by, status, team_type, max_workers, notes)
         VALUES (?, ?, ?, 0, ?, 'claimed', ?, ?, ?)`,
      )
      .run(
        "Grey Mart delivery",
        description,
        user.username,
        user.id,
        teamType,
        workerIds.length,
        `Counter total: $${total.toFixed(2)}${memberPass ? " (Crew Pass applied)" : ""}\nAssignments: ${assignments}`,
      );
    const id = Number(result.lastInsertRowid);
    const assign = db.prepare(
      "INSERT INTO order_workers (order_id, user_id, approved_by) VALUES (?, ?, ?)",
    );
    for (const workerId of workerIds) assign.run(id, workerId, user.id);
    return id;
  })();

  for (const workerId of workerIds)
    addNotification(
      workerId,
      "order_assigned",
      `Grey Mart checkout was attached to ${orderCode(orderId)}.`,
      `/orders/${orderId}`,
    );
  addActivity(user.id, "order_created", {
    orderId,
    details: `Grey Mart checkout · $${total.toFixed(2)}`,
  });
  revalidatePath("/dashboard");
  revalidatePath("/orders");
  revalidatePath("/history");
  redirect(`/orders/${orderId}?notice=Mart+checkout+attached+to+this+order`);
}
