"use server";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addActivity, db } from "@/lib/db";

export async function updateProfileImage(formData: FormData) {
  const user = await requireUser();
  const file = formData.get("profile_image");
  if (!(file instanceof File) || file.size === 0)
    redirect("/profile?error=Choose+an+image");
  const allowed: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  if (!allowed[file.type] || file.size > 3 * 1024 * 1024)
    redirect("/profile?error=Use+a+JPG,+PNG+or+WebP+under+3MB");

  const uploadDir = path.join(process.cwd(), "public", "uploads", "profiles");
  await fs.mkdir(uploadDir, { recursive: true });
  const filename = `${crypto.randomUUID()}${allowed[file.type]}`;
  await fs.writeFile(
    path.join(uploadDir, filename),
    Buffer.from(await file.arrayBuffer()),
  );
  db.prepare("UPDATE users SET profile_image = ? WHERE id = ?").run(
    `/uploads/profiles/${filename}`,
    user.id,
  );
  addActivity(user.id, "profile_updated", { userId: user.id });
  revalidatePath("/profile");
  revalidatePath("/employees");
  redirect("/profile?notice=Profile+picture+updated");
}

export async function markNotificationsRead() {
  const user = await requireUser();
  db.prepare(
    "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL",
  ).run(user.id);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
