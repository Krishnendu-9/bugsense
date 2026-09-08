import { Search, X } from 'lucide-react';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/constants.js';

export default function BugFilters({ filters, onChange, onReset }) {
  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some((v) => v !== '');

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            type="text"
            value={filters.search || ''}
            onChange={(e) => handleChange('search', e.target.value)}
            placeholder="Search bugs..."
            className="input-field pl-9 py-2 text-sm"
          />
        </div>

        <select
          value={filters.status || ''}
          onChange={(e) => handleChange('status', e.target.value)}
          className="input-field py-2 text-sm w-36"
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={filters.priority || ''}
          onChange={(e) => handleChange('priority', e.target.value)}
          className="input-field py-2 text-sm w-36"
        >
          <option value="">All Priority</option>
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={filters.project || ''}
          onChange={(e) => handleChange('project', e.target.value)}
          placeholder="Project..."
          className="input-field py-2 text-sm w-36"
        />

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-sm text-muted hover:text-text-base transition-colors duration-200"
          >
            <X size={14} />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
