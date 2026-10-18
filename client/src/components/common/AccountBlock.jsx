import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';
import { getInitials, getImageUrl } from '../../utils/helpers.js';

function UserAvatar({ user, className }) {
  return (
    <div className={`rounded-full bg-accent flex items-center justify-center text-on-accent font-bold flex-shrink-0 overflow-hidden ${className}`}>
      {user?.avatar ? (
        <img src={getImageUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
      ) : (
        getInitials(user?.name)
      )}
    </div>
  );
}

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent';

/**
 * The app's only account surface, at the foot of the sidebar: the signed-in
 * user as a link to their Profile, with Sign out as its own button beside it.
 *
 * The link and the button are siblings, never nested -- a button inside a link
 * is invalid HTML and would let a click on Sign out reach the link -- so they
 * are also two separate tab stops. Collapsed, the avatar is the link and the
 * button sits below it.
 */
export default function AccountBlock({ iconOnly = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? 'unknown user';

  const signOut = () => {
    logout();
    navigate('/login');
  };

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      title="Sign out"
      className={`flex-shrink-0 p-2 rounded-md text-muted hover:text-fg hover:bg-border transition-colors duration-200 ${focusRing}`}
    >
      <LogOut size={16} aria-hidden="true" />
    </button>
  );

  if (iconOnly) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <Link
          to="/profile"
          aria-label={`Profile, signed in as ${email}`}
          title={email}
          className={`flex rounded-full hover:ring-2 hover:ring-border transition-shadow ${focusRing}`}
        >
          <UserAvatar user={user} className="w-8 h-8 text-[10px]" />
        </Link>
        {signOutButton}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-lg bg-track border border-transparent hover:border-border transition-colors duration-200">
      <Link
        to="/profile"
        aria-label={`Profile, signed in as ${email}`}
        // The email is truncated to fit beside Sign out; hover shows all of it.
        title={email}
        className={`flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 rounded-lg ${focusRing}`}
      >
        <UserAvatar user={user} className="w-7 h-7 text-[10px]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted leading-none mb-0.5">Signed in as</p>
          <p className="text-xs font-medium text-fg truncate">{user?.email}</p>
          <p className="text-[10px] text-accent capitalize mt-0.5">{user?.role}</p>
        </div>
      </Link>
      <div className="pr-1.5">{signOutButton}</div>
    </div>
  );
}
