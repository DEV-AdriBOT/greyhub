import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { SiteAd } from "@/components/site-ad";
import { listAds } from "@/lib/ads";
import { db, hasPermission, orderCode } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money, shortDate, timeAgo, titleCase } from "@/lib/format";

type OrderRow = {
  id: number;
  title: string;
  client_name: string;
  reward: number;
  status: string;
  team_type: string;
  created_at: string;
  worker_count: number;
};

export default async function DashboardPage() {
  const user = await requireUser();
  const manager =
    hasPermission(user.id, "manage_orders") ||
    hasPermission(user.id, "review_orders");
  const ads = await listAds(true);

  const available = db
    .prepare(
      `
    SELECT orders.*, COUNT(order_workers.user_id) AS worker_count
    FROM orders LEFT JOIN order_workers ON order_workers.order_id = orders.id AND order_workers.abandoned_at IS NULL
    WHERE orders.status = 'available'
    GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT 5
  `,
    )
    .all() as OrderRow[];
  const active = db
    .prepare(
      `
    SELECT orders.*, COUNT(all_workers.user_id) AS worker_count
    FROM orders
    JOIN order_workers mine ON mine.order_id = orders.id AND mine.user_id = ? AND mine.abandoned_at IS NULL
    LEFT JOIN order_workers all_workers ON all_workers.order_id = orders.id AND all_workers.abandoned_at IS NULL
    WHERE orders.status IN ('claimed', 'in_progress')
    GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT 5
  `,
    )
    .all(user.id) as OrderRow[];
  const pending = db
    .prepare(
      `
    SELECT orders.*, COUNT(order_workers.user_id) AS worker_count
    FROM orders LEFT JOIN order_workers ON order_workers.order_id = orders.id AND order_workers.abandoned_at IS NULL
    WHERE orders.status = 'pending_review' ${manager ? "" : "AND EXISTS (SELECT 1 FROM order_workers mine WHERE mine.order_id = orders.id AND mine.user_id = ? AND mine.abandoned_at IS NULL)"}
    GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT 5
  `,
    )
    .all(...(manager ? [] : [user.id])) as OrderRow[];
  const completed = db
    .prepare(
      `
    SELECT orders.*, COUNT(order_workers.user_id) AS worker_count
    FROM orders LEFT JOIN order_workers ON order_workers.order_id = orders.id AND order_workers.abandoned_at IS NULL
    WHERE orders.status = 'completed' ${manager ? "" : "AND EXISTS (SELECT 1 FROM order_workers mine WHERE mine.order_id = orders.id AND mine.user_id = ? AND mine.abandoned_at IS NULL)"}
    GROUP BY orders.id ORDER BY orders.completion_date DESC LIMIT 4
  `,
    )
    .all(...(manager ? [] : [user.id])) as OrderRow[];

  const employeeCount = (
    db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }
  ).count;
  const suspendedCount = (
    db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'suspended'")
      .get() as { count: number }
  ).count;
  const unpaidCount = (
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM orders WHERE status = 'completed' AND payment_status = 'unpaid'",
      )
      .get() as { count: number }
  ).count;
  const activity = db
    .prepare(
      `
    SELECT activity_logs.*, users.username AS actor_name
    FROM activity_logs LEFT JOIN users ON users.id = activity_logs.actor_id
    ORDER BY activity_logs.created_at DESC LIMIT 8
  `,
    )
    .all() as {
    id: number;
    action: string;
    details: string;
    order_id: number | null;
    actor_name: string | null;
    created_at: string;
  }[];

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">THURSDAY FIELD REPORT</p>
          <h1>Good shift, {user.username}.</h1>
          <p>Here is what needs moving today.</p>
        </div>
        {manager && (
          <Link className="button primary" href="/orders/new">
            Create order
          </Link>
        )}
      </div>

      {ads.length > 0 && (
        <section className="dashboard-ads" aria-label="Company notices">
          {ads.slice(0, 3).map((ad) => (
            <SiteAd ad={ad} key={ad.id} />
          ))}
        </section>
      )}

      <section className="metric-strip" aria-label="Summary">
        <div>
          <span>Available</span>
          <strong>{available.length}</strong>
        </div>
        <div>
          <span>My active</span>
          <strong>{active.length}</strong>
        </div>
        <div>
          <span>Pending review</span>
          <strong>{pending.length}</strong>
        </div>
        {manager ? (
          <div>
            <span>Unpaid orders</span>
            <strong>{unpaidCount}</strong>
          </div>
        ) : (
          <div>
            <span>Earned</span>
            <strong>{money(user.money_earned)}</strong>
          </div>
        )}
        <div>
          <span>Dings</span>
          <strong className={user.dings_count ? "danger-text" : ""}>
            {user.dings_count}
            <small>/3</small>
          </strong>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="board-section board-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OPEN BOARD</p>
              <h2>Available orders</h2>
            </div>
            <Link href="/orders">View all</Link>
          </div>
          <OrderTable
            orders={available}
            empty="No available orders right now."
          />
        </section>

        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MY WORKBENCH</p>
              <h2>Active orders</h2>
            </div>
            <Link href="/history?view=current">History</Link>
          </div>
          <OrderList orders={active} empty="You have no active orders." />
        </section>

        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">INSPECTION</p>
              <h2>{manager ? "Awaiting review" : "Pending review"}</h2>
            </div>
          </div>
          <OrderList orders={pending} empty="The review bench is clear." />
        </section>

        <section className="board-section board-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RECENTLY FILED</p>
              <h2>Completed orders</h2>
            </div>
            <Link href="/history?status=completed">Full ledger</Link>
          </div>
          <OrderTable orders={completed} empty="No completed orders yet." />
        </section>

        {manager && (
          <section className="board-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CREW DESK</p>
                <h2>People</h2>
              </div>
              <Link href="/employees">Open roster</Link>
            </div>
            <div className="mini-stats">
              <div>
                <strong>{employeeCount}</strong>
                <span>employees</span>
              </div>
              <div>
                <strong className={suspendedCount ? "danger-text" : ""}>
                  {suspendedCount}
                </strong>
                <span>suspended</span>
              </div>
            </div>
          </section>
        )}

        {manager && (
          <section className="board-section activity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">LOG BOOK</p>
                <h2>Recent activity</h2>
              </div>
            </div>
            <ol className="activity-list">
              {activity.map((item) => (
                <li key={item.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>{item.actor_name || "System"}</strong>{" "}
                    {titleCase(item.action).toLowerCase()}{" "}
                    {item.details && <em>{item.details}</em>}
                    <small>{timeAgo(item.created_at)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </>
  );
}

function OrderTable({ orders, empty }: { orders: OrderRow[]; empty: string }) {
  if (!orders.length) return <div className="empty-state">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Client</th>
            <th>Crew</th>
            <th>Reward</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <Link className="order-link" href={`/orders/${order.id}`}>
                  <small>{orderCode(order.id)}</small>
                  {order.title}
                </Link>
              </td>
              <td>{order.client_name}</td>
              <td>
                {titleCase(order.team_type)} · {order.worker_count}
              </td>
              <td>{money(order.reward)}</td>
              <td>
                <StatusPill status={order.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderList({ orders, empty }: { orders: OrderRow[]; empty: string }) {
  if (!orders.length) return <div className="empty-state">{empty}</div>;
  return (
    <div className="order-list">
      {orders.map((order) => (
        <Link href={`/orders/${order.id}`} key={order.id}>
          <div>
            <small>
              {orderCode(order.id)} · {shortDate(order.created_at)}
            </small>
            <strong>{order.title}</strong>
            <span>{order.client_name}</span>
          </div>
          <StatusPill status={order.status} />
        </Link>
      ))}
    </div>
  );
}
