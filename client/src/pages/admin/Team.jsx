import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios.js';
import useAuth from '../../hooks/useAuth.js';
import { RoleBadge } from '../../components/common/Badge.jsx';
import { ROLE_OPTIONS } from '../../utils/constants.js';
import { formatDate, getImageUrl, getInitials } from '../../utils/helpers.js';

function TeamSkeleton() {
  return (
    <div className="glass-card divide-y divide-hairline overflow-hidden" aria-busy="true" aria-label="Loading team">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="p-4 flex items-center gap-3">
          <div className="skeleton w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-40 rounded" />
            <div className="skeleton h-3 w-56 rounded" />
          </div>
          <div className="skeleton h-8 w-32 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// Admin-only: promote reporters to developers (or admins) and back. Needed
// because developer self-sign-up is off in production by default.
export default function Team() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/users')
      .then((res) => { if (!cancelled) setUsers(res.data); })
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load team'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const changeRole = async (member, role) => {
    if (role === member.role) return;
    setSavingId(member._id);
    try {
      const { data } = await api.put(`/users/${member._id}/role`, { role });
      setUsers((prev) => prev.map((u) => (u._id === data._id ? { ...u, role: data.role } : u)));
      toast.success(`${data.name} is now ${role === 'admin' ? 'an' : 'a'} ${role}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change role');
    } finally {
      setSavingId(null);
    }
  };

  const counts = users.reduce((acc, u) => ({ ...acc, [u.role]: (acc[u.role] || 0) + 1 }), {});

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users size={20} className="text-primary" />
          <h1 className="text-xl font-bold text-text-base">Team</h1>
        </div>
        <p className="text-xs text-muted">
          Developers and admins can triage every bug. Role changes apply on the member&apos;s next request.
        </p>
      </div>

      {!loading && users.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {ROLE_OPTIONS.map((opt) => (
            <span key={opt.value} className="px-2.5 py-1 rounded-full bg-track border border-border text-muted">
              {opt.label}s: <span className="text-text-base font-semibold">{counts[opt.value] || 0}</span>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <TeamSkeleton />
      ) : (
        <div className="glass-card divide-y divide-hairline overflow-hidden">
          {users.map((member) => {
            const isMe = member._id === me?._id;
            return (
              <div key={member._id} className="p-4 flex items-center gap-3 flex-wrap hover:bg-track transition-colors duration-200">
                <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-on-accent text-xs font-bold flex-shrink-0 overflow-hidden">
                  {member.avatar ? (
                    <img src={getImageUrl(member.avatar)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(member.name)
                  )}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <p className="text-sm font-medium text-text-base flex items-center gap-2">
                    {member.name} {isMe && <span className="text-[10px] text-muted font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {member.email} • joined {formatDate(member.createdAt, 'MMM yyyy')}
                  </p>
                </div>
                {isMe ? (
                  <RoleBadge role={member.role} />
                ) : (
                  <select
                    value={member.role}
                    onChange={(e) => changeRole(member, e.target.value)}
                    disabled={savingId === member._id}
                    aria-label={`Role for ${member.name}`}
                    className="input-field py-1.5 text-sm w-36 disabled:opacity-60"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
