import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup login-brand">
          <span className="brand-mark">▲</span>
          <div>
            <strong>GreyHub</strong>
            <small>WORK OFFICE</small>
          </div>
        </div>
        <h1>Clock in</h1>
        <p className="muted">
          Sign in to pick up orders and report completed work.
        </p>
        <LoginForm />
        {process.env.NODE_ENV === "development" && (
          <p className="login-note">Development: admin / greyhub</p>
        )}
      </section>
      <aside className="login-scenery" aria-hidden="true">
        <div className="trail-sign">
          TRAIL 09
          <br />
          NORTH CREW
        </div>
      </aside>
    </main>
  );
}
