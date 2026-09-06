import Link from "next/link";
import { createOrder } from "@/app/order-actions";
import { requireUser } from "@/lib/auth";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser("manage_orders");
  const query = await searchParams;
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">NEW WORK TICKET</p>
        <h1>Create an order</h1>
        <p>Set the job, reward and crew size. Payment remains manual.</p>
      </div>
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <form action={createOrder} className="form-sheet">
        <div className="form-grid">
          <label className="field-wide">
            Title
            <input name="title" required maxLength={120} />
          </label>
          <label>
            Client name
            <input name="client_name" required maxLength={120} />
          </label>
          <label>
            Reward
            <input name="reward" type="number" min="0" step="0.01" required />
          </label>
          <label>
            Order type
            <select name="team_type" defaultValue="solo">
              <option value="solo">Solo</option>
              <option value="dual">Dual</option>
              <option value="team">Team</option>
            </select>
          </label>
          <label>
            Team size override
            <input
              name="max_workers"
              type="number"
              min="3"
              max="20"
              placeholder="Team orders only"
            />
          </label>
          <label className="field-wide">
            Description
            <textarea name="description" required maxLength={3000} />
          </label>
          <label className="field-wide">
            Notes
            <textarea name="notes" maxLength={2000} />
          </label>
        </div>
        <div className="form-actions">
          <Link className="button" href="/orders">
            Cancel
          </Link>
          <button className="button primary">Create order</button>
        </div>
      </form>
    </>
  );
}
