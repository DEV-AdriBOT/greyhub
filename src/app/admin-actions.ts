"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { persistAccount, storedAccountForLogin } from "@/lib/accounts";
import { requireUser } from "@/lib/auth";
import {
  addActivity,
  addNotification,
  db,
  replaceUserRoles,
  VISITOR_ROLE_NAME,
  type Permission,
} from "@/lib/db";
import { shouldSuspend } from "@/lib/rules";

const allowedPermissions: Permission[] = [
  "admin",
  "manage_orders",
  "review_orders",
  "manage_users",
];

function refreshAdmin(userId?: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/roles");
  revalidatePath("/employees");
  if (userId) {
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath(`/employees/${userId}`);
  }
}

function getPermissions(formData: FormData) {
  return allowedPermissions.filter(
    (permission) => formData.get(permission) === "on",
  );
}

function recalculateDings(userId: number) {
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

export async function createUser(formData: FormData) {
  const admin = await requireUser("manage_users");
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const roleId = Number(formData.get("role_id"));
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username) || password.length < 8)
    redirect("/admin?error=Use+a+valid+username+and+an+8-character+password");
  if (
    db
      .prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)")
      .get(username)
  )
    redirect("/admin?error=That+username+already+exists");
  if (await storedAccountForLogin(username))
    redirect("/admin?error=That+username+already+exists");
  const userId = db.transaction(() => {
    const id = Number(
      db
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
        .run(username, bcrypt.hashSync(password, 10)).lastInsertRowid,
    );
    if (process.env.VERCEL) {
      db.prepare("UPDATE users SET profile_image = ? WHERE id = ?").run(
        `/api/uploads/profiles/user-${id}`,
        id,
      );
    }
    replaceUserRoles(id, roleId ? [roleId] : []);
    return id;
  })();
  try {
    await persistAccount(userId);
  } catch (error) {
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    throw error;
  }
  addActivity(admin.id, "user_created", { userId, details: username });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=User+created`);
}

export async function updateUser(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const username = String(formData.get("username") || "").trim();
  const status =
    formData.get("status") === "suspended" ? "suspended" : "active";
  const roleIds = formData
    .getAll("role_ids")
    .map(Number)
    .filter(Number.isInteger);
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))
    redirect(`/admin/users/${userId}?error=Invalid+username`);
  const duplicate = db
    .prepare("SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?")
    .get(username, userId);
  if (duplicate)
    redirect(`/admin/users/${userId}?error=That+username+already+exists`);
  db.transaction(() => {
    db.prepare(
      "UPDATE users SET username = ?, status = ?, suspended_until = CASE WHEN ? = 'active' THEN NULL ELSE suspended_until END WHERE id = ?",
    ).run(username, status, status, userId);
    replaceUserRoles(userId, roleIds);
  })();
  await persistAccount(userId);
  addActivity(admin.id, "user_updated", { userId, details: username });
  addNotification(
    userId,
    "account_updated",
    `Your account was updated by ${admin.username}.`,
    "/profile",
  );
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=User+updated`);
}

export async function setUserPassword(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const password = String(formData.get("password") || "");
  if (password.length < 8)
    redirect(
      `/admin/users/${userId}?error=Password+must+be+at+least+8+characters`,
    );
  const current = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(userId) as { password_hash: string } | undefined;
  if (!current) redirect("/admin?error=User+not+found");
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    passwordHash,
    userId,
  );
  try {
    await persistAccount(userId);
  } catch (error) {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
      current.password_hash,
      userId,
    );
    throw error;
  }
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  addActivity(admin.id, "password_reset", { userId });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=Password+reset`);
}

export async function addDing(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const reason = String(formData.get("reason") || "Manual manager ding")
    .trim()
    .slice(0, 300);
  db.prepare(
    "INSERT INTO dings (user_id, reason, added_by) VALUES (?, ?, ?)",
  ).run(userId, reason || "Manual manager ding", admin.id);
  const count = recalculateDings(userId);
  await persistAccount(userId);
  addNotification(
    userId,
    "ding_added",
    `You received a ding: ${reason || "Manual manager ding"}`,
    "/profile",
  );
  addActivity(admin.id, "ding_added", { userId, details: reason });
  refreshAdmin(userId);
  redirect(
    `/admin/users/${userId}?notice=Ding+added${count >= 3 ? "+and+account+suspended" : ""}`,
  );
}

export async function removeDing(userId: number, dingId: number) {
  const admin = await requireUser("manage_users");
  db.prepare(
    "UPDATE dings SET removed_at = CURRENT_TIMESTAMP, removed_by = ? WHERE id = ? AND user_id = ? AND removed_at IS NULL",
  ).run(admin.id, dingId, userId);
  recalculateDings(userId);
  await persistAccount(userId);
  addActivity(admin.id, "ding_removed", { userId });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=Ding+removed`);
}

export async function createRole(formData: FormData) {
  const admin = await requireUser("manage_users");
  const name = String(formData.get("name") || "")
    .trim()
    .slice(0, 60);
  if (!name) redirect("/admin/roles?error=Role+name+is+required");
  if (db.prepare("SELECT 1 FROM roles WHERE lower(name) = lower(?)").get(name))
    redirect("/admin/roles?error=That+role+already+exists");
  db.prepare("INSERT INTO roles (name, permissions) VALUES (?, ?)").run(
    name,
    JSON.stringify(getPermissions(formData)),
  );
  addActivity(admin.id, "role_created", { details: name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+created");
}

export async function updateRole(roleId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const current = db
    .prepare("SELECT name FROM roles WHERE id = ?")
    .get(roleId) as { name: string } | undefined;
  if (!current) redirect("/admin/roles?error=Role+not+found");
  if (current.name === VISITOR_ROLE_NAME)
    redirect("/admin/roles?error=The+Visitor+role+is+managed+automatically");
  const name = String(formData.get("name") || "")
    .trim()
    .slice(0, 60);
  if (!name) redirect("/admin/roles?error=Role+name+is+required");
  const assignedUsers = db
    .prepare("SELECT user_id FROM user_roles WHERE role_id = ?")
    .all(roleId) as { user_id: number }[];
  db.prepare("UPDATE roles SET name = ?, permissions = ? WHERE id = ?").run(
    name,
    JSON.stringify(getPermissions(formData)),
    roleId,
  );
  for (const user of assignedUsers) await persistAccount(user.user_id);
  addActivity(admin.id, "role_updated", { details: name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+updated");
}

export async function deleteRole(roleId: number) {
  const admin = await requireUser("manage_users");
  const role = db.prepare("SELECT name FROM roles WHERE id = ?").get(roleId) as
    | { name: string }
    | undefined;
  if (!role) redirect("/admin/roles?error=Role+not+found");
  if (role.name === "Admin" || role.name === VISITOR_ROLE_NAME)
    redirect("/admin/roles?error=That+default+role+cannot+be+deleted");
  const assigned = (
    db
      .prepare("SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?")
      .get(roleId) as { count: number }
  ).count;
  if (assigned)
    redirect(
      "/admin/roles?error=Remove+this+role+from+users+before+deleting+it",
    );
  db.prepare("DELETE FROM roles WHERE id = ?").run(roleId);
  addActivity(admin.id, "role_deleted", { details: role.name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+deleted");
}
