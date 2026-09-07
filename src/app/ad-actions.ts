"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  createAdRecord,
  deleteAdRecord,
  getAdRecord,
  toggleAdRecord,
  updateAdRecord,
} from "@/lib/ads";
import { addActivity } from "@/lib/db";
import { deleteUpload, saveUpload } from "@/lib/uploads";

function adLink(value: string) {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function createAd(formData: FormData) {
  const admin = await requireUser("manage_users");
  const title = String(formData.get("title") || "").trim().slice(0, 100);
  const body = String(formData.get("body") || "").trim().slice(0, 500);
  const rawLink = String(formData.get("link_url") || "").trim().slice(0, 500);
  const linkUrl = adLink(rawLink);
  const image = formData.get("banner_image");
  const hasImage = image instanceof File && image.size > 0;

  if (!title) redirect("/admin/ads?error=Title+is+required");
  if (rawLink && !linkUrl)
    redirect("/admin/ads?error=Use+a+valid+HTTP+or+internal+link");
  if (!body && !hasImage)
    redirect("/admin/ads?error=Add+some+text+or+a+banner+image");

  let imagePath: string | null = null;
  if (hasImage) {
    const allowed: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    if (!allowed[image.type] || image.size > 4 * 1024 * 1024)
      redirect("/admin/ads?error=Use+a+JPG,+PNG,+WebP+or+GIF+under+4MB");
    const filename = `${crypto.randomUUID()}${allowed[image.type]}`;
    imagePath = await saveUpload("ads", filename, image);
  }

  try {
    await createAdRecord({ title, body, image_path: imagePath, link_url: linkUrl }, admin.id);
  } catch (error) {
    await deleteUpload(imagePath);
    throw error;
  }
  addActivity(admin.id, "ad_created", { details: title });
  revalidatePath("/dashboard");
  revalidatePath("/admin/ads");
  redirect("/admin/ads?notice=Banner+published");
}

export async function toggleAd(adId: string) {
  const admin = await requireUser("manage_users");
  const ad = await toggleAdRecord(adId);
  if (!ad) redirect("/admin/ads?error=Banner+not+found");
  addActivity(admin.id, "ad_toggled", { details: adId });
  revalidatePath("/dashboard");
  revalidatePath("/admin/ads");
  redirect("/admin/ads?notice=Banner+status+updated");
}

export async function updateAd(adId: string, formData: FormData) {
  const admin = await requireUser("manage_users");
  const current = await getAdRecord(adId);
  if (!current) redirect("/admin/ads?error=Banner+not+found");

  const title = String(formData.get("title") || "").trim().slice(0, 100);
  const body = String(formData.get("body") || "").trim().slice(0, 500);
  const rawLink = String(formData.get("link_url") || "").trim().slice(0, 500);
  const linkUrl = adLink(rawLink);
  const image = formData.get("banner_image");
  const hasImage = image instanceof File && image.size > 0;
  const removeImage = formData.get("remove_image") === "on";

  if (!title) redirect("/admin/ads?error=Title+is+required");
  if (rawLink && !linkUrl)
    redirect("/admin/ads?error=Use+a+valid+HTTP+or+internal+link");
  if (!body && !hasImage && (removeImage || !current.image_path))
    redirect("/admin/ads?error=Add+some+text+or+a+banner+image");

  let imagePath = removeImage ? null : current.image_path;
  let newImagePath: string | null = null;
  if (hasImage) {
    const allowed: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
    };
    if (!allowed[image.type] || image.size > 4 * 1024 * 1024)
      redirect("/admin/ads?error=Use+a+JPG,+PNG,+WebP+or+GIF+under+4MB");
    const filename = `${crypto.randomUUID()}${allowed[image.type]}`;
    newImagePath = await saveUpload("ads", filename, image);
    imagePath = newImagePath;
  }

  let result;
  try {
    result = await updateAdRecord(adId, {
      title,
      body,
      image_path: imagePath,
      link_url: linkUrl,
    });
  } catch (error) {
    await deleteUpload(newImagePath);
    throw error;
  }
  if (!result) {
    await deleteUpload(newImagePath);
    redirect("/admin/ads?error=Banner+not+found");
  }
  if (result.previousImage && result.previousImage !== imagePath)
    await deleteUpload(result.previousImage);

  addActivity(admin.id, "ad_updated", { details: title });
  revalidatePath("/dashboard");
  revalidatePath("/admin/ads");
  redirect("/admin/ads?notice=Banner+updated");
}

export async function deleteAd(adId: string) {
  const admin = await requireUser("manage_users");
  const ad = await deleteAdRecord(adId);
  if (!ad) redirect("/admin/ads?error=Banner+not+found");
  await deleteUpload(ad.image_path);
  addActivity(admin.id, "ad_deleted", { details: adId });
  revalidatePath("/dashboard");
  revalidatePath("/admin/ads");
  redirect("/admin/ads?notice=Banner+deleted");
}
