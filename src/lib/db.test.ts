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
    ]) {
      expect(names).toContain(table);
    }
  });

  it("seeds a small working development set", () => {
    expect(
      (
        database.prepare("SELECT COUNT(*) count FROM users").get() as {
          count: number;
        }
      ).count,
    ).toBe(3);
    expect(
      (
        database.prepare("SELECT COUNT(*) count FROM orders").get() as {
          count: number;
        }
      ).count,
    ).toBe(5);
    expect(
      (
        database
          .prepare(
            "SELECT COUNT(*) count FROM orders WHERE status = 'completed'",
          )
          .get() as { count: number }
      ).count,
    ).toBe(1);
  });
});
