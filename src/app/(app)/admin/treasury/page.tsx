import Link from "next/link";
import {
  createTreasuryWebhook,
  saveTreasuryKey,
  saveTreasurySettings,
} from "@/app/treasury-actions";
import { requireUser } from "@/lib/auth";
import {
  getTreasuryAccounts,
  getTreasuryStatus,
  type TreasuryAccount,
} from "@/lib/treasury";

function defaultOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export default async function TreasuryAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireUser("admin");
  const query = await searchParams;
  const status = await getTreasuryStatus();
  let accounts: TreasuryAccount[] = [];
  let accountError = "";
  if (status.keyType === "BUSINESS") {
    try {
      accounts = await getTreasuryAccounts();
    } catch (error) {
      accountError =
        error instanceof Error ? error.message : "Could not load accounts";
    }
  }

  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">PAYMENT CONNECTION</p>
          <h1>Treasury API</h1>
          <p>Send order payouts from a personal or business account.</p>
        </div>
        <Link className="button" href="/admin">
          Back to admin
        </Link>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}

      <div className="treasury-grid">
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">API KEY</p>
              <h2>{status.configured ? "Replace connection" : "Connect Treasury"}</h2>
            </div>
          </div>
          <p className="form-help">
            The key is checked with Treasury, encrypted before storage, and is
            never displayed again. Both personal and business keys are detected
            automatically.
          </p>
          <form action={saveTreasuryKey} className="stack-form">
            <label>
              Treasury API key
              <input
                name="api_key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </label>
            <label className="check-row">
              <input
                name="automatic_enabled"
                type="checkbox"
                defaultChecked
              />
              Enable automatic order payouts
            </label>
            <button className="button primary">Validate and save</button>
          </form>
        </section>

        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONNECTION STATUS</p>
              <h2>{status.configured ? "Connected" : "Not connected"}</h2>
            </div>
          </div>
          {status.configured ? (
            <dl className="connection-facts">
              <div>
                <dt>Key type</dt>
                <dd>{status.keyType}</dd>
              </div>
              <div>
                <dt>Key ID</dt>
                <dd>#{status.keyId}</dd>
              </div>
              <div>
                <dt>Source account</dt>
                <dd>{status.sourceAccountId ?? "Personal account"}</dd>
              </div>
              <div>
                <dt>Automatic payouts</dt>
                <dd>{status.automaticEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
              <div>
                <dt>Webhook</dt>
                <dd>{status.webhookId ? `#${status.webhookId}` : "Not registered"}</dd>
              </div>
              <div>
                <dt>Last callback</dt>
                <dd>
                  {status.lastWebhookAt
                    ? new Date(status.lastWebhookAt).toLocaleString()
                    : "None yet"}
                </dd>
              </div>
            </dl>
          ) : (
            <div className="empty-state">Add a key to enable payouts.</div>
          )}
        </section>

        {status.configured && (
          <section className="board-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PAYOUT SETTINGS</p>
                <h2>Payment source</h2>
              </div>
            </div>
            {accountError && <div className="flash flash-error">{accountError}</div>}
            <form action={saveTreasurySettings} className="stack-form">
              {status.keyType === "BUSINESS" && (
                <label>
                  Business account
                  <select
                    name="source_account_id"
                    defaultValue={String(status.sourceAccountId || "")}
                    required
                  >
                    {accounts
                      .filter((account) => !account.archived)
                      .map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.displayName} — {account.balance}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {status.keyType === "PERSONAL" && (
                <p className="form-help">
                  Personal keys always pay from the key owner&apos;s personal
                  account.
                </p>
              )}
              <label className="check-row">
                <input
                  name="automatic_enabled"
                  type="checkbox"
                  defaultChecked={status.automaticEnabled}
                />
                Enable automatic order payouts
              </label>
              <button className="button primary">Save settings</button>
            </form>
          </section>
        )}

        {status.configured && (
          <section className="board-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CALLBACK</p>
                <h2>Treasury webhook</h2>
              </div>
            </div>
            <p className="form-help">
              Register GreyHub with Treasury so payment events can be received.
              The callback address contains a private verification token.
            </p>
            {status.webhookId ? (
              <div className="flash flash-success">
                Webhook #{status.webhookId} is registered.
              </div>
            ) : (
              <form action={createTreasuryWebhook} className="stack-form">
                <label>
                  Public GreyHub URL
                  <input
                    name="origin"
                    type="url"
                    defaultValue={defaultOrigin()}
                    required
                  />
                </label>
                <button className="button">Register webhook</button>
              </form>
            )}
          </section>
        )}
      </div>
    </>
  );
}
