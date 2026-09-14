import { beforeAll, describe, expect, it, vi } from "vitest";

let treasury: typeof import("./treasury");

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  process.env.TREASURY_ENCRYPTION_KEY = "test-only-encryption-key";
  treasury = await import("./treasury");
});

describe("Treasury integration", () => {
  it("detects personal keys and does not repeat a successful payout", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/auth/me"))
        return Response.json({
          keyId: 12,
          ownerUuid: "00000000-0000-0000-0000-000000000001",
          keyType: "PERSONAL",
          accountId: 44,
          firmId: null,
        });
      if (url.endsWith("/api/v1/transfers/to-player"))
        return Response.json({
          txnId: 991,
          amount: "25.00",
          settledAt: "2026-09-14T12:00:00Z",
        });
      return Response.json({ message: "Unexpected request" }, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await treasury.connectTreasury("personal-token", true, 1);
    expect(await treasury.getTreasuryStatus()).toMatchObject({
      keyType: "PERSONAL",
      sourceAccountId: 44,
      automaticEnabled: true,
    });
    const values = {
      orderId: 80,
      userId: 8,
      payoutReference: "80:2026-09-14T12:00:00Z:Stone delivery",
      username: "Steve",
      amount: "25.00",
      memo: "GH-0080",
    };
    const first = await treasury.sendTreasuryPayout(values);
    const second = await treasury.sendTreasuryPayout(values);
    expect(first.txnId).toBe("991");
    expect(second).toEqual(first);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/api/v1/transfers/to-player"),
      ),
    ).toHaveLength(1);
  });

  it("selects an active account for a business key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/me"))
          return Response.json({
            keyId: 21,
            ownerUuid: "00000000-0000-0000-0000-000000000002",
            keyType: "BUSINESS",
            accountId: null,
            firmId: 7,
          });
        if (url.endsWith("/api/v1/firms/me/accounts"))
          return Response.json([
            {
              accountId: 61,
              displayName: "Old account",
              accountType: "BUSINESS",
              balance: "0.00",
              archived: true,
            },
            {
              accountId: 62,
              displayName: "Payroll",
              accountType: "BUSINESS",
              balance: "800.00",
              archived: false,
            },
          ]);
        return Response.json({ message: "Unexpected request" }, { status: 404 });
      }),
    );

    await treasury.connectTreasury("business-token", false, 1);
    expect(await treasury.getTreasuryStatus()).toMatchObject({
      keyType: "BUSINESS",
      firmId: 7,
      sourceAccountId: 62,
      automaticEnabled: false,
    });
  });
});
