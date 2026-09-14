import { redirect } from "next/navigation";

export default async function VisitorPage() {
  redirect("/dashboard");
}
