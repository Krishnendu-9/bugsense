import { Lightbulb, Wrench, Cpu, Clock, Info, AlertTriangle } from 'lucide-react';
import { formatDate } from '../../utils/helpers.js';

// The heuristic rules and the model both mark code with Markdown backticks.
// Inline `spans` and ```fenced``` blocks render as code instead of showing the
// backticks; everything else stays plain text, which React escapes.
const CODE_PATTERN = /(```[\s\S]*?```|`[^`\n]+`)/;

// The two sources an analysis can carry (Bug.aiInsights.source). 'template'
// and 'unavailable' belong to post-mortems and patches, never to analyses.
const SOURCE_LABELS = {
  claude: { title: 'AI Analysis', subtitle: 'Powered by Claude' },
  heuristic: { title: 'Heuristic Analysis', subtitle: 'Keyword-based rules — AI not configured or unavailable' },
};
const UNKNOWN_SOURCE = { title: 'Analysis', subtitle: 'Source not recorded' };

function TextWithCode({ text }) {
  // split() with a capturing group puts the code matches at odd indexes.
  return String(text).split(CODE_PATTERN).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith('```')) {
      // Drop an optional language tag line ("```js").
      const code = part.slice(3, -3).replace(/^[\w-]*\n/, '');
      return (
        <pre key={i} className="my-2 p-3 rounded-lg bg-track border border-hairline font-mono text-xs overflow-x-auto whitespace-pre">
          {code}
        </pre>
      );
    }
    return (
      <code key={i} className="font-mono text-[0.85em] px-1 py-0.5 rounded bg-track text-fg">
        {part.slice(1, -1)}
      </code>
    );
  });
}

export default function ErrorInsights({ insights, analyzedAt, isLoading }) {
  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-track border border-border flex items-center justify-center">
            <Cpu size={16} className="text-muted animate-pulse" />
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

  if (!insights?.possibleCause) return null;

  // Only an explicit 'claude' is labelled as model output. A missing or
  // unknown source is not assumed to be Claude: records saved before `source`
  // existed include the old unlabelled fallback text, and seeded demo data
  // carries no source at all.
  const label = SOURCE_LABELS[insights.source] || UNKNOWN_SOURCE;
  const isHeuristic = insights.source === 'heuristic';
  const isUnknown = label === UNKNOWN_SOURCE;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-track border border-border flex items-center justify-center">
            <Cpu size={16} className="text-muted" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">{label.title}</h3>
            <p className="text-xs text-muted">{label.subtitle}</p>
          </div>
        </div>
        {analyzedAt && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <Clock size={11} />
            {formatDate(analyzedAt, 'MMM d, h:mm a')}
          </div>
        )}
      </div>

      {insights.outdated && (
        <div role="status" className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-track border border-border text-xs text-muted">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-status-progress" aria-hidden="true" />
          <span>
            The error log was edited after this analysis ran, so it may describe the old log. Run AI Analyze again
            for a current result.
          </span>
        </div>
      )}

      {isHeuristic && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-track border border-border text-xs text-muted">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            This is a generic suggestion matched from keywords in the log, not a model diagnosis.
            Set <code className="font-mono text-fg">ANTHROPIC_API_KEY</code> on the server for Claude analysis.
          </span>
        </div>
      )}

      {isUnknown && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-track border border-border text-xs text-muted">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            This analysis was saved without a record of what produced it, so it is not shown as model output.
            Run the analysis again for a labelled result.
          </span>
        </div>
      )}

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-track border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={14} className="text-muted flex-shrink-0" />
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Possible Cause</h4>
          </div>
          <div className="text-sm text-fg leading-relaxed whitespace-pre-wrap">
            <TextWithCode text={insights.possibleCause} />
          </div>
        </div>

        <div className="p-4 rounded-lg bg-track border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={14} className="text-muted flex-shrink-0" />
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Suggested Fix</h4>
          </div>
          {/* A div, not a p: fenced code renders as a <pre>, which a <p> cannot contain. */}
          <div className="text-sm text-fg leading-relaxed whitespace-pre-wrap">
            <TextWithCode text={insights.suggestedFix} />
          </div>
        </div>
      </div>
    </div>
  );
}
