import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isVisitorAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  redirect(
    user ? (isVisitorAccount(user) ? "/visitor" : "/dashboard") : "/login",
  );
}
