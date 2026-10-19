import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileCode, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import BugFilters from '../../components/bugs/BugFilters.jsx';
import BugTable from '../../components/bugs/BugTable.jsx';
import ViewSwitch from '../../components/bugs/ViewSwitch.jsx';
import { downloadFile, toCsvCell } from '../../utils/helpers.js';

const DEFAULT_FILTERS = { status: '', priority: '', project: '', source: '', search: '' };

// How often, at most, a view that cannot apply live events itself re-fetches.
const REFRESH_MS = 1500;

// Filters live in the URL too, so Overview links (?status=open) and the top
// bar's search (?search=...) land on a filtered list.
const filtersFromParams = (params) =>
  Object.fromEntries(Object.keys(DEFAULT_FILTERS).map((key) => [key, params.get(key) || '']));

const sameFilters = (a, b) => Object.keys(DEFAULT_FILTERS).every((k) => a[k] === b[k]);

const activeOnly = (filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => Boolean(v)));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function TableSkeleton() {
  return (
    <div className="p-5 space-y-3" aria-busy="true" aria-label="Loading bugs">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-9 w-full rounded" />
      ))}
    </div>
  );
}

export default function BugList() {
  const [searchParams] = useSearchParams();
  const { bugs, setBugs, loading, pagination, setPagination, fetchBugs, fetchAllBugs, fetchStats } = useBugs();
  const [projectNames, setProjectNames] = useState([]);
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef(null);

  // The project filter offers the projects that exist, so nobody has to guess
  // an exact name. If this fails the filter still offers "Any project" (and
  // the one in the URL, if any), so the page keeps working.
  useEffect(() => {
    let cancelled = false;
    fetchStats()
      .then((data) => {
        if (!cancelled) setProjectNames(data.projectNames || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  // Typing in the search/project boxes should not fire a request per keystroke.
  const debouncedFilters = useDebouncedValue(filters, 300);

  // Sync state when URL params change (e.g. clicking Overview links or the
  // top bar's search). Adjusting state during render, rather than in an
  // effect, avoids a wasted render with the stale filters.
  const paramsKey = searchParams.toString();
  const [syncedParamsKey, setSyncedParamsKey] = useState(paramsKey);
  if (paramsKey !== syncedParamsKey) {
    setSyncedParamsKey(paramsKey);
    const next = filtersFromParams(searchParams);
    setFilters((prev) => (sameFilters(prev, next) ? prev : next));
    setPage(1);
  }

  useEffect(() => {
    fetchBugs({ ...activeOnly(debouncedFilters), page });
  }, [debouncedFilters, page, fetchBugs]);

  useEffect(() => {
    if (!showExportMenu) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !exportMenuRef.current?.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [showExportMenu]);

  const hasActiveFilters = Object.values(debouncedFilters).some(Boolean);
  const limit = pagination.limit || 20;

  /*
   * Live updates. The list is ordered by last activity, so any change can move
   * a bug: to the top of page 1, off this page, into or out of a filter.
   *
   * Unfiltered page 1 can apply created and updated events exactly by itself:
   * the bug with the newest activity goes on top, and a row pushed past the
   * page size belongs to page 2 anyway. Every other view -- a later page, or
   * filters that may include a search the client cannot evaluate -- cannot
   * know where the bug now belongs, so it re-fetches instead: quietly, keeping
   * its rows on screen, and at most once per REFRESH_MS, because an SDK crash
   * loop broadcasts an update per occurrence.
   */
  const exactLocally = page === 1 && !hasActiveFilters;

  const currentQuery = useRef({});
  useEffect(() => {
    currentQuery.current = { ...activeOnly(debouncedFilters), page };
  }, [debouncedFilters, page]);

  const refreshTimer = useRef(null);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      fetchBugs(currentQuery.current, { quiet: true });
    }, REFRESH_MS);
  }, [fetchBugs]);

  useSocketEvent('bug:created', useCallback((newBug) => {
    if (!exactLocally) {
      scheduleRefresh();
      return;
    }
    if (bugs.some((b) => b._id === newBug._id)) return;
    toast.success(`New bug reported: "${newBug.title.slice(0, 40)}"`, { icon: '🐛' });
    setBugs((prev) => [newBug, ...prev.filter((b) => b._id !== newBug._id)].slice(0, limit));
    setPagination((p) => ({ ...p, total: p.total + 1, pages: Math.max(1, Math.ceil((p.total + 1) / limit)) }));
  }, [exactLocally, bugs, limit, setBugs, setPagination, scheduleRefresh]));

  useSocketEvent('bug:updated', useCallback((updated) => {
    if (exactLocally) {
      // Newest activity goes on top. If the bug came from a later page, the
      // row it pushes past the page size now belongs on page 2.
      setBugs((prev) => {
        const existing = prev.find((b) => b._id === updated._id);
        const merged = existing ? { ...existing, ...updated } : updated;
        return [merged, ...prev.filter((b) => b._id !== updated._id)].slice(0, limit);
      });
      return;
    }
    // Show the new values at once where the row is visible, then re-fetch
    // to put it in its new place.
    setBugs((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
    scheduleRefresh();
  }, [exactLocally, limit, setBugs, scheduleRefresh]));

  useSocketEvent('bug:deleted', useCallback(({ _id }) => {
    // Side effects stay outside the state updaters: React may run an updater
    // twice (it does under StrictMode), which would double the toast and the
    // decrement.
    if (bugs.some((b) => b._id === _id)) {
      toast('A bug was deleted', { icon: '🗑️' });
      setBugs((prev) => prev.filter((b) => b._id !== _id));
      setPagination((p) => ({ ...p, total: Math.max(0, p.total - 1) }));
    }
    // This page is a row short now, or later pages have shifted: backfill.
    scheduleRefresh();
  }, [bugs, setBugs, setPagination, scheduleRefresh]));

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const exportAll = async (format) => {
    setShowExportMenu(false);
    setExporting(true);
    try {
      // Exactly what the filters select, every page of it.
      const all = await fetchAllBugs(activeOnly(debouncedFilters));
      if (!all.length) {
        toast.error('No bugs available to export');
        return;
      }

      const stamp = Date.now();
      if (format === 'csv') {
        const headers = ['ID', 'Title', 'Status', 'Priority', 'Severity', 'Project', 'Occurrences', 'Source', 'Reporter', 'Created At'];
        const rows = all.map((b) => [
          b._id,
          b.title,
          b.status,
          b.priority,
          b.severity,
          b.project || 'General',
          b.occurrences || 1,
          b.source || 'manual',
          b.reporter?.name || 'Anonymous',
          new Date(b.createdAt).toISOString(),
        ].map(toCsvCell).join(','));

        downloadFile([headers.map(toCsvCell).join(','), ...rows].join('\r\n'), `bugsense-export-${stamp}.csv`, 'text/csv;charset=utf-8;');
      } else {
        downloadFile(JSON.stringify(all, null, 2), `bugsense-export-${stamp}.json`, 'application/json');
      }
      toast.success(`Exported ${plural(all.length, 'bug')} to ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const first = (page - 1) * limit + 1;
  const last = (page - 1) * limit + bugs.length;

  let body;
  if (loading) {
    body = <TableSkeleton />;
  } else if (bugs.length > 0) {
    body = <BugTable bugs={bugs} />;
  } else if (page > 1) {
    // Rows on this page were deleted while it was open.
    body = (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-fg">Nothing left on this page.</p>
        <button type="button" onClick={() => setPage(1)} className="btn-secondary mt-4 text-sm py-1.5">
          Back to page 1
        </button>
      </div>
    );
  } else if (hasActiveFilters) {
    body = (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-fg">No bugs match these filters.</p>
        <p className="mt-1 text-sm text-muted">Try fewer filters, or clear them to see every bug.</p>
        <button type="button" onClick={handleReset} className="btn-secondary mt-4 text-sm py-1.5">
          Clear filters
        </button>
      </div>
    );
  } else {
    body = (
      <div className="px-5 py-12 text-center">
        <p className="text-sm text-fg">No bugs reported yet.</p>
        <p className="mt-1 text-sm text-muted">Use New bug in the top bar to report the first one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Bugs</h1>
          <p className="mt-1 text-sm text-muted">
            {loading ? '\u00a0' : hasActiveFilters ? `${plural(pagination.total, 'bug')} match these filters` : plural(pagination.total, 'bug')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ViewSwitch current="list" />
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setShowExportMenu((p) => !p)}
              disabled={exporting}
              aria-haspopup="menu"
              aria-expanded={showExportMenu}
              className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 disabled:opacity-60"
            >
              <Download size={14} aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={12} aria-hidden="true" />
            </button>
            {showExportMenu && (
              <div role="menu" className="absolute right-0 mt-1.5 w-56 bg-surface border border-border rounded-xl shadow-popover p-1.5 z-30">
                <p className="px-3 py-1.5 text-xs text-subtle">
                  {hasActiveFilters ? `The ${plural(pagination.total, 'bug')} matching these filters` : `All ${plural(pagination.total, 'bug')}`}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => exportAll('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-fg hover:bg-track transition-colors"
                >
                  <FileSpreadsheet size={14} className="text-muted" aria-hidden="true" /> CSV
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => exportAll('json')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-fg hover:bg-track transition-colors"
                >
                  <FileCode size={14} className="text-muted" aria-hidden="true" /> JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <BugFilters filters={filters} projects={projectNames} onChange={handleFilterChange} onReset={handleReset} />

      <section className="glass-card" aria-label="Bug list">
        {body}

        {!loading && bugs.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-2.5">
            <p className="text-xs text-muted">
              <span className="font-mono tabular-nums text-fg">{first}–{last}</span> of{' '}
              <span className="font-mono tabular-nums text-fg">{pagination.total}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary flex items-center gap-1 text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} aria-hidden="true" /> Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-secondary flex items-center gap-1 text-xs py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
