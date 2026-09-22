import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';

function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" aria-busy="true" aria-label="Loading">
      <div className="hidden lg:block w-64 border-r border-white/[0.08] p-4 space-y-4">
        <div className="skeleton h-9 w-36 rounded-xl" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-white/[0.08] px-6 flex items-center">
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (loading) return <AppShellSkeleton />;

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-300 ease-in-out ${
          collapsed ? 'lg:ml-16' : 'lg:ml-64'
        }`}
      >
        <Navbar onOpenMenu={() => setMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
