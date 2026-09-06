import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  abandonOrder,
  assignWorker,
  cancelOrder,
  claimOrder,
  requestToJoin,
  reviewJoinRequest,
  reviewProof,
  startOrder,
  submitProof,
  updateOrder,
} from "@/app/order-actions";
import { markUnpaid, recordPayment } from "@/app/payment-actions";
import { Avatar } from "@/components/avatar";
import { ConfirmAction } from "@/components/confirm-action";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth";
import { db, hasPermission, orderCode } from "@/lib/db";
import { money, shortDate, titleCase } from "@/lib/format";

type Order = {
  id: number;
  title: string;
  description: string;
  client_name: string;
  reward: number;
  created_at: string;
  status: string;
  team_type: string;
  max_workers: number;
  completion_date: string | null;
  payment_status: string;
  notes: string;
  creator_name: string;
};
type Worker = {
  id: number;
  username: string;
  profile_image: string | null;
  assigned_at: string;
  abandoned_at: string | null;
};
type JoinRequest = {
  id: number;
  user_id: number;
  username: string;
  profile_image: string | null;
  requested_at: string;
  status: string;
};
type Proof = {
  id: number;
  path: string;
  original_name: string;
  uploaded_at: string;
  username: string;
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();
  const order = db
    .prepare(
      "SELECT orders.*, users.username AS creator_name FROM orders JOIN users ON users.id = orders.created_by WHERE orders.id = ?",
    )
    .get(orderId) as Order | undefined;
  if (!order) notFound();

  const workers = db
    .prepare(
      "SELECT users.id, users.username, users.profile_image, order_workers.assigned_at, order_workers.abandoned_at FROM order_workers JOIN users ON users.id = order_workers.user_id WHERE order_workers.order_id = ? ORDER BY order_workers.assigned_at",
    )
    .all(orderId) as Worker[];
  const activeWorkers = workers.filter((worker) => !worker.abandoned_at);
  const isWorker = activeWorkers.some((worker) => worker.id === user.id);
  const requests = db
    .prepare(
      "SELECT join_requests.*, users.username, users.profile_image FROM join_requests JOIN users ON users.id = join_requests.user_id WHERE join_requests.order_id = ? ORDER BY join_requests.requested_at DESC",
    )
    .all(orderId) as JoinRequest[];
  const myRequest = requests.find((request) => request.user_id === user.id);
  const proofs = db
    .prepare(
      "SELECT proof_images.*, users.username FROM proof_images JOIN users ON users.id = proof_images.user_id WHERE proof_images.order_id = ? ORDER BY proof_images.uploaded_at DESC",
    )
    .all(orderId) as Proof[];
  const payment = db
    .prepare("SELECT * FROM payments WHERE order_id = ?")
    .get(orderId) as
    | { id: number; amount: number; paid_at: string; note: string }
    | undefined;
  const paymentSplits = payment
    ? (db
        .prepare(
          "SELECT user_id, amount FROM payment_splits WHERE payment_id = ?",
        )
        .all(payment.id) as { user_id: number; amount: number }[])
    : [];
  const canManage = hasPermission(user.id, "manage_orders");
  const canReview = hasPermission(user.id, "review_orders");
  const unassignedUsers = canManage
    ? (db
        .prepare(
          `SELECT id, username FROM users WHERE status = 'active' AND id NOT IN (SELECT user_id FROM order_workers WHERE order_id = ? AND abandoned_at IS NULL) ORDER BY username`,
        )
        .all(orderId) as { id: number; username: string }[])
    : [];

  return (
    <>
      <div className="breadcrumb">
        <Link href="/orders">Orders</Link>
        <span>/</span>
        <span>{orderCode(order.id)}</span>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <div className="order-titlebar">
        <div>
          <p className="eyebrow">
            {orderCode(order.id)} · {titleCase(order.team_type)} order
          </p>
          <h1>{order.title}</h1>
          <p>{order.client_name}</p>
        </div>
        <div className="titlebar-status">
          <StatusPill status={order.status} />
          <strong>{money(order.reward)}</strong>
        </div>
      </div>

      <div className="order-detail-grid">
        <div className="order-primary">
          <section className="detail-section">
            <p className="eyebrow">WORK DESCRIPTION</p>
            <p className="order-description">{order.description}</p>
            {order.notes && (
              <div className="order-note">
                <strong>Field notes</strong>
                <p>{order.notes}</p>
              </div>
            )}
          </section>

          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CREW</p>
                <h2>
                  {activeWorkers.length}/{order.max_workers} assigned
                </h2>
              </div>
            </div>
            <div className="crew-roster">
              {activeWorkers.map((worker) => (
                <div key={worker.id}>
                  <Avatar
                    username={worker.username}
                    image={worker.profile_image}
                  />
                  <div>
                    <strong>{worker.username}</strong>
                    <small>Joined {shortDate(worker.assigned_at)}</small>
                  </div>
                </div>
              ))}
              {!activeWorkers.length && (
                <div className="empty-state">
                  No one has claimed this order.
                </div>
              )}
            </div>
            {(isWorker || canManage) &&
              requests.some((request) => request.status === "pending") && (
                <div className="join-requests">
                  <h3>Join requests</h3>
                  {requests
                    .filter((request) => request.status === "pending")
                    .map((request) => (
                      <div key={request.id}>
                        <Avatar
                          username={request.username}
                          image={request.profile_image}
                          size="small"
                        />
                        <span>
                          <strong>{request.username}</strong>
                          <small>{shortDate(request.requested_at)}</small>
                        </span>
                        <form
                          action={reviewJoinRequest.bind(
                            null,
                            request.id,
                            "approved",
                          )}
                        >
                          <button className="button">Approve</button>
                        </form>
                        <form
                          action={reviewJoinRequest.bind(
                            null,
                            request.id,
                            "rejected",
                          )}
                        >
                          <button className="text-button">Reject</button>
                        </form>
                      </div>
                    ))}
                </div>
              )}
          </section>

          {proofs.length > 0 && (
            <section className="detail-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PROOF DESK</p>
                  <h2>Submitted images</h2>
                </div>
              </div>
              <div className="proof-grid">
                {proofs.map((proof) => (
                  <a
                    href={proof.path}
                    target="_blank"
                    rel="noreferrer"
                    key={proof.id}
                  >
                    <Image
                      src={proof.path}
                      alt={`Proof submitted by ${proof.username}`}
                      width={640}
                      height={480}
                      unoptimized
                    />
                    <span>
                      {proof.username} · {shortDate(proof.uploaded_at)}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {order.status === "pending_review" && canReview && (
            <section className="detail-section review-box">
              <p className="eyebrow">MANAGER REVIEW</p>
              <h2>Accept the work or send it back</h2>
              <div className="review-actions">
                <form action={reviewProof.bind(null, order.id, "accepted")}>
                  <button className="button primary">
                    Accept and complete
                  </button>
                </form>
                <form
                  action={reviewProof.bind(null, order.id, "rejected")}
                  className="reject-form"
                >
                  <input
                    name="review_note"
                    placeholder="Reason or correction needed"
                    required
                  />
                  <button className="button danger">Reject proof</button>
                </form>
              </div>
            </section>
          )}

          {order.status === "completed" && canManage && (
            <section className="detail-section payment-box">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">PAYMENT LEDGER</p>
                  <h2>
                    {payment
                      ? "Edit recorded payment"
                      : "Record manual payment"}
                  </h2>
                </div>
                <StatusPill status={order.payment_status} />
              </div>
              <form
                action={recordPayment.bind(null, order.id)}
                className="payment-form"
              >
                <div className="form-grid">
                  <label>
                    Total amount
                    <input
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={payment?.amount ?? order.reward}
                      required
                    />
                  </label>
                  <label>
                    Payment date
                    <input
                      name="paid_at"
                      type="date"
                      defaultValue={
                        payment?.paid_at?.slice(0, 10) ??
                        new Date().toISOString().slice(0, 10)
                      }
                      required
                    />
                  </label>
                </div>
                <fieldset className="split-fields">
                  <legend>Worker split</legend>
                  {activeWorkers.map((worker, index) => {
                    const saved = paymentSplits.find(
                      (split) => split.user_id === worker.id,
                    )?.amount;
                    const cents = Math.round(order.reward * 100);
                    const base = Math.floor(
                      cents / Math.max(activeWorkers.length, 1),
                    );
                    const suggested =
                      (index === activeWorkers.length - 1
                        ? cents - base * index
                        : base) / 100;
                    return (
                      <label key={worker.id}>
                        <span>{worker.username}</span>
                        <input
                          name={`split_${worker.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={saved ?? suggested}
                          required
                        />
                      </label>
                    );
                  })}
                </fieldset>
                <label>
                  Payment note
                  <textarea
                    name="payment_note"
                    defaultValue={payment?.note || ""}
                  />
                </label>
                <div className="inline-actions">
                  <button className="button primary">
                    {payment ? "Update payment" : "Mark paid"}
                  </button>
                </div>
              </form>
              {payment && (
                <ConfirmAction
                  action={markUnpaid.bind(null, order.id)}
                  label="Mark unpaid"
                  message="Mark this order unpaid? Recorded earnings from this payment will be removed."
                  danger
                />
              )}
            </section>
          )}

          {canManage && (
            <details className="detail-section manager-edit">
              <summary>Edit order</summary>
              <form
                action={updateOrder.bind(null, order.id)}
                className="form-grid compact-form"
              >
                <label className="field-wide">
                  Title
                  <input name="title" defaultValue={order.title} required />
                </label>
                <label>
                  Client
                  <input
                    name="client_name"
                    defaultValue={order.client_name}
                    required
                  />
                </label>
                <label>
                  Reward
                  <input
                    name="reward"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={order.reward}
                    required
                  />
                </label>
                <label className="field-wide">
                  Description
                  <textarea
                    name="description"
                    defaultValue={order.description}
                    required
                  />
                </label>
                <label className="field-wide">
                  Notes
                  <textarea name="notes" defaultValue={order.notes} />
                </label>
                <div className="field-wide">
                  <button className="button">Save changes</button>
                </div>
              </form>
            </details>
          )}
        </div>

        <aside className="order-sidebar">
          <section className="ticket-panel">
            <p className="eyebrow">ORDER TICKET</p>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={order.status} />
                </dd>
              </div>
              <div>
                <dt>Payment</dt>
                <dd>
                  <StatusPill status={order.payment_status} />
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{shortDate(order.created_at)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{shortDate(order.completion_date)}</dd>
              </div>
              <div>
                <dt>Posted by</dt>
                <dd>{order.creator_name}</dd>
              </div>
              <div>
                <dt>Crew limit</dt>
                <dd>{order.max_workers}</dd>
              </div>
            </dl>
          </section>
          <section className="action-panel">
            <p className="eyebrow">ACTIONS</p>
            {order.status === "available" && !isWorker && (
              <form action={claimOrder.bind(null, order.id)}>
                <button className="button primary full-button">
                  Claim this order
                </button>
              </form>
            )}
            {["claimed", "in_progress"].includes(order.status) &&
              !isWorker &&
              activeWorkers.length < order.max_workers &&
              myRequest?.status !== "pending" && (
                <form action={requestToJoin.bind(null, order.id)}>
                  <button className="button primary full-button">
                    Ask to join crew
                  </button>
                </form>
              )}
            {myRequest?.status === "pending" && (
              <p className="action-note">
                Your join request is waiting for the crew.
              </p>
            )}
            {isWorker && order.status === "claimed" && (
              <form action={startOrder.bind(null, order.id)}>
                <button className="button full-button">Start work</button>
              </form>
            )}
            {isWorker && ["claimed", "in_progress"].includes(order.status) && (
              <form
                action={submitProof.bind(null, order.id)}
                className="proof-form"
              >
                <label>
                  Image proof
                  <input
                    type="file"
                    name="proofs"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    multiple
                    required
                  />
                </label>
                <button className="button primary full-button">
                  Submit for review
                </button>
              </form>
            )}
            {isWorker && ["claimed", "in_progress"].includes(order.status) && (
              <ConfirmAction
                action={abandonOrder.bind(null, order.id)}
                label="Abandon order"
                message="Abandoning this order adds 1 ding to your account. Continue?"
                danger
              />
            )}
            {canManage &&
              activeWorkers.length < order.max_workers &&
              !["completed", "cancelled"].includes(order.status) &&
              unassignedUsers.length > 0 && (
                <form
                  action={assignWorker.bind(null, order.id)}
                  className="assign-form"
                >
                  <label>
                    Assign worker
                    <select name="worker_id">
                      {unassignedUsers.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.username}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button full-button">Assign</button>
                </form>
              )}
            {canManage &&
              !["completed", "cancelled"].includes(order.status) && (
                <ConfirmAction
                  action={cancelOrder.bind(null, order.id)}
                  label="Cancel order"
                  message="Cancel this order? Assigned workers will be notified."
                  danger
                />
              )}
            {!isWorker && !canManage && order.status === "completed" && (
              <p className="action-note">
                This order has been completed and filed.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
