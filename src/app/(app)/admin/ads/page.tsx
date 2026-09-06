import Link from "next/link";
import { createAd, deleteAd, toggleAd } from "@/app/ad-actions";
import { ConfirmAction } from "@/components/confirm-action";
import { SiteAd } from "@/components/site-ad";
import { StatusPill } from "@/components/status-pill";
import { listAds } from "@/lib/ads";
import { requireUser } from "@/lib/auth";
import { shortDate } from "@/lib/format";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  await requireUser("manage_users");
  const query = await searchParams;
  const ads = await listAds();

  return (
    <>
      <div className="breadcrumb">
        <Link href="/admin">Admin</Link>
        <span>/</span>
        <span>Banners &amp; notices</span>
      </div>
      <div className="page-heading">
        <p className="eyebrow">COMPANY BULLETINS</p>
        <h1>Banners &amp; notices</h1>
        <p>Publish a text notice, an image banner, or both to the dashboard.</p>
      </div>
      {query.notice && (
        <div className="flash flash-success">{query.notice}</div>
      )}
      {query.error && <div className="flash flash-error">{query.error}</div>}

      <div className="ad-admin-grid">
        <section className="board-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW BULLETIN</p>
              <h2>Create banner</h2>
            </div>
          </div>
          <form action={createAd} className="stack-form">
            <label>
              Title
              <input name="title" maxLength={100} required />
            </label>
            <label>
              Text
              <textarea
                name="body"
                maxLength={500}
                placeholder="Optional when an image is included"
              />
            </label>
            <label>
              Banner image
              <input
                name="banner_image"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
              />
            </label>
            <label>
              Link
              <input
                name="link_url"
                maxLength={500}
                placeholder="/orders or https://example.com"
              />
            </label>
            <p className="help-text">
              Images may be JPG, PNG, WebP or GIF up to 4 MB.
            </p>
            <button className="button primary">Publish banner</button>
          </form>
        </section>

        <section className="ad-admin-list">
          {ads.map((ad) => (
            <article className="ad-admin-item" key={ad.id}>
              <SiteAd ad={ad} />
              <footer>
                <div>
                  <StatusPill status={ad.is_active ? "active" : "inactive"} />
                  <small>Published {shortDate(ad.created_at)}</small>
                </div>
                <div className="inline-actions">
                  <form action={toggleAd.bind(null, ad.id)}>
                    <button className="button">
                      {ad.is_active ? "Hide" : "Show"}
                    </button>
                  </form>
                  <ConfirmAction
                    action={deleteAd.bind(null, ad.id)}
                    label="Delete"
                    message={`Delete “${ad.title}”?`}
                    danger
                  />
                </div>
              </footer>
            </article>
          ))}
          {!ads.length && (
            <div className="empty-state">No banners have been created yet.</div>
          )}
        </section>
      </div>
    </>
  );
}
