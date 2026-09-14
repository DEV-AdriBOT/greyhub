import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";

let database: Awaited<typeof import("./db")>["db"];

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  database = (await import("./db")).db;
});

describe("GreyHub database", () => {
  it("creates the requested core tables", () => {
    const tables = database
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all() as { name: string }[];
    const names = tables.map((table) => table.name);
    for (const table of [
      "users",
      "roles",
      "user_roles",
      "orders",
      "order_workers",
      "join_requests",
      "proof_images",
      "payments",
      "dings",
      "notifications",
      "activity_logs",
      "sessions",
      "chat_messages",
      "ads",
    ]) {
      expect(names).toContain(table);
    }
  });

  it("starts with only the admin account", () => {
    expect(
      (
        database.prepare("SELECT COUNT(*) count FROM users").get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    expect(
      (
        database.prepare("SELECT COUNT(*) count FROM orders").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
    expect(
      (
        database
          .prepare("SELECT COUNT(*) count FROM roles WHERE name = 'Admin'")
          .get() as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        database
          .prepare("SELECT COUNT(*) count FROM roles WHERE name = 'Visitor'")
          .get() as { count: number }
      ).count,
    ).toBe(1);
  });

  it("uses Visitor as the fallback until another role is assigned", async () => {
    const { restoreStoredAccount } = await import("./accounts");
    const { isVisitorUserId, replaceUserRoles } = await import("./db");
    restoreStoredAccount({
      id: 78,
      username: "waiting-user",
      password_hash: bcrypt.hashSync("visitor-password", 10),
      status: "active",
      suspended_until: null,
      joined_at: "2026-09-14T10:00:00.000Z",
      roles: [],
      updated_at: "2026-09-14T10:00:00.000Z",
    });
    expect(isVisitorUserId(78)).toBe(true);

    const employeeRole = Number(
      database
        .prepare("INSERT INTO roles (name, permissions) VALUES ('Employee', '[]')")
        .run().lastInsertRowid,
    );
    replaceUserRoles(78, [employeeRole]);
    expect(isVisitorUserId(78)).toBe(false);
    expect(
      database
        .prepare(
          `SELECT roles.name FROM roles
           JOIN user_roles ON user_roles.role_id = roles.id
           WHERE user_roles.user_id = 78`,
        )
        .all(),
    ).toEqual([{ name: "Employee" }]);
  });

  it("stores and reads crew chat messages", async () => {
    const { createChatMessage, recentChatMessages } = await import("./chat");
    const admin = database
      .prepare("SELECT id FROM users WHERE username = 'admin'")
      .get() as { id: number };

    const created = createChatMessage(admin.id, "Radio check");
    expect(created.username).toBe("admin");
    expect(created.body).toBe("Radio check");
    expect(recentChatMessages()).toEqual([created]);
  });

  it("restores a persistent account with its password and role", async () => {
    const { restoreStoredAccount } = await import("./accounts");
    const { hasPermission } = await import("./db");
    const passwordHash = bcrypt.hashSync("permanent-password", 10);
    restoreStoredAccount({
      id: 77,
      username: "stored-worker",
      password_hash: passwordHash,
      status: "active",
      suspended_until: null,
      joined_at: "2026-09-10T10:00:00.000Z",
      roles: [{ name: "Foreman", permissions: ["manage_orders"] }],
      updated_at: "2026-09-10T10:00:00.000Z",
    });

    expect(
      database
        .prepare("SELECT username, password_hash FROM users WHERE id = 77")
        .get(),
    ).toEqual({
      username: "stored-worker",
      password_hash: passwordHash,
    });
    expect(bcrypt.compareSync("permanent-password", passwordHash)).toBe(true);
    expect(hasPermission(77, "manage_orders")).toBe(true);
  });

  it("creates and manages dashboard banners", async () => {
    const {
      createAdRecord,
      deleteAdRecord,
      listAds,
      toggleAdRecord,
      updateAdRecord,
    } = await import("./ads");
    const admin = database
      .prepare("SELECT id FROM users WHERE username = 'admin'")
      .get() as { id: number };

    const adId = await createAdRecord(
      {
        title: "Crew meeting",
        body: "Meet at the north depot.",
        image_path: null,
        link_url: "/orders",
      },
      admin.id,
    );
    expect((await listAds(true))[0].title).toBe("Crew meeting");
    await updateAdRecord(adId, {
      title: "Updated meeting",
      body: "Meet at the south depot.",
      image_path: null,
      link_url: "/dashboard",
    });
    expect((await listAds(true))[0]).toMatchObject({
      title: "Updated meeting",
      body: "Meet at the south depot.",
      link_url: "/dashboard",
    });
    await toggleAdRecord(adId);
    expect(await listAds(true)).toEqual([]);
    await deleteAdRecord(adId);
    expect(await listAds()).toEqual([]);
  });
});
