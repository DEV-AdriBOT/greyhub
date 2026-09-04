import { redirect } from "next/navigation";
import { logoutAction } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "suspended") redirect("/dashboard");

  return (
    <main className="center-page">
      <section className="notice-panel">
        <span className="brand-mark">▲</span>
        <p className="eyebrow">ACCOUNT ON HOLD</p>
        <h1>Your GreyHub access is suspended</h1>
        <p>Accounts are automatically held at three dings. A manager can review and restore your access.</p>
        {user.suspended_until && <p className="muted">Scheduled until {new Date(user.suspended_until).toLocaleString()}</p>}
        <form action={logoutAction}><button className="button">Sign out</button></form>
      </section>
    </main>
  );
}
