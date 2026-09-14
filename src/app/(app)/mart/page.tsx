import { MartExperience } from "@/components/mart-experience";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type MartWorker = {
  id: number;
  username: string;
};

export default async function MartPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const query = await searchParams;

  const workers = db
    .prepare(
      `SELECT DISTINCT users.id, users.username FROM users
       JOIN user_roles ON user_roles.user_id = users.id
       JOIN roles ON roles.id = user_roles.role_id
       WHERE users.status = 'active' AND lower(roles.name) != 'visitor'
       ORDER BY users.username LIMIT 12`,
    )
    .all() as MartWorker[];

  return (
    <>
      {query.error && <div className="flash flash-error">{query.error}</div>}
      <MartExperience workers={workers} />
    </>
  );
}
