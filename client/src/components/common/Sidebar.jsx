import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Bug, Cpu, ShieldCheck,
  ChevronLeft, ChevronRight, User, LayoutGrid, Terminal, Activity, Shield, X, Users,
} from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import AccountBlock from './AccountBlock.jsx';

const STAFF = ['developer', 'admin'];

// `roles` hides an item from everyone else; the routes and API enforce it too.
//
// There is deliberately no "report a bug" item: the shell has exactly one
// entry point for that, the "New bug" action in the top bar.
//
// Section labels are written in sentence case and uppercased by CSS, so
// screen readers say "Monitoring", not "M-O-N-I-T-O-R-I-N-G".
const navSections = [
  {
    // The product itself needs no signpost.
    category: null,
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
      { to: '/bugs', icon: Bug, label: 'Bugs' },
      { to: '/board', icon: LayoutGrid, label: 'Board' },
    ],
  },
  {
    category: 'Monitoring',
    items: [
      { to: '/metrics', icon: Activity, label: 'Metrics', roles: STAFF },
      { to: '/audit', icon: Shield, label: 'Audit log', roles: STAFF },
      { to: '/ai', icon: Cpu, label: 'AI analyzer' },
      // The sandbox creates real bugs, so it is staff-only like the pages above.
      { to: '/sdk-demo', icon: Terminal, label: 'SDK sandbox', roles: STAFF },
    ],
  },
  {
    category: 'Settings',
    items: [
      { to: '/profile', icon: User, label: 'Profile' },
      { to: '/team', icon: Users, label: 'Team', roles: ['admin'] },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const { user } = useAuth();

  // The icon-only mode applies to the desktop sidebar; the mobile drawer is
  // always full width.
  const iconOnly = collapsed && !mobileOpen;

  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(user?.role)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 bg-surface border-r border-border flex flex-col z-40 transition-[width,transform] duration-300 ease-in-out w-[244px] ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${collapsed ? 'lg:w-16' : 'lg:w-[244px]'}`}
      >
        {/* Brand Logo */}
        <div className={`h-16 flex items-center border-b border-border flex-shrink-0 ${iconOnly ? 'lg:justify-center lg:px-0 gap-3 px-5' : 'gap-3 px-5'}`}>
          <div className="w-9 h-9 rounded-lg bg-accent-dim border border-border flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={20} className="text-accent" />
          </div>
          {!iconOnly && (
            <div className="flex flex-col flex-1">
              <span className="text-base font-bold text-fg tracking-tight whitespace-nowrap">
                Bug<span className="text-accent">Sense</span>
              </span>
              <span className="text-[10px] text-muted/70 tracking-widest uppercase">Bug Tracker</span>
            </div>
          )}
          <button
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="lg:hidden p-1.5 rounded-lg text-muted hover:text-fg hover:bg-track"
          >
            <X size={18} />
          </button>
        </div>

        {/* Grouped Nav Items */}
        {/* Full-height column: header and footer fixed, the nav between them scrolls
            on its own when the window is too short, with shadows at whichever
            edge has more to show. */}
        {/*
          Spacing, all exact: rows of 10px x 12px padding with a 14px label and
          an 18px icon 12px from it; 2px between rows; 28px above a section
          label and 8px below it. Laid out with gaps rather than margins so
          each figure is the only thing between its two elements. With the
          labels hidden (collapsed), groups sit 16px apart instead.
        */}
        <nav
          className={`flex-1 min-h-0 py-3 overflow-y-auto overscroll-contain scroll-fade flex flex-col ${
            iconOnly ? 'px-2 gap-4' : 'px-3 gap-7'
          }`}
        >
          {sections.map((section) => (
            <div key={section.category ?? 'main'}>
              {/* Signposts, not headings: small, quiet, uppercase by CSS. */}
              {!iconOnly && section.category && (
                <p className="px-3 mb-2 text-[10px] font-medium uppercase tracking-wider text-subtle">
                  {section.category}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.map(({ to, icon: Icon, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={iconOnly ? label : undefined}
                    aria-label={iconOnly ? label : undefined}
                    className={({ isActive }) =>
                      // Active: the tinted fill alone -- no left bar, no glow.
                      `flex items-center rounded-lg text-sm font-medium transition-colors duration-200 group ${
                        iconOnly ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                      } ${
                        isActive
                          ? 'bg-accent-dim text-fg'
                          : 'text-muted hover:text-fg hover:bg-track'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={18} className={`flex-shrink-0 transition-colors ${isActive ? 'text-accent' : 'group-hover:text-fg'}`} />
                        {!iconOnly && <span className="flex-1 truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* The app's only account surface: pinned at the foot of the column. */}
        <div className={`flex-shrink-0 border-t border-border pt-3 pb-3 ${iconOnly ? 'px-2 flex justify-center' : 'px-3'}`}>
          <AccountBlock iconOnly={iconOnly} />
        </div>

        <button
          onClick={onToggle}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-surface border border-border items-center justify-center text-muted hover:text-fg hover:border-accent/50 transition-all duration-200 shadow-md"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </>
  );
}
