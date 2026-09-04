import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/format";

type Employee = { id: number; username: string; profile_image: string | null; status: string; completed_orders: number; money_earned: number; dings_count: number; joined_at: string; roles: string | null; active_orders: number };

export default async function EmployeesPage() {
  await requireUser();
  const employees = db.prepare(`
    SELECT users.*,
      GROUP_CONCAT(DISTINCT roles.name) AS roles,
      COUNT(DISTINCT CASE WHEN order_workers.abandoned_at IS NULL AND orders.status IN ('claimed','in_progress','pending_review') THEN orders.id END) AS active_orders
    FROM users LEFT JOIN user_roles ON user_roles.user_id = users.id LEFT JOIN roles ON roles.id = user_roles.role_id
    LEFT JOIN order_workers ON order_workers.user_id = users.id LEFT JOIN orders ON orders.id = order_workers.order_id
    GROUP BY users.id ORDER BY users.status DESC, users.username
  `).all() as Employee[];
  return <><div className="page-heading"><p className="eyebrow">CREW ROSTER</p><h1>Employees</h1><p>Profiles and simple work statistics for the whole crew.</p></div><section className="employee-list">{employees.map((employee) => <Link href={`/employees/${employee.id}`} key={employee.id}><Avatar username={employee.username} image={employee.profile_image} /><div className="employee-main"><strong>{employee.username}</strong><small>{employee.roles || "Crew member"} · Joined {shortDate(employee.joined_at)}</small></div><div className="employee-stat"><strong>{employee.active_orders}</strong><span>active</span></div><div className="employee-stat"><strong>{employee.completed_orders}</strong><span>done</span></div><div className="employee-stat"><strong>{money(employee.money_earned)}</strong><span>earned</span></div><div className="employee-stat"><strong className={employee.dings_count ? "danger-text" : ""}>{employee.dings_count}</strong><span>dings</span></div><StatusPill status={employee.status} /><span className="row-arrow">›</span></Link>)}</section></>;
}
