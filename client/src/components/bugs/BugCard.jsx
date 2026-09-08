import { useNavigate } from 'react-router-dom';
import { MessageSquare, Clock, Tag } from 'lucide-react';
import { PriorityBadge, StatusBadge, SeverityBadge } from '../common/Badge.jsx';
import { timeAgo, getInitials, stripHtml, truncate, getImageUrl } from '../../utils/helpers.js';

export default function BugCard({ bug }) {
  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/bugs/${bug._id}`)}
      className="glass-card glass-card-hover p-5 cursor-pointer hover:bg-white/[0.04] relative group"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-text-base group-hover:text-primary transition-colors duration-200 line-clamp-2 text-sm leading-snug flex-1">
          {bug.title}
        </h3>
        <PriorityBadge priority={bug.priority} />
      </div>

      <p className="text-muted text-xs leading-relaxed mb-3 line-clamp-2">
        {truncate(stripHtml(bug.description), 120)}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <StatusBadge status={bug.status} />
        <SeverityBadge severity={bug.severity} />
        {bug.occurrences > 1 && (
          <span
            title={`Recurring issue: seen ${bug.occurrences} times`}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-priority-high/15 text-priority-high border border-priority-high/30"
          >
            ⚡ {bug.occurrences}x
          </span>
        )}
        {bug.source === 'sdk' && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
            SDK
          </span>
        )}
        {bug.project && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary/10 text-secondary border border-secondary/20">
            <Tag size={10} /> {bug.project}
          </span>
        )}
      </div>

      {bug.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {bug.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-xs bg-white/5 text-muted border border-border">
              #{tag}
            </span>
          ))}
          {bug.tags.length > 3 && (
            <span className="px-1.5 py-0.5 rounded text-xs text-muted">+{bug.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs text-muted">
        <div className="flex items-center gap-3">
          {bug.reporter && (
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                {bug.reporter.avatar ? (
                  <img src={getImageUrl(bug.reporter.avatar)} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  getInitials(bug.reporter.name)
                )}
              </div>
              <span className="truncate max-w-[80px]">{bug.reporter.name}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <MessageSquare size={12} />
            <span>{bug.comments?.length || 0}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>{timeAgo(bug.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
