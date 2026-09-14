import { SiteAd } from "@/components/site-ad";
import { listAds } from "@/lib/ads";
import { requireVisitor } from "@/lib/auth";

export default async function VisitorPage() {
  const user = await requireVisitor();
  const ads = await listAds(true);

  return (
    <>
      <div className="page-heading visitor-heading">
        <p className="eyebrow">GREY COMPANY · VISITOR DESK</p>
        <h1>Welcome, {user.username}.</h1>
        <p>Company notices and approved links are available below.</p>
      </div>
      <section className="visitor-board" aria-label="Visitor notices">
        {ads.map((ad) => (
          <SiteAd ad={ad} key={ad.id} />
        ))}
        {!ads.length && (
          <div className="empty-state">
            There are no visitor notices right now.
          </div>
        )}
      </section>
    </>
  );
}
