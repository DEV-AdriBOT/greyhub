import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, hasPermission, orderCode, VISITOR_ROLE_NAME } from "@/lib/db";
import { money, shortDate } from "@/lib/format";

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireUser();
  const employeeId = Number((await params).id);
  const employee = db
    .prepare(
      `SELECT users.*, GROUP_CONCAT(roles.name) roles FROM users LEFT JOIN user_roles ON user_roles.user_id = users.id LEFT JOIN roles ON roles.id = user_roles.role_id WHERE users.id = ? GROUP BY users.id`,
    )
    .get(employeeId) as
    | {
        id: number;
        username: string;
        profile_image: string | null;
        status: string;
        completed_orders: number;
        money_earned: number;
        dings_count: number;
        joined_at: string;
        roles: string | null;
      }
    | undefined;
  if (!employee) notFound();
  const canManage = hasPermission(viewer.id, "manage_users");
  const employeeRoles = (employee.roles || "").split(",").filter(Boolean);
  if (
    !canManage &&
    employeeRoles.every((role) => role === VISITOR_ROLE_NAME)
  )
    notFound();
  const stats = db
    .prepare(
      `SELECT SUM(CASE WHEN ow.abandoned_at IS NULL AND o.status IN ('claimed','in_progress','pending_review') THEN 1 ELSE 0 END) active, SUM(CASE WHEN ow.abandoned_at IS NOT NULL THEN 1 ELSE 0 END) abandoned FROM order_workers ow JOIN orders o ON o.id=ow.order_id WHERE ow.user_id=?`,
    )
    .get(employeeId) as { active: number | null; abandoned: number | null };
  const orders = db
    .prepare(
      `SELECT o.id,o.title,o.status,o.completion_date FROM orders o JOIN order_workers ow ON ow.order_id=o.id WHERE ow.user_id=? ORDER BY COALESCE(o.completion_date,o.created_at) DESC LIMIT 10`,
    )
    .all(employeeId) as {
    id: number;
    title: string;
    status: string;
    completion_date: string | null;
  }[];
  return (
    <>
      <div className="breadcrumb">
        <Link href="/employees">Employees</Link>
        <span>/</span>
        <span>{employee.username}</span>
      </div>
      <section className="profile-header">
        <Avatar
          username={employee.username}
          image={employee.profile_image}
          size="large"
        />
        <div>
          <p className="eyebrow">EMPLOYEE FILE</p>
          <h1>{employee.username}</h1>
          <p>
            {employee.roles || "Crew member"} · Joined{" "}
            {shortDate(employee.joined_at)}
          </p>
        </div>
        <StatusPill status={employee.status} />
        {canManage && (
          <Link className="button" href={`/admin/users/${employee.id}`}>
            Manage user
          </Link>
        )}
      </section>
      <section className="metric-strip profile-metrics">
        <div>
          <span>Completed</span>
          <strong>{employee.completed_orders}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{stats.active || 0}</strong>
        </div>
        <div>
          <span>Abandoned</span>
          <strong>{stats.abandoned || 0}</strong>
        </div>
        <div>
          <span>Earned</span>
          <strong>{money(employee.money_earned)}</strong>
        </div>
        <div>
          <span>Dings</span>
          <strong className={employee.dings_count ? "danger-text" : ""}>
            {employee.dings_count}
          </strong>
        </div>
      </section>
      <section className="board-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ORDER RECORD</p>
            <h2>Recent work</h2>
          </div>
        </div>
        <div className="order-list">
          {orders.map((order) => (
            <Link href={`/orders/${order.id}`} key={order.id}>
              <div>
                <small>{orderCode(order.id)}</small>
                <strong>{order.title}</strong>
                <span>{shortDate(order.completion_date)}</span>
              </div>
              <StatusPill status={order.status} />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
