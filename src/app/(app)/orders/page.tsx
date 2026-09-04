import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, hasPermission, orderCode } from "@/lib/db";
import { money, shortDate, titleCase } from "@/lib/format";

type Order = { id: number; title: string; client_name: string; reward: number; status: string; team_type: string; max_workers: number; created_at: string; workers: string | null; worker_images: string | null; worker_count: number };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; team?: string; error?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const manager = hasPermission(user.id, "manage_orders");
  const allowedStatuses = ["available", "claimed", "in_progress", "pending_review", "completed", "cancelled"];
  const allowedTeams = ["solo", "dual", "team"];
  const clauses = manager ? ["1 = 1"] : ["orders.status != 'cancelled'"];
  const values: string[] = [];
  if (query.status && allowedStatuses.includes(query.status)) { clauses.push("orders.status = ?"); values.push(query.status); }
  if (query.team && allowedTeams.includes(query.team)) { clauses.push("orders.team_type = ?"); values.push(query.team); }

  const orders = db.prepare(`
    SELECT orders.*,
      GROUP_CONCAT(CASE WHEN order_workers.abandoned_at IS NULL THEN users.username END) AS workers,
      GROUP_CONCAT(CASE WHEN order_workers.abandoned_at IS NULL THEN COALESCE(users.profile_image, '') END) AS worker_images,
      COUNT(CASE WHEN order_workers.abandoned_at IS NULL THEN 1 END) AS worker_count
    FROM orders
    LEFT JOIN order_workers ON order_workers.order_id = orders.id
    LEFT JOIN users ON users.id = order_workers.user_id
    WHERE ${clauses.join(" AND ")}
    GROUP BY orders.id
    ORDER BY CASE orders.status WHEN 'available' THEN 0 WHEN 'claimed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'pending_review' THEN 3 ELSE 4 END, orders.created_at DESC
  `).all(...values) as Order[];

  return (
    <>
      <div className="page-heading heading-with-action"><div><p className="eyebrow">WORK BOARD</p><h1>Orders</h1><p>Claim open work or ask an existing crew to let you in.</p></div>{manager && <Link className="button primary" href="/orders/new">Create order</Link>}</div>
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <form className="filter-bar">
        <label>Status<select name="status" defaultValue={query.status || ""}><option value="">All statuses</option>{allowedStatuses.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
        <label>Crew type<select name="team" defaultValue={query.team || ""}><option value="">All crews</option>{allowedTeams.map((team) => <option key={team} value={team}>{titleCase(team)}</option>)}</select></label>
        <button className="button">Apply</button>
        {(query.status || query.team) && <Link href="/orders" className="text-link">Clear</Link>}
      </form>
      <section className="orders-board">
        <div className="table-wrap"><table><thead><tr><th>Order</th><th>Client</th><th>Posted</th><th>Crew</th><th>Reward</th><th>Status</th><th /></tr></thead><tbody>
          {orders.map((order) => {
            const names = order.workers?.split(",").filter(Boolean) || [];
            const images = order.worker_images?.split(",") || [];
            return <tr key={order.id}><td><Link className="order-link" href={`/orders/${order.id}`}><small>{orderCode(order.id)}</small>{order.title}</Link></td><td>{order.client_name}</td><td>{shortDate(order.created_at)}</td><td><div className="crew-cell"><div className="avatar-stack">{names.slice(0, 3).map((name, index) => <Avatar key={`${name}-${index}`} username={name} image={images[index]} size="small" />)}</div><span>{order.worker_count}/{order.max_workers} · {titleCase(order.team_type)}</span></div></td><td>{money(order.reward)}</td><td><StatusPill status={order.status} /></td><td><Link className="row-arrow" href={`/orders/${order.id}`} aria-label={`Open ${order.title}`}>›</Link></td></tr>;
          })}
        </tbody></table></div>
        {!orders.length && <div className="empty-state">No orders match these filters.</div>}
      </section>
    </>
  );
}
