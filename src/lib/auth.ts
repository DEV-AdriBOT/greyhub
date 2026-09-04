import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, hasPermission, type Permission } from "@/lib/db";

const COOKIE_NAME = "greyhub_session";
const SESSION_DAYS = 14;

export type CurrentUser = {
  id: number;
  username: string;
  profile_image: string | null;
  status: "active" | "suspended";
  suspended_until: string | null;
  completed_orders: number;
  money_earned: number;
  dings_count: number;
  joined_at: string;
  roles: string[];
  permissions: string[];
};

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(tokenHash(token), userId, expires.toISOString());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function authenticate(username: string, password: string) {
  const user = db.prepare("SELECT id, password_hash FROM users WHERE lower(username) = lower(?)").get(username) as { id: number; password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  return user.id;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const user = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP
  `).get(tokenHash(token)) as Omit<CurrentUser, "roles" | "permissions"> | undefined;

  if (!user) return null;

  if (user.status === "suspended" && user.suspended_until && new Date(user.suspended_until) <= new Date()) {
    db.prepare("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?").run(user.id);
    user.status = "active";
    user.suspended_until = null;
  }

  const roleRows = db.prepare(`
    SELECT roles.name, roles.permissions
    FROM roles
    JOIN user_roles ON user_roles.role_id = roles.id
    WHERE user_roles.user_id = ?
    ORDER BY roles.name
  `).all(user.id) as { name: string; permissions: string }[];

  return {
    ...user,
    roles: roleRows.map((role) => role.name),
    permissions: [...new Set(roleRows.flatMap((role) => JSON.parse(role.permissions) as string[]))],
  };
}

export async function requireUser(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "suspended") redirect("/suspended");
  if (permission && !hasPermission(user.id, permission)) redirect("/dashboard?error=forbidden");
  return user;
}
