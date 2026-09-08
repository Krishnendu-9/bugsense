import React, { useState } from 'react';
import { MousePointer, Compass, Network, Terminal, AlertOctagon, ChevronDown, ChevronUp, History } from 'lucide-react';

const CATEGORY_ICONS = {
  click: { icon: MousePointer, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
  navigation: { icon: Compass, color: 'text-secondary', bg: 'bg-secondary/10 border-secondary/20' },
  xhr: { icon: Network, color: 'text-priority-medium', bg: 'bg-priority-medium/10 border-priority-medium/20' },
  console: { icon: Terminal, color: 'text-muted', bg: 'bg-white/5 border-white/10' },
  error: { icon: AlertOctagon, color: 'text-priority-high', bg: 'bg-priority-high/10 border-priority-high/20' },
};

export default function BreadcrumbTimeline({ breadcrumbs = [] }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!breadcrumbs || breadcrumbs.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted">
        No breadcrumb telemetry captured for this report.
      </div>
    );
  }

  // Calculate relative seconds to the last action (the crash)
  const lastTime = new Date(breadcrumbs[breadcrumbs.length - 1]?.timestamp).getTime();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted pb-1 border-b border-white/5">
        <span className="flex items-center gap-1.5 font-medium text-text-base">
          <History size={14} className="text-primary" /> Flight Recorder Timeline ({breadcrumbs.length} actions)
        </span>
        <span>Relative to crash</span>
      </div>

      <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          const config = CATEGORY_ICONS[crumb.category] || CATEGORY_ICONS.click;
          const Icon = config.icon;
          const currentTimestamp = new Date(crumb.timestamp).getTime();
          const diffSeconds = ((currentTimestamp - lastTime) / 1000).toFixed(1);
          const timeLabel = isLast ? 'CRASH' : `${diffSeconds}s`;
          const isExpanded = expandedIndex === idx;

          return (
            <div key={idx} className="relative group">
              {/* Dot icon */}
              <div
                className={`absolute -left-6 top-1 w-5 h-5 rounded-full border flex items-center justify-center ${config.bg} ${config.color}`}
              >
                <Icon size={10} />
              </div>

              <div
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                className={`glass-card p-2.5 text-xs transition-colors hover:border-white/20 cursor-pointer ${
                  isLast ? 'border-priority-high/40 bg-priority-high/5' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-mono text-[10px] uppercase px-1.5 py-0.5 rounded border ${config.bg} ${config.color}`}>
                      {crumb.category}
                    </span>
                    <span className="font-mono text-text-base truncate font-medium">
                      {crumb.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`font-mono text-[11px] font-semibold ${isLast ? 'text-priority-high' : 'text-muted'}`}>
                      {timeLabel}
                    </span>
                    {crumb.data && Object.keys(crumb.data).length > 0 && (
                      <span className="text-muted">
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && crumb.data && Object.keys(crumb.data).length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-white/5 bg-black/40 rounded p-2 text-[11px] font-mono text-muted overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{JSON.stringify(crumb.data, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
