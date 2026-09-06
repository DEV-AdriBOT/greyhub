import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addDing,
  removeDing,
  setUserPassword,
  updateUser,
} from "@/app/admin-actions";
import { Avatar } from "@/components/avatar";
import { ConfirmAction } from "@/components/confirm-action";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/format";

export default async function ManageUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireUser("manage_users");
  const userId = Number((await params).id);
  const query = await searchParams;
  const employee = db.prepare("SELECT * FROM users WHERE id=?").get(userId) as
    | {
        id: number;
        username: string;
        profile_image: string | null;
        status: string;
        completed_orders: number;
        money_earned: number;
        dings_count: number;
        joined_at: string;
      }
    | undefined;
  if (!employee) notFound();
  const roles = db
    .prepare(
      "SELECT roles.*, CASE WHEN user_roles.user_id IS NULL THEN 0 ELSE 1 END assigned FROM roles LEFT JOIN user_roles ON user_roles.role_id=roles.id AND user_roles.user_id=? ORDER BY roles.name",
    )
    .all(userId) as { id: number; name: string; assigned: number }[];
  const dings = db
    .prepare(
      "SELECT dings.*, users.username added_by_name FROM dings LEFT JOIN users ON users.id=dings.added_by WHERE dings.user_id=? AND dings.removed_at IS NULL ORDER BY dings.created_at DESC",
    )
    .all(userId) as {
    id: number;
    reason: string;
    created_at: string;
    added_by_name: string | null;
  }[];
  return (
    <>
      <div className="breadcrumb">
        <Link href="/admin">Admin</Link>
        <span>/</span>
        <span>{employee.username}</span>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <section className="profile-header">
        <Avatar
          username={employee.username}
          image={employee.profile_image}
          size="large"
        />
        <div>
          <p className="eyebrow">ACCOUNT FILE</p>
          <h1>{employee.username}</h1>
          <p>
            Joined {shortDate(employee.joined_at)} ·{" "}
            {money(employee.money_earned)} earned
          </p>
        </div>
        <StatusPill status={employee.status} />
      </section>
      <div className="admin-user-grid">
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACCOUNT</p>
              <h2>Profile and access</h2>
            </div>
          </div>
          <form action={updateUser.bind(null, userId)} className="stack-form">
            <label>
              Username
              <input
                name="username"
                defaultValue={employee.username}
                required
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={employee.status}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <fieldset className="role-checkboxes">
              <legend>Roles</legend>
              {roles.map((role) => (
                <label key={role.id}>
                  <input
                    type="checkbox"
                    name="role_ids"
                    value={role.id}
                    defaultChecked={Boolean(role.assigned)}
                  />
                  <span>{role.name}</span>
                </label>
              ))}
            </fieldset>
            <button className="button primary">Save user</button>
          </form>
          <form
            action={setUserPassword.bind(null, userId)}
            className="password-reset"
          >
            <label>
              New password
              <input name="password" type="password" minLength={8} required />
            </label>
            <button className="button">Reset password</button>
          </form>
        </section>
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PERFORMANCE</p>
              <h2>Dings ({employee.dings_count}/3)</h2>
            </div>
          </div>
          <form action={addDing.bind(null, userId)} className="add-ding">
            <input
              name="reason"
              placeholder="Reason for ding"
              maxLength={300}
              required
            />
            <button className="button danger">Add ding</button>
          </form>
          <div className="managed-dings">
            {dings.map((ding) => (
              <div key={ding.id}>
                <span>!</span>
                <div>
                  <strong>{ding.reason}</strong>
                  <small>
                    {shortDate(ding.created_at)} ·{" "}
                    {ding.added_by_name || "System"}
                  </small>
                </div>
                <ConfirmAction
                  action={removeDing.bind(null, userId, ding.id)}
                  label="Remove"
                  message="Remove this ding from the account?"
                />
              </div>
            ))}
            {!dings.length && (
              <div className="empty-state">No active dings.</div>
            )}
          </div>
          <p className="help-text">
            Three dings suspend an account automatically. You can restore access
            manually using the status field.
          </p>
        </section>
      </div>
    </>
  );
}
