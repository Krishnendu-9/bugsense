import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Command, Menu, Plus } from 'lucide-react';
import useSocket from '../../hooks/useSocket.js';
import ThemeToggle from './ThemeToggle.jsx';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function Navbar({ onOpenMenu }) {
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
            aria-label="Search bugs"
            placeholder="Search bugs and error logs…"
            className="w-full bg-bg border border-border focus:border-accent rounded-lg pl-9 pr-14 py-1.5 text-xs text-fg placeholder:text-subtle focus:outline-none transition-colors"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-track border border-border text-[10px] font-mono text-muted">
            {isMac ? <Command size={10} /> : 'Ctrl'} K
          </kbd>
        </form>
      </div>

      {/* Right: connection, theme and the one primary action. The account
          lives in the sidebar only (its menu holds Profile and Sign out); on
          small screens it is reached through the menu drawer. */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Real-time connection status: a 6px dot and a word, nothing else.
            role="status" announces the change if the socket drops. */}
        <div
          role="status"
          title={connected ? 'Live updates connected' : 'Live updates disconnected'}
          className="flex items-center gap-1.5 text-xs text-muted select-none"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-accent' : 'bg-subtle'}`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{connected ? 'Live' : 'Offline'}</span>
          <span className="sr-only sm:hidden">{connected ? 'Live' : 'Offline'}</span>
        </div>

        <ThemeToggle />

        {/* The shell's one primary action, and its only way to report a bug. */}
        <Link
          to="/report"
          aria-label="New bug"
          className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3"
        >
          <Plus size={14} aria-hidden="true" />
          <span className="hidden sm:inline">New bug</span>
        </Link>
      </div>
    </header>
  );
}
