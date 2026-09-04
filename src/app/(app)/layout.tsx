import Link from "next/link";
import { logoutAction } from "@/app/auth-actions";
import { Avatar } from "@/components/avatar";
import { Sidebar } from "@/components/sidebar";
import { db, hasPermission } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const canManage = hasPermission(user.id, "manage_orders") || hasPermission(user.id, "manage_users");
  const unread = db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").get(user.id) as { count: number };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/dashboard" className="brand-lockup">
          <span className="brand-mark">▲</span>
          <div><strong>GreyHub</strong><small>FIELD OPERATIONS</small></div>
        </Link>
        <Sidebar showAdmin={canManage} />
        <div className="sidebar-user">
          <Avatar username={user.username} image={user.profile_image} />
          <div className="sidebar-user-copy"><strong>{user.username}</strong><small>{user.roles.join(" · ") || "Crew"}</small></div>
          <form action={logoutAction}><button className="text-button">Sign out</button></form>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">▲</span><strong>GreyHub</strong></div>
          <span className="station-label">GREY COMPANY · OPERATIONS BOARD</span>
          <Link href="/notifications" className="notification-link">Notices {unread.count > 0 && <b>{unread.count}</b>}</Link>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
