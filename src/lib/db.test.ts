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
