import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  persistAccount,
  restoreStoredAccounts,
  storedAccountForLogin,
} from "@/lib/accounts";
import {
  db,
  hasPermission,
  isVisitorAccount,
  type Permission,
} from "@/lib/db";

const COOKIE_NAME = "greyhub_session";
const SESSION_DAYS = 90;

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

function sessionSecret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "greyhub-development-session"
  );
}

function signSession(userId: number, expiresAt: number) {
  const payload = `${userId}.${expiresAt}`;
  const signature = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userIdValue, expiresValue, signature] = parts;
  const userId = Number(userIdValue);
  const expiresAt = Number(expiresValue);
  if (!Number.isInteger(userId) || !Number.isInteger(expiresAt) || !signature) {
    return null;
  }

  const payload = `${userId}.${expiresAt}`;
  const expected = crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer) ||
    expiresAt <= Date.now()
  ) {
    return null;
  }

  return userId;
}

export async function createSession(userId: number) {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = signSession(userId, expires.getTime());

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
  cookieStore.delete(COOKIE_NAME);
}

export async function authenticate(username: string, password: string) {
  await restoreStoredAccounts();
  const stored = await storedAccountForLogin(username);
  const user = db
    .prepare(
      "SELECT id, password_hash FROM users WHERE lower(username) = lower(?)",
    )
    .get(username) as { id: number; password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  if (process.env.VERCEL && !stored) await persistAccount(user.id);
  return user.id;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = readSession(token);
  if (!userId) return null;
  await restoreStoredAccounts();

  const user = db
    .prepare(
      `
    SELECT users.*
    FROM users
    WHERE users.id = ?
  `,
    )
    .get(userId) as
    | Omit<CurrentUser, "roles" | "permissions">
    | undefined;

  if (!user) return null;

  if (
    user.status === "suspended" &&
    user.suspended_until &&
    new Date(user.suspended_until) <= new Date()
  ) {
    db.prepare(
      "UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?",
    ).run(user.id);
    user.status = "active";
    user.suspended_until = null;
    await persistAccount(user.id);
  }

  const roleRows = db
    .prepare(
      `
    SELECT roles.name, roles.permissions
    FROM roles
    JOIN user_roles ON user_roles.role_id = roles.id
    WHERE user_roles.user_id = ?
    ORDER BY roles.name
  `,
    )
    .all(user.id) as { name: string; permissions: string }[];

  return {
    ...user,
    roles: roleRows.map((role) => role.name),
    permissions: [
      ...new Set(
        roleRows.flatMap((role) => JSON.parse(role.permissions) as string[]),
      ),
    ],
  };
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "suspended") redirect("/suspended");
  return user;
}

export async function requireUser(permission?: Permission) {
  const user = await requireAuthenticatedUser();
  if (isVisitorAccount(user)) redirect("/visitor");
  if (permission && !hasPermission(user.id, permission))
    redirect("/dashboard?error=forbidden");
  return user;
}

export async function requireVisitor() {
  const user = await requireAuthenticatedUser();
  if (!isVisitorAccount(user)) redirect("/dashboard");
  return user;
}
