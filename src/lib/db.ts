import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";

const databasePath =
  process.env.DATABASE_PATH ||
  (process.env.VERCEL
    ? path.join("/tmp", "greyhub.db")
    : path.join(process.cwd(), "data", "greyhub.db"));

if (databasePath !== ":memory:") {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const globalForDb = globalThis as unknown as { greyhubDb?: Database.Database };

export const db = globalForDb.greyhubDb ?? new Database(databasePath);

if (process.env.NODE_ENV !== "production") {
  globalForDb.greyhubDb = db;
}

db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    profile_image TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    suspended_until TEXT,
    completed_orders INTEGER NOT NULL DEFAULT 0,
    money_earned REAL NOT NULL DEFAULT 0,
    dings_count INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    permissions TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    client_name TEXT NOT NULL,
    reward REAL NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'in_progress', 'pending_review', 'completed', 'cancelled')),
    team_type TEXT NOT NULL DEFAULT 'solo' CHECK (team_type IN ('solo', 'dual', 'team')),
    max_workers INTEGER NOT NULL DEFAULT 1,
    completion_date TEXT,
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid')),
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS order_workers (
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES users(id),
    abandoned_at TEXT,
    PRIMARY KEY (order_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS join_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_at TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    UNIQUE (order_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS proof_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    paid_at TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payment_splits (
    payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    PRIMARY KEY (payment_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS dings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    added_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TEXT,
    removed_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    order_id INTEGER REFERENCES orders(id),
    user_id INTEGER REFERENCES users(id),
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    link_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_order_workers_user_active ON order_workers(user_id, abandoned_at);
  CREATE INDEX IF NOT EXISTS idx_join_requests_order_status ON join_requests(order_id, status);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read_at);
  CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_token_expiry ON sessions(token_hash, expires_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_ads_active_created ON ads(is_active, created_at);
`);

function ensureAdminAccount() {
  const setup = db.transaction(() => {
    const roleInsert = db.prepare(
      "INSERT OR IGNORE INTO roles (name, permissions) VALUES (?, ?)",
    );
    roleInsert.run(
      "Admin",
      JSON.stringify([
        "admin",
        "manage_orders",
        "review_orders",
        "manage_users",
      ]),
    );
    const adminRole = (
      db.prepare("SELECT id FROM roles WHERE name = 'Admin'").get() as {
        id: number;
      }
    ).id;

    const userInsert = db.prepare(
      "INSERT OR IGNORE INTO users (username, password_hash, completed_orders, money_earned) VALUES (?, ?, ?, ?)",
    );
    userInsert.run(
      "admin",
      bcrypt.hashSync(process.env.ADMIN_PASSWORD || "greyhub", 10),
      0,
      0,
    );
    const getUserId = db.prepare("SELECT id FROM users WHERE username = ?");
    const adminId = (getUserId.get("admin") as { id: number }).id;

    const assignRole = db.prepare(
      "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
    );
    assignRole.run(adminId, adminRole);

    if (process.env.VERCEL) {
      db.prepare(
        "UPDATE users SET profile_image = '/api/uploads/profiles/user-' || id",
      ).run();
    }
  });

  setup();
  db.pragma("optimize");
}

ensureAdminAccount();

export type Permission =
  | "admin"
  | "manage_orders"
  | "review_orders"
  | "manage_users";

export function hasPermission(userId: number, permission: Permission) {
  const rows = db
    .prepare(
      `
    SELECT roles.permissions
    FROM roles
    JOIN user_roles ON user_roles.role_id = roles.id
    WHERE user_roles.user_id = ?
  `,
    )
    .all(userId) as { permissions: string }[];

  return rows.some((row) => {
    const permissions = JSON.parse(row.permissions) as string[];
    return permissions.includes("admin") || permissions.includes(permission);
  });
}

export function addActivity(
  actorId: number | null,
  action: string,
  options: { orderId?: number; userId?: number; details?: string } = {},
) {
  db.prepare(
    `
    INSERT INTO activity_logs (actor_id, action, order_id, user_id, details)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    actorId,
    action,
    options.orderId ?? null,
    options.userId ?? null,
    options.details ?? "",
  );
}

export function addNotification(
  userId: number,
  type: string,
  message: string,
  link?: string,
) {
  db.prepare(
    "INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)",
  ).run(userId, type, message, link ?? null);
}

export function orderCode(id: number) {
  return `GH-${String(id).padStart(4, "0")}`;
}
