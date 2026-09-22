export function BugCardSkeleton() {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="skeleton h-5 w-3/4 rounded" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-4 w-full rounded" />
      <div className="skeleton h-4 w-2/3 rounded" />
      <div className="flex items-center gap-2 pt-1">
        <div className="skeleton h-4 w-20 rounded-full" />
        <div className="skeleton h-4 w-20 rounded-full" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-16 rounded" />
      </div>
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-10 w-10 rounded-lg" />
      </div>
      <div className="skeleton h-8 w-16 rounded mb-1" />
      <div className="skeleton h-3 w-20 rounded" />
    </div>
  );
}

export function BugDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-4">
        <div className="skeleton h-7 w-3/4 rounded" />
        <div className="flex gap-2">
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-5/6 rounded" />
        <div className="skeleton h-4 w-4/6 rounded" />
      </div>
      <div className="glass-card p-6 space-y-3">
        <div className="skeleton h-5 w-32 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-2/3 rounded" />
      </div>
    </div>
  );
}

// Generic page-level placeholder; per the design system, loading states use
// skeletons rather than spinners.
export default function Loader({ text = 'Loading...', lines = 4 }) {
  return (
    <div className="glass-card p-6 space-y-3" aria-busy="true" aria-label={text}>
      <div className="skeleton h-5 w-1/3 rounded" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}
