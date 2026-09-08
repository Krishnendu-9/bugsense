import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Bug, PlusCircle, Cpu, ShieldCheck,
  ChevronLeft, ChevronRight, User, LayoutGrid, Terminal, Activity, Shield,
} from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import { getInitials, getImageUrl } from '../../utils/helpers.js';

const navSections = [
  {
    category: 'INCIDENT OPS',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/bugs', icon: Bug, label: 'All Incidents' },
      { to: '/board', icon: LayoutGrid, label: 'Kanban Board', badge: 'Active' },
      { to: '/report', icon: PlusCircle, label: 'Report Incident' },
    ],
  },
  {
    category: 'OBSERVABILITY & AI',
    items: [
      { to: '/metrics', icon: Activity, label: 'System Vitals' },
      { to: '/audit', icon: Shield, label: 'Audit Trail' },
      { to: '/ai', icon: Cpu, label: 'AI Diagnostics' },
      { to: '/sdk-demo', icon: Terminal, label: 'SDK Sandbox', badge: 'Live' },
    ],
  },
  {
    category: 'SETTINGS',
    items: [
      { to: '/profile', icon: User, label: 'Profile & Alerts' },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-[#0B0F19]/95 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col z-20 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Logo */}
      <div className={`h-16 flex items-center border-b border-white/[0.08] flex-shrink-0 ${collapsed ? 'justify-center px-0' : 'gap-3 px-5'}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center flex-shrink-0 shadow-glow-primary">
          <ShieldCheck size={20} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-base font-bold text-text-base tracking-tight whitespace-nowrap">
              Bug<span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Sense</span>
            </span>
            <span className="text-[10px] font-mono text-muted/70 tracking-widest uppercase">Observability</span>
          </div>
        )}
      </div>

      {/* Grouped Nav Items */}
      <nav className={`flex-1 py-4 overflow-y-auto space-y-6 ${collapsed ? 'px-2' : 'px-3'}`}>
        {navSections.map((section) => (
          <div key={section.category} className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[10px] font-mono font-semibold text-muted/50 uppercase tracking-widest mb-1.5">
                {section.category}
              </p>
            )}
            {section.items.map(({ to, icon: Icon, label, badge }) => (
              <NavLink
                key={to}
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `flex items-center rounded-xl text-xs font-medium transition-all duration-200 relative group ${
                    collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                  } ${
                    isActive
                      ? 'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent text-white border border-primary/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]'
                      : 'text-muted hover:text-text-base hover:bg-white/[0.04] border border-transparent'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-primary shadow-glow-primary" />
                    )}
                    <Icon size={17} className={`flex-shrink-0 transition-colors ${isActive ? 'text-primary' : 'group-hover:text-text-base'}`} />
                    {!collapsed && (
                      <span className="flex-1 truncate">{label}</span>
                    )}
                    {!collapsed && badge && (
                      <span className="px-1.5 py-px rounded text-[9px] font-mono font-bold bg-primary/20 text-primary border border-primary/30">
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="px-3 pb-3 border-t border-border pt-3">
          <NavLink
            to="/profile"
            className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 flex items-center gap-2 min-w-0 transition-all duration-200 group"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden">
              {user?.avatar ? (
                <img src={getImageUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                getInitials(user?.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted leading-none mb-0.5 group-hover:text-primary transition-colors">Signed in as</p>
              <p className="text-xs font-medium text-text-base truncate">{user?.email}</p>
              <p className="text-[10px] text-primary capitalize mt-0.5">{user?.role}</p>
            </div>
          </NavLink>
        </div>
      )}

      {collapsed && (
        <div className="pb-3 px-2 border-t border-border pt-3 flex justify-center">
          <NavLink
            to="/profile"
            className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-[10px] font-bold overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
            title={user?.email}
          >
            {user?.avatar ? (
              <img src={getImageUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              getInitials(user?.name)
            )}
          </NavLink>
        </div>
      )}

      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-text-base hover:border-primary/50 transition-all duration-200 shadow-md"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
