import { Link } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import useAuth from '../../hooks/useAuth.js';

// Renders children only for the given roles. The API enforces the same rule;
// this avoids showing a page that can only fail.
export default function RoleRoute({ roles, children }) {
  const { user } = useAuth();

  if (roles.includes(user?.role)) return children;

  return (
    <div className="max-w-md mx-auto text-center py-20 space-y-3">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-muted">
        <ShieldOff size={26} />
      </div>
      <h1 className="text-lg font-semibold text-text-base">Staff only</h1>
      <p className="text-sm text-muted">This page is available to developers and admins.</p>
      <Link to="/dashboard" className="text-primary hover:underline text-sm">Back to dashboard</Link>
    </div>
  );
}
