"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession } from "@/lib/auth";
import { isVisitorUserId } from "@/lib/db";

export type LoginState = { error: string };

export async function loginAction(
  _: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password)
    return { error: "Enter your username and password." };

  const userId = await authenticate(username, password);
  if (!userId) return { error: "That username or password is not correct." };

  await createSession(userId);
  redirect(isVisitorUserId(userId) ? "/visitor" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
