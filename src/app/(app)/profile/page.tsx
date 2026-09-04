import Link from "next/link";
import { updateProfileImage } from "@/app/profile-actions";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, orderCode } from "@/lib/db";
import { money, shortDate } from "@/lib/format";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const stats = db.prepare(`SELECT
    SUM(CASE WHEN ow.abandoned_at IS NULL AND o.status IN ('claimed','in_progress','pending_review') THEN 1 ELSE 0 END) active,
    SUM(CASE WHEN ow.abandoned_at IS NOT NULL THEN 1 ELSE 0 END) abandoned
    FROM order_workers ow JOIN orders o ON o.id = ow.order_id WHERE ow.user_id = ?`).get(user.id) as { active: number | null; abandoned: number | null };
  const dings = db.prepare("SELECT dings.*, orders.title FROM dings LEFT JOIN orders ON orders.id = dings.order_id WHERE dings.user_id = ? AND dings.removed_at IS NULL ORDER BY dings.created_at DESC").all(user.id) as { id: number; reason: string; created_at: string; order_id: number | null; title: string | null }[];
  const recent = db.prepare(`SELECT orders.id, orders.title, orders.status, orders.completion_date FROM orders JOIN order_workers ON order_workers.order_id = orders.id WHERE order_workers.user_id = ? ORDER BY COALESCE(orders.completion_date, orders.created_at) DESC LIMIT 5`).all(user.id) as { id: number; title: string; status: string; completion_date: string | null }[];
  return (
    <>
      {query.notice && <div className="flash flash-success">{query.notice}</div>}{query.error && <div className="flash flash-error">{query.error}</div>}
      <section className="profile-header"><Avatar username={user.username} image={user.profile_image} size="large" /><div><p className="eyebrow">CREW PROFILE</p><h1>{user.username}</h1><p>{user.roles.join(" · ") || "Crew member"} · Joined {shortDate(user.joined_at)}</p></div><StatusPill status={user.status} /></section>
      <section className="metric-strip profile-metrics"><div><span>Completed</span><strong>{user.completed_orders}</strong></div><div><span>Active</span><strong>{stats.active || 0}</strong></div><div><span>Abandoned</span><strong>{stats.abandoned || 0}</strong></div><div><span>Earned</span><strong>{money(user.money_earned)}</strong></div><div><span>Dings</span><strong className={user.dings_count ? "danger-text" : ""}>{user.dings_count}<small>/3</small></strong></div></section>
      <div className="profile-grid"><section className="board-section"><div className="section-heading"><div><p className="eyebrow">PORTRAIT</p><h2>Profile picture</h2></div></div><form action={updateProfileImage} className="upload-row"><input type="file" name="profile_image" accept="image/png,image/jpeg,image/webp" required /><button className="button">Upload</button></form><p className="help-text">JPG, PNG or WebP. Maximum 3 MB.</p></section>
      <section className="board-section"><div className="section-heading"><div><p className="eyebrow">RECENT TICKETS</p><h2>Order record</h2></div></div><div className="order-list">{recent.map((order) => <Link key={order.id} href={`/orders/${order.id}`}><div><small>{orderCode(order.id)}</small><strong>{order.title}</strong><span>{shortDate(order.completion_date)}</span></div><StatusPill status={order.status} /></Link>)}</div></section>
      <section className="board-section board-wide"><div className="section-heading"><div><p className="eyebrow">DING RECORD</p><h2>Current dings</h2></div></div>{dings.length ? <div className="ding-list">{dings.map((ding) => <div key={ding.id}><span>!</span><div><strong>{ding.reason}</strong><small>{shortDate(ding.created_at)}{ding.order_id ? ` · ${orderCode(ding.order_id)}` : ""}</small></div></div>)}</div> : <div className="empty-state">Clean record. Keep it that way.</div>}</section></div>
    </>
  );
}
