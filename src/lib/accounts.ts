import { get, put } from "@vercel/blob";
import { db } from "./db";

export type StoredAccount = {
  id: number;
  username: string;
  password_hash: string;
  status: "active" | "suspended";
  suspended_until: string | null;
  joined_at: string;
  roles: { name: string; permissions: string[] }[];
  updated_at: string;
};

const accountsPath = "config/accounts.json";
let cachedAccounts: StoredAccount[] | null = null;
let cacheExpiresAt = 0;

async function blobAccounts(fresh = false) {
  if (!fresh && cachedAccounts && cacheExpiresAt > Date.now())
    return cachedAccounts;
  const result = await get(accountsPath, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (result?.statusCode !== 200) {
    cachedAccounts = [];
    cacheExpiresAt = Date.now() + 5_000;
    return cachedAccounts;
  }
  const parsed = JSON.parse(await new Response(result.stream).text()) as unknown;
  cachedAccounts = Array.isArray(parsed) ? (parsed as StoredAccount[]) : [];
  cacheExpiresAt = Date.now() + 5_000;
  return cachedAccounts;
}

async function saveBlobAccounts(accounts: StoredAccount[]) {
  await put(accountsPath, JSON.stringify(accounts), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  cachedAccounts = accounts;
  cacheExpiresAt = Date.now() + 5_000;
}

export async function storedAccountForLogin(username: string) {
  if (!process.env.VERCEL) return null;
  const normalized = username.toLowerCase();
  return (
    (await blobAccounts()).find(
      (account) => account.username.toLowerCase() === normalized,
    ) ?? null
  );
}

export function restoreStoredAccount(account: StoredAccount) {
  return db.transaction(() => {
    const existing = db
      .prepare("SELECT id FROM users WHERE id = ? OR lower(username) = lower(?)")
      .get(account.id, account.username) as { id: number } | undefined;
    const userId = existing?.id ?? account.id;

    db.prepare(
      `INSERT OR IGNORE INTO users
       (id, username, password_hash, status, suspended_until, joined_at, profile_image)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      account.username,
      account.password_hash,
      account.status,
      account.suspended_until,
      account.joined_at,
      `/api/uploads/profiles/user-${userId}`,
    );
    db.prepare(
      `UPDATE users
       SET username = ?, password_hash = ?, status = ?, suspended_until = ?
       WHERE id = ?`,
    ).run(
      account.username,
      account.password_hash,
      account.status,
      account.suspended_until,
      userId,
    );

    db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    for (const role of account.roles) {
      db.prepare(
        "INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)",
      ).run(role.name, JSON.stringify(role.permissions));
      const roleId = (
        db.prepare("SELECT id FROM roles WHERE name = ?").get(role.name) as {
          id: number;
        }
      ).id;
      db.prepare(
        "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
      ).run(userId, roleId);
    }
    return userId;
  })();
}

export async function restoreStoredAccounts() {
  if (!process.env.VERCEL) return;
  for (const account of await blobAccounts()) restoreStoredAccount(account);
}

export async function persistAccount(userId: number) {
  if (!process.env.VERCEL) return;
  const user = db
    .prepare(
      `SELECT id, username, password_hash, status, suspended_until, joined_at
       FROM users WHERE id = ?`,
    )
    .get(userId) as Omit<StoredAccount, "roles" | "updated_at"> | undefined;
  if (!user) return;
  const roles = db
    .prepare(
      `SELECT roles.name, roles.permissions FROM roles
       JOIN user_roles ON user_roles.role_id = roles.id
       WHERE user_roles.user_id = ? ORDER BY roles.name`,
    )
    .all(userId) as { name: string; permissions: string }[];
  const account: StoredAccount = {
    ...user,
    roles: roles.map((role) => ({
      name: role.name,
      permissions: JSON.parse(role.permissions) as string[],
    })),
    updated_at: new Date().toISOString(),
  };
  const normalized = account.username.toLowerCase();
  const accounts = (await blobAccounts(true)).filter(
    (item) => item.id !== userId && item.username.toLowerCase() !== normalized,
  );
  await saveBlobAccounts([...accounts, account]);
}
