import Link from "next/link";
import { createRole, deleteRole, updateRole } from "@/app/admin-actions";
import { ConfirmAction } from "@/components/confirm-action";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { titleCase } from "@/lib/format";

const permissions = ["admin", "manage_orders", "review_orders", "manage_users"];

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireUser("manage_users");
  const query = await searchParams;
  const roles = db
    .prepare(
      `SELECT roles.*, COUNT(user_roles.user_id) user_count FROM roles LEFT JOIN user_roles ON user_roles.role_id=roles.id GROUP BY roles.id ORDER BY roles.name`,
    )
    .all() as {
    id: number;
    name: string;
    permissions: string;
    user_count: number;
  }[];
  return (
    <>
      <div className="breadcrumb">
        <Link href="/admin">Admin</Link>
        <span>/</span>
        <span>Roles</span>
      </div>
      <div className="page-heading">
        <p className="eyebrow">PERMISSION TAGS</p>
        <h1>Roles</h1>
        <p>Keep roles simple: a name and the jobs it can perform.</p>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <div className="roles-grid">
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW ROLE</p>
              <h2>Create role</h2>
            </div>
          </div>
          <form action={createRole} className="stack-form">
            <label>
              Role name
              <input name="name" maxLength={60} required />
            </label>
            <PermissionBoxes />
            <button className="button primary">Create role</button>
          </form>
        </section>
        <div className="role-list">
          {roles.map((role) => {
            const selected = JSON.parse(role.permissions) as string[];
            return (
              <details className="role-row" key={role.id}>
                <summary>
                  <div>
                    <strong>{role.name}</strong>
                    <small>
                      {role.user_count} assigned ·{" "}
                      {selected.length
                        ? selected.map(titleCase).join(", ")
                        : "No management permissions"}
                    </small>
                  </div>
                  <span>Edit</span>
                </summary>
                <form
                  action={updateRole.bind(null, role.id)}
                  className="stack-form"
                >
                  <label>
                    Role name
                    <input name="name" defaultValue={role.name} required />
                  </label>
                  <PermissionBoxes selected={selected} />
                  <div className="inline-actions">
                    <button className="button">Save role</button>
                  </div>
                </form>
                {role.name !== "Admin" && (
                  <ConfirmAction
                    action={deleteRole.bind(null, role.id)}
                    label="Delete role"
                    message={`Delete ${role.name}? It must not be assigned to anyone.`}
                    danger
                  />
                )}
              </details>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PermissionBoxes({ selected = [] }: { selected?: string[] }) {
  return (
    <fieldset className="permission-boxes">
      <legend>Permissions</legend>
      {permissions.map((permission) => (
        <label key={permission}>
          <input
            type="checkbox"
            name={permission}
            defaultChecked={selected.includes(permission)}
          />
          <span>
            <strong>{titleCase(permission)}</strong>
            <small>{permissionDescription(permission)}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
function permissionDescription(permission: string) {
  return (
    {
      admin: "All management permissions.",
      manage_orders: "Create, edit, assign, cancel and pay orders.",
      review_orders: "Review proof and complete orders.",
      manage_users: "Create users, roles, dings and suspensions.",
    } as Record<string, string>
  )[permission];
}
