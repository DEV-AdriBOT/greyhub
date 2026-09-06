import crypto from "node:crypto";
import { get, put } from "@vercel/blob";
import { db } from "./db";

export type Ad = {
  id: string;
  title: string;
  body: string;
  image_path: string | null;
  link_url: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
};

const adsPath = "config/ads.json";

async function blobAds() {
  const result = await get(adsPath, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  if (result?.statusCode !== 200) return [];
  const parsed = JSON.parse(await new Response(result.stream).text()) as unknown;
  return Array.isArray(parsed) ? (parsed as Ad[]) : [];
}

async function saveBlobAds(ads: Ad[]) {
  await put(adsPath, JSON.stringify(ads), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
}

export async function listAds(activeOnly = false) {
  if (process.env.VERCEL) {
    const ads = await blobAds();
    return ads
      .filter((ad) => !activeOnly || ad.is_active)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const rows = db
    .prepare(
      `SELECT * FROM ads ${activeOnly ? "WHERE is_active = 1" : ""} ORDER BY created_at DESC`,
    )
    .all() as (Omit<Ad, "id" | "is_active"> & {
    id: number;
    is_active: number;
  })[];
  return rows.map((row) => ({
    ...row,
    id: String(row.id),
    is_active: Boolean(row.is_active),
  }));
}

export async function createAdRecord(
  values: Pick<Ad, "title" | "body" | "image_path" | "link_url">,
  userId: number,
) {
  if (process.env.VERCEL) {
    const now = new Date().toISOString();
    const ad: Ad = {
      id: crypto.randomUUID(),
      ...values,
      is_active: true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };
    const ads = await blobAds();
    await saveBlobAds([ad, ...ads]);
    return ad.id;
  }

  const result = db
    .prepare(
      "INSERT INTO ads (title, body, image_path, link_url, created_by) VALUES (?, ?, ?, ?, ?)",
    )
    .run(values.title, values.body, values.image_path, values.link_url, userId);
  return String(result.lastInsertRowid);
}

export async function toggleAdRecord(adId: string) {
  if (process.env.VERCEL) {
    const ads = await blobAds();
    const ad = ads.find((item) => item.id === adId);
    if (!ad) return null;
    ad.is_active = !ad.is_active;
    ad.updated_at = new Date().toISOString();
    await saveBlobAds(ads);
    return ad;
  }

  const ad = db
    .prepare("SELECT * FROM ads WHERE id = ?")
    .get(Number(adId)) as { is_active: number } | undefined;
  if (!ad) return null;
  db.prepare(
    "UPDATE ads SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  ).run(ad.is_active ? 0 : 1, Number(adId));
  return { is_active: !ad.is_active };
}

export async function deleteAdRecord(adId: string) {
  if (process.env.VERCEL) {
    const ads = await blobAds();
    const ad = ads.find((item) => item.id === adId);
    if (!ad) return null;
    await saveBlobAds(ads.filter((item) => item.id !== adId));
    return ad;
  }

  const ad = db
    .prepare("SELECT image_path FROM ads WHERE id = ?")
    .get(Number(adId)) as { image_path: string | null } | undefined;
  if (!ad) return null;
  db.prepare("DELETE FROM ads WHERE id = ?").run(Number(adId));
  return ad;
}
