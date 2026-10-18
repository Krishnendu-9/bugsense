import { Suspense, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { PageSkeleton } from './Loader.jsx';

function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" aria-busy="true" aria-label="Loading">
      <div className="hidden lg:block w-[244px] border-r border-border p-4 space-y-4">
        <div className="skeleton h-9 w-36 rounded-xl" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-border px-6 flex items-center">
          <div className="skeleton h-8 w-72 rounded-xl" />
        </div>
        <div className="p-6 space-y-4">
          <div className="skeleton h-28 w-full rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  // The mobile drawer belongs to the page it was opened on: navigating away
  // closes it without an extra effect-driven render.
  const [drawerPath, setDrawerPath] = useState(null);
  const mobileOpen = drawerPath === location.pathname;

  if (loading) return <AppShellSkeleton />;

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setDrawerPath(null)}
      />
      {/*
        The sidebar column. The sidebar itself is position: fixed, so it only
        ever spans the window -- which is right while scrolling, but anything
        that renders the whole page at once (a full-page screenshot, print)
        draws it once at window height and leaves the rest of the page with no
        column beside it. This in-flow element stretches with the page and
        carries the same surface and divider to the bottom of the document;
        in the browser the fixed sidebar sits exactly on top of it. It also
        reserves the column's width, replacing the old margin on the content.
      */}
      <div
        aria-hidden="true"
        data-testid="sidebar-column"
        className={`hidden lg:block flex-shrink-0 bg-surface border-r border-border transition-[width] duration-300 ease-in-out ${
          collapsed ? 'lg:w-16' : 'lg:w-[244px]'
        }`}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onOpenMenu={() => setDrawerPath(location.pathname)} />
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          {/* A crash in one page keeps the sidebar and navbar usable, and
              navigating elsewhere clears it. */}
          <ErrorBoundary variant="page" resetKey={location.pathname}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
