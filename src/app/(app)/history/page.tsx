import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, hasPermission, orderCode } from "@/lib/db";
import { money, shortDate, titleCase } from "@/lib/format";

type HistoryOrder = { id: number; title: string; client_name: string; reward: number; status: string; payment_status: string; created_at: string; completion_date: string | null; workers: string | null; abandoned_workers: string | null };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; worker?: string; from?: string; to?: string; notice?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;
  const manager = hasPermission(user.id, "manage_orders") || hasPermission(user.id, "review_orders");
  const view = ["current", "completed", "abandoned"].includes(query.view || "") ? query.view! : "current";
  const clauses: string[] = [];
  const values: (string | number)[] = [];

  if (manager) {
    if (view === "current") clauses.push("orders.status IN ('available', 'claimed', 'in_progress', 'pending_review')");
    if (view === "completed") clauses.push("orders.status IN ('completed', 'cancelled')");
    if (view === "abandoned") clauses.push("EXISTS (SELECT 1 FROM order_workers abandoned WHERE abandoned.order_id = orders.id AND abandoned.abandoned_at IS NOT NULL)");
    if (query.worker && Number(query.worker)) { clauses.push("EXISTS (SELECT 1 FROM order_workers filtered_worker WHERE filtered_worker.order_id = orders.id AND filtered_worker.user_id = ?)"); values.push(Number(query.worker)); }
  } else {
    clauses.push("EXISTS (SELECT 1 FROM order_workers mine WHERE mine.order_id = orders.id AND mine.user_id = ? AND mine.abandoned_at IS " + (view === "abandoned" ? "NOT NULL" : "NULL") + ")");
    values.push(user.id);
    if (view === "current") clauses.push("orders.status IN ('claimed', 'in_progress', 'pending_review')");
    if (view === "completed") clauses.push("orders.status = 'completed'");
  }
  if (query.status && ["available", "claimed", "in_progress", "pending_review", "completed", "cancelled"].includes(query.status)) { clauses.push("orders.status = ?"); values.push(query.status); }
  if (query.from) { clauses.push("date(orders.created_at) >= date(?)"); values.push(query.from); }
  if (query.to) { clauses.push("date(orders.created_at) <= date(?)"); values.push(query.to); }

  const orders = db.prepare(`
    SELECT orders.*,
      GROUP_CONCAT(CASE WHEN order_workers.abandoned_at IS NULL THEN users.username END) AS workers,
      GROUP_CONCAT(CASE WHEN order_workers.abandoned_at IS NOT NULL THEN users.username END) AS abandoned_workers
    FROM orders LEFT JOIN order_workers ON order_workers.order_id = orders.id LEFT JOIN users ON users.id = order_workers.user_id
    WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
    GROUP BY orders.id ORDER BY COALESCE(orders.completion_date, orders.created_at) DESC
  `).all(...values) as HistoryOrder[];
  const employees = manager ? db.prepare("SELECT id, username FROM users ORDER BY username").all() as { id: number; username: string }[] : [];

  return (
    <>
      <div className="page-heading"><p className="eyebrow">ORDER LEDGER</p><h1>History</h1><p>{manager ? "Review every order and filter the company ledger." : "Your current, completed and abandoned work."}</p></div>
      {query.notice && <div className="flash flash-success">{query.notice}</div>}
      <nav className="tab-bar"><Link className={view === "current" ? "active" : ""} href="/history?view=current">Current</Link><Link className={view === "completed" ? "active" : ""} href="/history?view=completed">Completed</Link><Link className={view === "abandoned" ? "active" : ""} href="/history?view=abandoned">Abandoned</Link></nav>
      <form className="filter-bar history-filters">
        <input type="hidden" name="view" value={view} />
        <label>Status<select name="status" defaultValue={query.status || ""}><option value="">Any status</option>{["available", "claimed", "in_progress", "pending_review", "completed", "cancelled"].map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
        {manager && <label>Worker<select name="worker" defaultValue={query.worker || ""}><option value="">Any worker</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.username}</option>)}</select></label>}
        <label>From<input name="from" type="date" defaultValue={query.from || ""} /></label><label>To<input name="to" type="date" defaultValue={query.to || ""} /></label>
        <button className="button">Filter</button>
      </form>
      <section className="orders-board"><div className="table-wrap"><table><thead><tr><th>Order</th><th>Client</th><th>{view === "abandoned" ? "Abandoned by" : "Workers"}</th><th>Date</th><th>Reward</th><th>Status</th><th>Payment</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><Link className="order-link" href={`/orders/${order.id}`}><small>{orderCode(order.id)}</small>{order.title}</Link></td><td>{order.client_name}</td><td>{view === "abandoned" ? order.abandoned_workers || "—" : order.workers || "—"}</td><td>{shortDate(order.completion_date || order.created_at)}</td><td>{money(order.reward)}</td><td><StatusPill status={order.status} /></td><td><StatusPill status={order.payment_status} /></td></tr>)}</tbody></table></div>{!orders.length && <div className="empty-state">Nothing has been filed here yet.</div>}</section>
    </>
  );
}
