import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Plus, Search, Command } from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import useSocket from '../../hooks/useSocket.js';
import { getInitials, getImageUrl } from '../../utils/helpers.js';
import { RoleBadge } from './Badge.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/bugs?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="h-16 bg-[#0B0F19]/80 backdrop-blur-xl border-b border-white/[0.08] flex items-center justify-between px-6 sticky top-0 z-30 transition-all">
      {/* Left: Quick Search Bar */}
      <div className="flex items-center gap-4 flex-1 max-w-md">
        <form onSubmit={handleSearchSubmit} className="relative w-full hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search incidents, telemetry, stack traces..."
            className="w-full bg-[#111827]/80 hover:bg-[#111827] focus:bg-[#111827] border border-white/[0.08] focus:border-primary/60 rounded-xl pl-9 pr-14 py-1.5 text-xs text-text-base placeholder:text-muted/60 focus:outline-none transition-all shadow-inner"
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-muted">
            <Command size={10} /> K
          </div>
        </form>
      </div>

      {/* Right: Actions & User Info */}
      <div className="flex items-center gap-3">
        {/* Real-time Telemetry Pulse Badge */}
        <div
          title={connected ? 'Live WebSocket telemetry active' : 'Connecting to gateway...'}
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
          <span className="hidden lg:inline">{connected ? 'Live Telemetry' : 'Offline'}</span>
        </div>

        {/* Quick Report Button */}
        <button
          onClick={() => navigate('/report')}
          className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3.5 shadow-glow-primary"
        >
          <Plus size={15} />
          <span className="hidden sm:inline font-semibold">Report Incident</span>
        </button>

        {/* User Identity Profile */}
        <div className="pl-2 border-l border-white/[0.08] flex items-center gap-2.5">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity text-left cursor-pointer group"
            title="Go to Account Profile"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary via-secondary to-accent p-[1.5px] shadow-sm group-hover:shadow-glow-primary transition-all">
              <div className="w-full h-full rounded-[10px] bg-surface overflow-hidden flex items-center justify-center text-white text-xs font-bold">
                {user?.avatar ? (
                  <img src={getImageUrl(user.avatar)} alt={user.name} className="w-full h-full object-cover" />
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
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
