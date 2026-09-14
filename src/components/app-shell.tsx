"use client";

import Link from "next/link";
import {
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

type AppShellProps = {
  navigation: ReactNode;
  unreadNotices: number;
  visitorMode?: boolean;
  children: ReactNode;
};

export function AppShell({
  navigation,
  unreadNotices,
  visitorMode = false,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function closeAfterNavigation(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setDrawerOpen(false);
    }
  }

  function blockVisitorAction(event: MouseEvent<HTMLElement>) {
    if (!visitorMode) return;
    const control = (event.target as HTMLElement).closest(
      "button, input, select, textarea, [draggable='true']",
    );
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function blockVisitorSubmit(event: FormEvent<HTMLElement>) {
    if (!visitorMode) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function blockVisitorKey(event: KeyboardEvent<HTMLElement>) {
    if (!visitorMode) return;
    const control = (event.target as HTMLElement).closest(
      "button, input, select, textarea, [draggable='true']",
    );
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function blockVisitorDrag(event: DragEvent<HTMLElement>) {
    if (!visitorMode) return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className={`app-shell${drawerOpen ? " nav-drawer-open" : ""}${visitorMode ? " visitor-mode" : ""}`}
    >
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

          <span className="station-label">
            GREY COMPANY · {visitorMode ? "VISITOR VIEW" : "OPERATIONS BOARD"}
          </span>

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

        <main
          className="content"
          onClickCapture={blockVisitorAction}
          onSubmitCapture={blockVisitorSubmit}
          onKeyDownCapture={blockVisitorKey}
          onDragStartCapture={blockVisitorDrag}
        >
          {visitorMode && (
            <div className="visitor-readonly" role="status">
              Visitor access · Read-only view
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
