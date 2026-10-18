import { Search, X } from 'lucide-react';
import { PRIORITY_OPTIONS, SOURCE_OPTIONS, STATUS_OPTIONS } from '../../utils/constants.js';

/**
 * The filter row above the bug table. Every control has an accessible name;
 * the selects' "Any ..." option is the unfiltered state.
 */
export default function BugFilters({ filters, projects = [], onChange, onReset }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });
  const active = Object.values(filters).some((v) => v !== '');

  // The current project stays selectable even when it is not in the list (a
  // shared URL naming a project with no bugs left): otherwise the select
  // would read "Any project" while the list is still filtered by it.
  const projectOptions =
    filters.project && !projects.includes(filters.project) ? [...projects, filters.project] : projects;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter bugs">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={filters.search || ''}
          onChange={(e) => set('search', e.target.value)}
          aria-label="Search bugs"
          placeholder="Search title, description, error log, tags"
          className="input-field pl-9 py-1.5 text-sm"
        />
      </div>

      <select
        value={filters.status || ''}
        onChange={(e) => set('status', e.target.value)}
        aria-label="Status"
        className="input-field py-1.5 text-sm w-36"
      >
        <option value="">Any status</option>
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        value={filters.priority || ''}
        onChange={(e) => set('priority', e.target.value)}
        aria-label="Priority"
        className="input-field py-1.5 text-sm w-36"
      >
        <option value="">Any priority</option>
        {PRIORITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <select
        value={filters.project || ''}
        onChange={(e) => set('project', e.target.value)}
        aria-label="Project"
        className="input-field py-1.5 text-sm w-44"
      >
        <option value="">Any project</option>
        {projectOptions.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>

      <select
        value={filters.source || ''}
        onChange={(e) => set('source', e.target.value)}
        aria-label="Source"
        className="input-field py-1.5 text-sm w-48"
      >
        <option value="">Any source</option>
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {active && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-muted hover:text-fg transition-colors duration-200"
        >
          <X size={14} aria-hidden="true" />
          Clear filters
        </button>
      )}
    </div>
  );
}
