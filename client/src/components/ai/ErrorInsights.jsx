import { Lightbulb, Wrench, Cpu, Clock } from 'lucide-react';
import { formatDate } from '../../utils/helpers.js';

export default function ErrorInsights({ insights, analyzedAt, isLoading }) {
  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Cpu size={16} className="text-primary animate-pulse" />
          </div>
          <div>
            <div className="skeleton h-4 w-32 rounded mb-1" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-5/6 rounded" />
          <div className="skeleton h-4 w-4/6 rounded" />
        </div>
        <div className="border-t border-border pt-4 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      </div>
    );
  }

  if (!insights) return null;

  return (
    <div className="glass-card p-6 border-primary/20 bg-primary/5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Cpu size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-base">AI Analysis</h3>
            <p className="text-xs text-muted">Powered by Claude</p>
          </div>
        </div>
        {analyzedAt && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <Clock size={11} />
            {formatDate(analyzedAt, 'MMM d, h:mm a')}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={14} className="text-amber-400 flex-shrink-0" />
            <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Possible Cause</h4>
          </div>
          <p className="text-sm text-text-base leading-relaxed">{insights.possibleCause}</p>
        </div>

        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={14} className="text-primary flex-shrink-0" />
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wide">Suggested Fix</h4>
          </div>
          <p className="text-sm text-text-base leading-relaxed whitespace-pre-wrap">{insights.suggestedFix}</p>
        </div>
      </div>
    </div>
  );
}
