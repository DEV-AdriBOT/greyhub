"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addActivity, addNotification, db, type Permission } from "@/lib/db";

const allowedPermissions: Permission[] = ["admin", "manage_orders", "review_orders", "manage_users"];

function refreshAdmin(userId?: number) {
  revalidatePath("/admin");
  revalidatePath("/admin/roles");
  revalidatePath("/employees");
  if (userId) { revalidatePath(`/admin/users/${userId}`); revalidatePath(`/employees/${userId}`); }
}

function getPermissions(formData: FormData) {
  return allowedPermissions.filter((permission) => formData.get(permission) === "on");
}

function recalculateDings(userId: number) {
  const count = (db.prepare("SELECT COUNT(*) AS count FROM dings WHERE user_id = ? AND removed_at IS NULL").get(userId) as { count: number }).count;
  db.prepare("UPDATE users SET dings_count = ?, status = CASE WHEN ? >= 3 THEN 'suspended' ELSE status END WHERE id = ?").run(count, count, userId);
  return count;
}

export async function createUser(formData: FormData) {
  const admin = await requireUser("manage_users");
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");
  const roleId = Number(formData.get("role_id"));
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username) || password.length < 8) redirect("/admin?error=Use+a+valid+username+and+an+8-character+password");
  if (db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?)").get(username)) redirect("/admin?error=That+username+already+exists");
  const userId = db.transaction(() => {
    const id = Number(db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, bcrypt.hashSync(password, 10)).lastInsertRowid);
    if (roleId) db.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE id = ?").run(id, roleId);
    return id;
  })();
  addActivity(admin.id, "user_created", { userId, details: username });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=User+created`);
}

export async function updateUser(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const username = String(formData.get("username") || "").trim();
  const status = formData.get("status") === "suspended" ? "suspended" : "active";
  const roleIds = formData.getAll("role_ids").map(Number).filter(Number.isInteger);
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) redirect(`/admin/users/${userId}?error=Invalid+username`);
  const duplicate = db.prepare("SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?").get(username, userId);
  if (duplicate) redirect(`/admin/users/${userId}?error=That+username+already+exists`);
  db.transaction(() => {
    db.prepare("UPDATE users SET username = ?, status = ?, suspended_until = CASE WHEN ? = 'active' THEN NULL ELSE suspended_until END WHERE id = ?").run(username, status, status, userId);
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    const addRole = db.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE id = ?");
    for (const roleId of roleIds) addRole.run(userId, roleId);
  })();
  addActivity(admin.id, "user_updated", { userId, details: username });
  addNotification(userId, "account_updated", `Your account was updated by ${admin.username}.`, "/profile");
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=User+updated`);
}

export async function setUserPassword(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const password = String(formData.get("password") || "");
  if (password.length < 8) redirect(`/admin/users/${userId}?error=Password+must+be+at+least+8+characters`);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(password, 10), userId);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  addActivity(admin.id, "password_reset", { userId });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=Password+reset`);
}

export async function addDing(userId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const reason = String(formData.get("reason") || "Manual manager ding").trim().slice(0, 300);
  db.prepare("INSERT INTO dings (user_id, reason, added_by) VALUES (?, ?, ?)").run(userId, reason || "Manual manager ding", admin.id);
  const count = recalculateDings(userId);
  addNotification(userId, "ding_added", `You received a ding: ${reason || "Manual manager ding"}`, "/profile");
  addActivity(admin.id, "ding_added", { userId, details: reason });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=Ding+added${count >= 3 ? "+and+account+suspended" : ""}`);
}

export async function removeDing(userId: number, dingId: number) {
  const admin = await requireUser("manage_users");
  db.prepare("UPDATE dings SET removed_at = CURRENT_TIMESTAMP, removed_by = ? WHERE id = ? AND user_id = ? AND removed_at IS NULL").run(admin.id, dingId, userId);
  recalculateDings(userId);
  addActivity(admin.id, "ding_removed", { userId });
  refreshAdmin(userId);
  redirect(`/admin/users/${userId}?notice=Ding+removed`);
}

export async function createRole(formData: FormData) {
  const admin = await requireUser("manage_users");
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!name) redirect("/admin/roles?error=Role+name+is+required");
  if (db.prepare("SELECT 1 FROM roles WHERE lower(name) = lower(?)").get(name)) redirect("/admin/roles?error=That+role+already+exists");
  db.prepare("INSERT INTO roles (name, permissions) VALUES (?, ?)").run(name, JSON.stringify(getPermissions(formData)));
  addActivity(admin.id, "role_created", { details: name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+created");
}

export async function updateRole(roleId: number, formData: FormData) {
  const admin = await requireUser("manage_users");
  const name = String(formData.get("name") || "").trim().slice(0, 60);
  if (!name) redirect("/admin/roles?error=Role+name+is+required");
  db.prepare("UPDATE roles SET name = ?, permissions = ? WHERE id = ?").run(name, JSON.stringify(getPermissions(formData)), roleId);
  addActivity(admin.id, "role_updated", { details: name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+updated");
}

export async function deleteRole(roleId: number) {
  const admin = await requireUser("manage_users");
  const role = db.prepare("SELECT name FROM roles WHERE id = ?").get(roleId) as { name: string } | undefined;
  if (!role) redirect("/admin/roles?error=Role+not+found");
  if (role.name === "Admin") redirect("/admin/roles?error=The+default+Admin+role+cannot+be+deleted");
  const assigned = (db.prepare("SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?").get(roleId) as { count: number }).count;
  if (assigned) redirect("/admin/roles?error=Remove+this+role+from+users+before+deleting+it");
  db.prepare("DELETE FROM roles WHERE id = ?").run(roleId);
  addActivity(admin.id, "role_deleted", { details: role.name });
  refreshAdmin();
  redirect("/admin/roles?notice=Role+deleted");
}
