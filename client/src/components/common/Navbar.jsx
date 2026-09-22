import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Search, Command, Menu } from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import useSocket from '../../hooks/useSocket.js';
import { getInitials, getImageUrl } from '../../utils/helpers.js';
import { RoleBadge } from './Badge.jsx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function Navbar({ onOpenMenu }) {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef(null);
  const navigate = useNavigate();

  // Ctrl+K / ⌘K focuses the global search, as the hint in the field says.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/bugs?search=${encodeURIComponent(searchQuery.trim())}`);
      searchRef.current?.blur();
    }
  };

  return (
    <header className="h-16 bg-[#0B0F19]/80 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between gap-3 px-4 sm:px-6 sticky top-0 z-20 transition-all">
      {/* Left: Menu + Quick Search Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-md min-w-0">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="lg:hidden p-2 -ml-2 rounded-xl text-muted hover:text-text-base hover:bg-white/5"
        >
          <Menu size={20} />
        </button>
        <form onSubmit={handleSearchSubmit} className="relative w-full hidden md:block" role="search">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search incidents"
            placeholder="Search incidents, telemetry, stack traces..."
            className="w-full bg-[#111827]/80 hover:bg-[#111827] focus:bg-[#111827] border border-white/[0.08] focus:border-primary/60 rounded-xl pl-9 pr-14 py-1.5 text-xs text-text-base placeholder:text-muted/60 focus:outline-none transition-all shadow-inner"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-muted">
            {isMac ? <Command size={10} /> : 'Ctrl'} K
          </kbd>
        </form>
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time connection status */}
        <div
          title={connected ? 'Live updates connected' : 'Live updates disconnected'}
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium border transition-all duration-300 select-none ${
            connected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]'
              : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                connected ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
            />
          </span>
          <span className="hidden lg:inline">{connected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Quick Report Button */}
        <button
          onClick={() => navigate('/report')}
          aria-label="Report incident"
          className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3 sm:px-3.5 shadow-glow-primary"
        >
          <Plus size={15} />
          <span className="hidden sm:inline font-semibold">Report Incident</span>
        </button>

        {/* User Identity Profile */}
        <div className="pl-2 border-l border-white/[0.08] flex items-center gap-1 sm:gap-2.5">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity text-left cursor-pointer group"
            title="Go to Account Profile"
            aria-label="Account profile"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary via-secondary to-accent p-[1.5px] shadow-sm group-hover:shadow-glow-primary transition-all">
              <div className="w-full h-full rounded-[10px] bg-surface overflow-hidden flex items-center justify-center text-white text-xs font-bold">
                {user?.avatar ? (
                  <img src={getImageUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  getInitials(user?.name)
                )}
              </div>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-text-base leading-none mb-1 group-hover:text-primary transition-colors">
                {user?.name}
              </span>
              <RoleBadge role={user?.role} />
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-muted hover:text-priority-high hover:bg-priority-high/10 transition-colors duration-200"
            title="Sign out of BugSense"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
