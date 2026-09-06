import Image from "next/image";
import Link from "next/link";
import type { Ad } from "@/lib/ads";

export function SiteAd({ ad }: { ad: Ad }) {
  const content = (
    <article className={`site-ad${ad.image_path ? " has-image" : " text-only"}`}>
      {ad.image_path && (
        <Image
          src={ad.image_path}
          alt=""
          width={1400}
          height={360}
          unoptimized
        />
      )}
      <div className="site-ad-copy">
        <small>COMPANY BULLETIN</small>
        <strong>{ad.title}</strong>
        {ad.body && <p>{ad.body}</p>}
        {ad.link_url && <span>Open notice →</span>}
      </div>
    </article>
  );

  if (!ad.link_url) return content;
  const external = /^https?:\/\//.test(ad.link_url);
  return (
    <Link
      href={ad.link_url}
      className="site-ad-link"
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {content}
    </Link>
  );
}
