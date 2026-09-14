import { MartExperience } from "@/components/mart-experience";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type MartWorker = {
  id: number;
  username: string;
};

export default async function MartPage() {
  await requireUser();

  const workers = db
    .prepare(
      "SELECT id, username FROM users WHERE status = 'active' ORDER BY username LIMIT 12",
    )
    .all() as MartWorker[];

  return <MartExperience workers={workers} />;
}
