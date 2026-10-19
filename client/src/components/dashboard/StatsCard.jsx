import { Link } from 'react-router-dom';
import { NO_VALUE } from '../../utils/constants.js';

/**
 * One headline figure. `value` of null or undefined renders NO_VALUE; the
 * caption is where the card says why, so a missing number is never silent.
 */
export default function StatsCard({ label, value, caption, to }) {
  const missing = value === null || value === undefined;

  const body = (
    <div
      className={`glass-card p-5 h-full transition-colors duration-200 ${
        to ? 'hover:border-subtle/50' : ''
      }`}
    >
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-2 text-3xl font-semibold font-mono tabular-nums tracking-tight ${
          missing ? 'text-subtle' : 'text-fg'
        }`}
      >
        {missing ? NO_VALUE : value}
      </p>
      {caption && <p className="mt-1 text-xs text-subtle">{caption}</p>}
    </div>
  );

  return to ? (
    <Link
      to={to}
      className="block rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton h-8 w-16 rounded" />
      <div className="skeleton h-3 w-24 rounded" />
    </div>
  );
}
