import { titleCase } from "@/lib/format";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status status-${status.replaceAll("_", "-")}`}>
      {titleCase(status)}
    </span>
  );
}
