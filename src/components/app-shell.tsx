"use client";

import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";

type AppShellProps = {
  navigation: ReactNode;
  unreadNotices: number;
  children: ReactNode;
};

export function AppShell({ navigation, unreadNotices, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function closeAfterNavigation(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setDrawerOpen(false);
    }
  }

  return (
    <div className={`app-shell${drawerOpen ? " nav-drawer-open" : ""}`}>
      <aside
        id="main-navigation"
        className="sidebar"
        onClick={closeAfterNavigation}
      >
        {navigation}
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">▲</span>
            <strong>GreyHub</strong>
          </div>

          <span className="station-label">GREY COMPANY · OPERATIONS BOARD</span>

          <button
            type="button"
            className="drawer-tab"
            aria-expanded={drawerOpen}
            aria-controls="main-navigation"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <span>{drawerOpen ? "Close" : "Menu"}</span>
            <i aria-hidden="true" />
          </button>

          <Link href="/notifications" className="notification-link">
            Notices {unreadNotices > 0 && <b>{unreadNotices}</b>}
          </Link>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
