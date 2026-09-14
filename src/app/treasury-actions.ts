"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addActivity } from "@/lib/db";
import {
  connectTreasury,
  registerTreasuryWebhook,
  updateTreasurySettings,
} from "@/lib/treasury";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Treasury request failed";
}

export async function saveTreasuryKey(formData: FormData) {
  const admin = await requireUser("admin");
  try {
    const config = await connectTreasury(
      String(formData.get("api_key") || ""),
      formData.get("automatic_enabled") === "on",
      admin.id,
    );
    addActivity(admin.id, "treasury_connected", {
      details: `${config.keyType} key`,
    });
  } catch (error) {
    redirect(`/admin/treasury?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin/treasury");
  revalidatePath("/admin");
  redirect("/admin/treasury?notice=Treasury+key+validated+and+saved");
}

export async function saveTreasurySettings(formData: FormData) {
  const admin = await requireUser("admin");
  const accountValue = Number(formData.get("source_account_id"));
  try {
    await updateTreasurySettings(
      formData.get("automatic_enabled") === "on",
      Number.isInteger(accountValue) ? accountValue : null,
      admin.id,
    );
    addActivity(admin.id, "treasury_settings_updated");
  } catch (error) {
    redirect(`/admin/treasury?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin/treasury");
  redirect("/admin/treasury?notice=Treasury+settings+saved");
}

export async function createTreasuryWebhook(formData: FormData) {
  const admin = await requireUser("admin");
  const origin = String(formData.get("origin") || "").trim();
  try {
    const webhookId = await registerTreasuryWebhook(origin, admin.id);
    addActivity(admin.id, "treasury_webhook_registered", {
      details: `Webhook ${webhookId}`,
    });
  } catch (error) {
    redirect(`/admin/treasury?error=${encodeURIComponent(message(error))}`);
  }
  revalidatePath("/admin/treasury");
  redirect("/admin/treasury?notice=Treasury+webhook+registered");
}
