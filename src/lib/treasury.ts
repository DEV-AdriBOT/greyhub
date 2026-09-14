import crypto from "node:crypto";
import { get, put } from "@vercel/blob";
import { db } from "./db";

const apiBase =
  process.env.TREASURY_API_URL || "https://api.democracycraft.net/economy";
const configPath = "config/treasury.json";

type KeyType = "PERSONAL" | "BUSINESS";

type TreasuryConfig = {
  version: 1;
  encryptedApiKey: string;
  keyType: KeyType;
  keyId: number;
  ownerUuid: string;
  firmId: number | null;
  sourceAccountId: number | null;
  automaticEnabled: boolean;
  updatedAt: string;
  updatedBy: number;
  webhookId?: number;
  webhookToken?: string;
  encryptedWebhookSecret?: string;
  lastWebhookAt?: string;
};

export type TreasuryAccount = {
  accountId: number;
  displayName: string;
  accountType: string;
  balance: string;
  archived: boolean;
};

export type TreasuryStatus = {
  configured: boolean;
  keyType?: KeyType;
  keyId?: number;
  firmId?: number | null;
  sourceAccountId?: number | null;
  automaticEnabled: boolean;
  webhookId?: number;
  lastWebhookAt?: string;
  updatedAt?: string;
};

export type TreasuryPayout = {
  orderId: number;
  userId: number;
  payoutReference: string;
  username: string;
  amount: string;
  idempotencyKey: string;
  status: "pending" | "succeeded" | "failed";
  txnId?: string;
  settledAt?: string;
  error?: string;
  updatedAt: string;
};

type MeResponse = {
  keyId: number;
  ownerUuid: string;
  keyType: string;
  accountId?: number | null;
  firmId?: number | null;
};

function encryptionSecret() {
  const secret =
    process.env.TREASURY_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET ||
    process.env.ADMIN_PASSWORD;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("TREASURY_ENCRYPTION_KEY is not configured");
  }
  return secret || "greyhub-development-treasury-key";
}

function encryptionKey() {
  return crypto.scryptSync(
    encryptionSecret(),
    "greyhub-treasury-v1",
    32,
  );
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decrypt(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue)
    throw new Error("Stored Treasury credentials are invalid");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function readJson<T>(path: string, localKey: string): Promise<T | null> {
  if (!process.env.VERCEL) {
    const row = db
      .prepare("SELECT value FROM app_meta WHERE key = ?")
      .get(localKey) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : null;
  }

  const result = await get(path, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (result?.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text()) as T;
}

async function writeJson(path: string, localKey: string, value: unknown) {
  const serialized = JSON.stringify(value);
  if (!process.env.VERCEL) {
    db.prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(localKey, serialized);
    return;
  }

  await put(path, serialized, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

async function readConfig() {
  return readJson<TreasuryConfig>(configPath, "treasury_config");
}

async function writeConfig(config: TreasuryConfig) {
  await writeJson(configPath, "treasury_config", config);
}

function cleanApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "");
}

async function apiRequest<T>(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    if (!response.ok) {
      const message = body?.message || body?.error || `Treasury returned ${response.status}`;
      throw new Error(message.slice(0, 180));
    }
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("Treasury did not respond in time");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function identifyKey(apiKey: string) {
  const me = await apiRequest<MeResponse>("/api/v1/auth/me", apiKey);
  const keyType = me.keyType.toUpperCase();
  if (keyType !== "PERSONAL" && keyType !== "BUSINESS")
    throw new Error("Treasury returned an unsupported key type");
  return { ...me, keyType: keyType as KeyType };
}

async function accountsForKey(apiKey: string) {
  return apiRequest<TreasuryAccount[]>("/api/v1/firms/me/accounts", apiKey);
}

export async function connectTreasury(
  rawApiKey: string,
  automaticEnabled: boolean,
  userId: number,
) {
  const apiKey = cleanApiKey(rawApiKey);
  if (!apiKey) throw new Error("Enter a Treasury API key");
  const me = await identifyKey(apiKey);
  let sourceAccountId = me.accountId ?? null;

  if (me.keyType === "BUSINESS") {
    const accounts = await accountsForKey(apiKey);
    sourceAccountId =
      accounts.find((account) => !account.archived)?.accountId ?? null;
    if (!sourceAccountId)
      throw new Error("This business key has no active Treasury account");
  }

  const config: TreasuryConfig = {
    version: 1,
    encryptedApiKey: encrypt(apiKey),
    keyType: me.keyType,
    keyId: me.keyId,
    ownerUuid: me.ownerUuid,
    firmId: me.firmId ?? null,
    sourceAccountId,
    automaticEnabled,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  await writeConfig(config);
  return config;
}

export async function getTreasuryStatus(): Promise<TreasuryStatus> {
  const config = await readConfig();
  if (!config) return { configured: false, automaticEnabled: false };
  return {
    configured: true,
    keyType: config.keyType,
    keyId: config.keyId,
    firmId: config.firmId,
    sourceAccountId: config.sourceAccountId,
    automaticEnabled: config.automaticEnabled,
    webhookId: config.webhookId,
    lastWebhookAt: config.lastWebhookAt,
    updatedAt: config.updatedAt,
  };
}

export async function getTreasuryAccounts() {
  const config = await readConfig();
  if (!config || config.keyType !== "BUSINESS") return [];
  return accountsForKey(decrypt(config.encryptedApiKey));
}

export async function updateTreasurySettings(
  automaticEnabled: boolean,
  sourceAccountId: number | null,
  userId: number,
) {
  const config = await readConfig();
  if (!config) throw new Error("Connect a Treasury key first");
  if (config.keyType === "BUSINESS") {
    const accounts = await accountsForKey(decrypt(config.encryptedApiKey));
    if (!accounts.some((account) => !account.archived && account.accountId === sourceAccountId))
      throw new Error("Choose an active business account");
    config.sourceAccountId = sourceAccountId;
  }
  config.automaticEnabled = automaticEnabled;
  config.updatedAt = new Date().toISOString();
  config.updatedBy = userId;
  await writeConfig(config);
}

export async function registerTreasuryWebhook(origin: string, userId: number) {
  const config = await readConfig();
  if (!config) throw new Error("Connect a Treasury key first");
  const parsedOrigin = new URL(origin);
  if (parsedOrigin.protocol !== "https:" && parsedOrigin.hostname !== "localhost")
    throw new Error("Webhook URL must use HTTPS");
  const webhookToken = crypto.randomBytes(32).toString("base64url");
  const url = new URL("/api/treasury/webhook", parsedOrigin);
  url.searchParams.set("token", webhookToken);
  const response = await apiRequest<{ id: number; secret?: string }>(
    "/api/v1/webhooks",
    decrypt(config.encryptedApiKey),
    { method: "POST", body: JSON.stringify({ url: url.toString() }) },
  );
  config.webhookId = response.id;
  config.webhookToken = webhookToken;
  config.encryptedWebhookSecret = response.secret
    ? encrypt(response.secret)
    : undefined;
  config.updatedAt = new Date().toISOString();
  config.updatedBy = userId;
  await writeConfig(config);
  return response.id;
}

function payoutKey(payoutReference: string, userId: number) {
  return crypto
    .createHash("sha256")
    .update(`${payoutReference}:${userId}`)
    .digest("hex");
}

async function readPayout(payoutReference: string, userId: number) {
  const key = payoutKey(payoutReference, userId);
  return readJson<TreasuryPayout>(
    `config/treasury-payouts/${key}.json`,
    `treasury_payout:${key}`,
  );
}

async function writePayout(payout: TreasuryPayout) {
  const key = payoutKey(payout.payoutReference, payout.userId);
  await writeJson(
    `config/treasury-payouts/${key}.json`,
    `treasury_payout:${key}`,
    payout,
  );
}

export async function sendTreasuryPayout(values: {
  orderId: number;
  userId: number;
  payoutReference: string;
  username: string;
  amount: string;
  memo: string;
}) {
  const config = await readConfig();
  if (!config || !config.automaticEnabled)
    throw new Error("Automatic Treasury payouts are not enabled");
  if (config.keyType === "BUSINESS" && !config.sourceAccountId)
    throw new Error("Choose a Treasury business account first");

  const existing = await readPayout(values.payoutReference, values.userId);
  if (existing && existing.amount !== values.amount)
    throw new Error(
      `${values.username} already has a Treasury payout attempt for a different amount`,
    );
  if (existing?.status === "succeeded") return existing;

  const idempotencyKey = crypto
    .createHash("sha256")
    .update(`greyhub:v1:${values.payoutReference}:${values.userId}`)
    .digest("hex");
  const payout: TreasuryPayout = {
    orderId: values.orderId,
    userId: values.userId,
    payoutReference: values.payoutReference,
    username: values.username,
    amount: values.amount,
    idempotencyKey,
    status: "pending",
    updatedAt: new Date().toISOString(),
  };
  await writePayout(payout);

  try {
    const body: Record<string, unknown> = {
      toPlayerName: values.username,
      amount: values.amount,
      memo: values.memo.slice(0, 140),
    };
    if (config.keyType === "BUSINESS")
      body.fromAccountId = config.sourceAccountId;
    const result = await apiRequest<{
      txnId: number;
      settledAt?: string;
    }>("/api/v1/transfers/to-player", decrypt(config.encryptedApiKey), {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
    payout.status = "succeeded";
    payout.txnId = String(result.txnId);
    payout.settledAt = result.settledAt || new Date().toISOString();
    payout.updatedAt = new Date().toISOString();
    await writePayout(payout);
    return payout;
  } catch (error) {
    payout.status = "failed";
    payout.error = error instanceof Error ? error.message.slice(0, 180) : "Treasury payout failed";
    payout.updatedAt = new Date().toISOString();
    await writePayout(payout);
    throw error;
  }
}

export async function acceptTreasuryWebhook(token: string, body: unknown) {
  const config = await readConfig();
  if (!config?.webhookToken) return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(config.webhookToken);
  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  )
    return false;

  config.lastWebhookAt = new Date().toISOString();
  await writeConfig(config);
  await writeJson(
    "config/treasury-last-webhook.json",
    "treasury_last_webhook",
    { receivedAt: config.lastWebhookAt, body },
  );
  return true;
}
