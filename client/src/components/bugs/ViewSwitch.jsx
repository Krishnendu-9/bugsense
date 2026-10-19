import { Link } from 'react-router-dom';
import { LayoutGrid, List } from 'lucide-react';

const VIEWS = [
  { id: 'list', to: '/bugs', label: 'List', icon: List },
  { id: 'board', to: '/board', label: 'Board', icon: LayoutGrid },
];

/*
 * List / Board as one segmented switch, shown on both pages so either view is
 * one click from the other. Both halves are the same control; the current view
 * is marked rather than styled as a primary action (the shell's only primary
 * action is New bug).
 */
export default function ViewSwitch({ current }) {
  const item = 'flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors duration-200';
  return (
    <nav aria-label="Bug views" className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-sm">
      {VIEWS.map(({ id, to, label, icon: Icon }) =>
        id === current ? (
          <span key={id} aria-current="page" className={`${item} bg-track text-fg font-medium`}>
            <Icon size={14} aria-hidden="true" /> {label}
          </span>
        ) : (
          <Link key={id} to={to} className={`${item} text-muted hover:text-fg hover:bg-track`}>
            <Icon size={14} aria-hidden="true" /> {label}
          </Link>
        )
      )}
    </nav>
  );
}
