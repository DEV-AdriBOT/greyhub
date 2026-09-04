"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const mainLinks = [
  ["/dashboard", "Overview"],
  ["/orders", "Orders"],
  ["/history", "Order history"],
  ["/profile", "My profile"],
  ["/employees", "Employees"],
];

export function Sidebar({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      <p className="nav-label">WORK OFFICE</p>
      {mainLinks.map(([href, label]) => (
        <Link key={href} href={href} className={pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)) ? "active" : ""}>
          <span className="nav-tick">—</span>{label}
        </Link>
      ))}
      {showAdmin && (
        <>
          <p className="nav-label nav-label-secondary">MANAGEMENT</p>
          <Link href="/admin" className={pathname.startsWith("/admin") ? "active" : ""}>
            <span className="nav-tick">—</span>Admin desk
          </Link>
        </>
      )}
    </nav>
  );
}
