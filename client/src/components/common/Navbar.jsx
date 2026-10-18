import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Search, Command, Menu } from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import useSocket from '../../hooks/useSocket.js';
import { getInitials, getImageUrl } from '../../utils/helpers.js';
import { RoleBadge } from './Badge.jsx';
import ThemeToggle from './ThemeToggle.jsx';

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
    <header className="h-16 bg-surface border-b border-border flex items-center justify-between gap-3 px-4 sm:px-6 sticky top-0 z-20">
      {/* Left: Menu + Quick Search Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-md min-w-0">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="lg:hidden p-2 -ml-2 rounded-lg text-muted hover:text-fg hover:bg-track"
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
            className="w-full bg-bg border border-border focus:border-accent rounded-lg pl-9 pr-14 py-1.5 text-xs text-fg placeholder:text-subtle focus:outline-none transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-track border border-border text-[10px] font-mono text-muted">
            {isMac ? <Command size={10} /> : 'Ctrl'} K
          </kbd>
        </form>
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time connection status */}
        <div
          title={connected ? 'Live updates connected' : 'Live updates disconnected'}
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all duration-300 select-none ${
            connected
              ? 'bg-accent-dim border-accent/30 text-accent'
              : 'bg-track border-border text-muted'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                connected ? 'bg-accent' : 'bg-subtle'
              }`}
            />
          </span>
          <span className="hidden lg:inline">{connected ? 'Live' : 'Offline'}</span>
        </div>

        <ThemeToggle />

        {/* User Identity Profile */}
        <div className="pl-2 border-l border-border flex items-center gap-1 sm:gap-2.5">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity text-left cursor-pointer group"
            title="Go to Account Profile"
            aria-label="Account profile"
          >
            <div className="w-8 h-8 rounded-lg border border-border p-[1.5px]">
              <div className="w-full h-full rounded-md bg-track overflow-hidden flex items-center justify-center text-fg text-xs font-bold">
                {user?.avatar ? (
                  <img src={getImageUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  getInitials(user?.name)
                )}
              </div>
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-fg leading-none mb-1 group-hover:text-accent transition-colors">
                {user?.name}
              </span>
              <RoleBadge role={user?.role} />
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-200"
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
