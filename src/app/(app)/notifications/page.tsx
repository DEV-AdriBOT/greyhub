import Link from "next/link";
import { markNotificationsRead } from "@/app/profile-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeAgo, titleCase } from "@/lib/format";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notices = db
    .prepare(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    )
    .all(user.id) as {
    id: number;
    type: string;
    message: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }[];
  return (
    <>
      <div className="page-heading heading-with-action">
        <div>
          <p className="eyebrow">NOTICE BOARD</p>
          <h1>Notifications</h1>
          <p>Join requests, reviews, dings and assignments.</p>
        </div>
        {notices.some((notice) => !notice.read_at) && (
          <form action={markNotificationsRead}>
            <button className="button">Mark all read</button>
          </form>
        )}
      </div>
      <section className="notification-list">
        {notices.map((notice) => {
          const content = (
            <>
              <span className="notice-mark">{notice.read_at ? "·" : "!"}</span>
              <div>
                <small>{titleCase(notice.type)}</small>
                <strong>{notice.message}</strong>
                <span>{timeAgo(notice.created_at)}</span>
              </div>
            </>
          );
          return notice.link ? (
            <Link
              className={notice.read_at ? "" : "unread"}
              href={notice.link}
              key={notice.id}
            >
              {content}
            </Link>
          ) : (
            <div className={notice.read_at ? "" : "unread"} key={notice.id}>
              {content}
            </div>
          );
        })}
        {!notices.length && <div className="empty-state">No notices yet.</div>}
      </section>
    </>
  );
}
