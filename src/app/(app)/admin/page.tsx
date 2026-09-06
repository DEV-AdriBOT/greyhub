import Link from "next/link";
import { createUser } from "@/app/admin-actions";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, orderCode } from "@/lib/db";
import { money, timeAgo, titleCase } from "@/lib/format";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireUser("manage_users");
  const query = await searchParams;
  const users = db
    .prepare(
      `SELECT users.*, GROUP_CONCAT(roles.name) roles FROM users LEFT JOIN user_roles ON user_roles.user_id=users.id LEFT JOIN roles ON roles.id=user_roles.role_id GROUP BY users.id ORDER BY users.status DESC, users.username`,
    )
    .all() as {
    id: number;
    username: string;
    profile_image: string | null;
    status: string;
    roles: string | null;
    completed_orders: number;
    money_earned: number;
    dings_count: number;
  }[];
  const roles = db
    .prepare("SELECT id, name FROM roles ORDER BY name")
    .all() as { id: number; name: string }[];
  const unpaid = db
    .prepare(
      "SELECT id,title,reward FROM orders WHERE status='completed' AND payment_status='unpaid' ORDER BY completion_date DESC LIMIT 8",
    )
    .all() as { id: number; title: string; reward: number }[];
  const activity = db
    .prepare(
      `SELECT activity_logs.*, users.username actor_name FROM activity_logs LEFT JOIN users ON users.id=activity_logs.actor_id ORDER BY activity_logs.created_at DESC LIMIT 15`,
    )
    .all() as {
    id: number;
    actor_name: string | null;
    action: string;
    details: string;
    created_at: string;
  }[];
  const suspended = users.filter((user) => user.status === "suspended").length;
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">MANAGEMENT DESK</p>
          <h1>Admin</h1>
          <p>Users, permissions, reviews and the payment ledger.</p>
        </div>
        <div className="heading-actions">
          <Link className="button" href="/admin/ads">
            Banners &amp; notices
          </Link>
          <Link className="button" href="/admin/roles">
            Manage roles
          </Link>
        </div>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <section className="metric-strip admin-metrics">
        <div>
          <span>Employees</span>
          <strong>{users.length}</strong>
        </div>
        <div>
          <span>Suspended</span>
          <strong className={suspended ? "danger-text" : ""}>
            {suspended}
          </strong>
        </div>
        <div>
          <span>Unpaid orders</span>
          <strong>{unpaid.length}</strong>
        </div>
        <div>
          <span>Custom roles</span>
          <strong>{roles.length}</strong>
        </div>
      </section>
      <div className="admin-grid">
        <section className="board-section board-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CREW ACCOUNTS</p>
              <h2>Users</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Roles</th>
                  <th>Completed</th>
                  <th>Earned</th>
                  <th>Dings</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <Avatar
                          username={user.username}
                          image={user.profile_image}
                          size="small"
                        />
                        <strong>{user.username}</strong>
                      </div>
                    </td>
                    <td>{user.roles || "—"}</td>
                    <td>{user.completed_orders}</td>
                    <td>{money(user.money_earned)}</td>
                    <td className={user.dings_count ? "danger-text" : ""}>
                      {user.dings_count}/3
                    </td>
                    <td>
                      <StatusPill status={user.status} />
                    </td>
                    <td>
                      <Link
                        className="row-arrow"
                        href={`/admin/users/${user.id}`}
                      >
                        ›
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW ACCOUNT</p>
              <h2>Add employee</h2>
            </div>
          </div>
          <form action={createUser} className="stack-form">
            <label>
              Username
              <input name="username" minLength={3} maxLength={32} required />
            </label>
            <label>
              Temporary password
              <input name="password" type="password" minLength={8} required />
            </label>
            <label>
              Starting role
              <select name="role_id">
                <option value="">No role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary">Create user</button>
          </form>
        </section>
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PAYMENT TRAY</p>
              <h2>Unpaid completed work</h2>
            </div>
          </div>
          <div className="order-list">
            {unpaid.map((order) => (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div>
                  <small>{orderCode(order.id)}</small>
                  <strong>{order.title}</strong>
                  <span>{money(order.reward)}</span>
                </div>
                <StatusPill status="unpaid" />
              </Link>
            ))}
            {!unpaid.length && (
              <div className="empty-state">Nothing waiting for payment.</div>
            )}
          </div>
        </section>
        <section className="board-section board-wide">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACTIVITY LOG</p>
              <h2>Recent actions</h2>
            </div>
          </div>
          <div className="activity-table">
            {activity.map((item) => (
              <div key={item.id}>
                <span>{timeAgo(item.created_at)}</span>
                <strong>{item.actor_name || "System"}</strong>
                <p>
                  {titleCase(item.action)}
                  {item.details ? ` — ${item.details}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
