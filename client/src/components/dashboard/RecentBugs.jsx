import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PriorityBadge, StatusBadge } from '../common/Badge.jsx';
import { timeAgo, truncate } from '../../utils/helpers.js';

export default function RecentBugs({ bugs = [] }) {
  const navigate = useNavigate();

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-base">Recent Bugs</h3>
        <button
          onClick={() => navigate('/bugs')}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          View all <ArrowRight size={12} />
        </button>
      </div>

      {bugs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted text-sm">No bugs reported yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bugs.map((bug) => (
            <div
              key={bug._id}
              onClick={() => navigate(`/bugs/${bug._id}`)}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors duration-200 group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-base group-hover:text-primary transition-colors truncate">
                  {truncate(bug.title, 60)}
                </p>
                <p className="text-xs text-muted mt-0.5">{timeAgo(bug.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <StatusBadge status={bug.status} />
                <PriorityBadge priority={bug.priority} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
