import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Plus, Bug, LayoutGrid, Download, FileSpreadsheet, FileCode, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import useDebouncedValue from '../../hooks/useDebouncedValue.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import BugCard from '../../components/bugs/BugCard.jsx';
import BugFilters from '../../components/bugs/BugFilters.jsx';
import { BugCardSkeleton } from '../../components/common/Loader.jsx';
import { downloadFile, toCsvCell } from '../../utils/helpers.js';

const DEFAULT_FILTERS = { status: '', priority: '', project: '', search: '' };

const filtersFromParams = (params) => ({
  status: params.get('status') || '',
  priority: params.get('priority') || '',
  project: params.get('project') || '',
  search: params.get('search') || '',
});

const sameFilters = (a, b) => Object.keys(DEFAULT_FILTERS).every((k) => a[k] === b[k]);

const activeOnly = (filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => Boolean(v)));

export default function BugList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { bugs, setBugs, loading, pagination, setPagination, fetchBugs, fetchAllBugs } = useBugs();
  const [filters, setFilters] = useState(() => filtersFromParams(searchParams));
  const [page, setPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef(null);

  // Typing in the search/project boxes should not fire a request per keystroke.
  const debouncedFilters = useDebouncedValue(filters, 300);

  // Sync state when URL params change (e.g. clicking dashboard cards or the navbar search)
  useEffect(() => {
    const next = filtersFromParams(searchParams);
    setFilters((prev) => (sameFilters(prev, next) ? prev : next));
    setPage(1);
  }, [searchParams]);

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

  useSocketEvent('bug:created', useCallback((newBug) => {
    // Only the unfiltered first page can know where a new bug belongs; on other
    // views it would appear out of place or in a list it doesn't match.
    if (page !== 1 || hasActiveFilters) return;
    setBugs((prev) => {
      if (prev.some((b) => b._id === newBug._id)) return prev;
      toast.success(`New bug reported: "${newBug.title.slice(0, 40)}"`, { icon: '🐛' });
      return [newBug, ...prev];
    });
    setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
  }, [page, hasActiveFilters, setBugs, setPagination]));

  useSocketEvent('bug:updated', useCallback((updated) => {
    setBugs((prev) => prev.map((b) => (b._id === updated._id ? { ...b, ...updated } : b)));
  }, [setBugs]));

  useSocketEvent('bug:deleted', useCallback(({ _id }) => {
    setBugs((prev) => {
      if (!prev.some((b) => b._id === _id)) return prev;
      toast('A bug was deleted', { icon: '🗑️' });
      return prev.filter((b) => b._id !== _id);
    });
  }, [setBugs]));

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
      toast.success(`Exported ${all.length} bug${all.length === 1 ? '' : 's'} to ${format.toUpperCase()}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-base">Bug Reports</h1>
          <p className="text-muted text-sm mt-0.5">
            {pagination.total} bug{pagination.total !== 1 ? 's' : ''} {hasActiveFilters ? 'match these filters' : 'tracked'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Export Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((p) => !p)}
              disabled={exporting}
              aria-haspopup="menu"
              aria-expanded={showExportMenu}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2 disabled:opacity-60"
            >
              <Download size={15} /> {exporting ? 'Exporting...' : 'Export'} <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <div role="menu" className="absolute right-0 mt-1.5 w-52 bg-surface border border-white/10 rounded-xl shadow-2xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                <p className="px-3 py-1.5 text-[10px] text-muted">All {pagination.total} matching bugs</p>
                <button
                  role="menuitem"
                  onClick={() => exportAll('csv')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-text-base hover:bg-white/5 transition-colors"
                >
                  <FileSpreadsheet size={14} className="text-green-400" /> Export CSV (.csv)
                </button>
                <button
                  role="menuitem"
                  onClick={() => exportAll('json')}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-text-base hover:bg-white/5 transition-colors"
                >
                  <FileCode size={14} className="text-primary" /> Export JSON (.json)
                </button>
              </div>
            )}
          </div>

          <Link to="/board" className="btn-secondary flex items-center gap-1.5 text-sm py-2">
            <LayoutGrid size={15} /> Kanban Board
          </Link>
          <button onClick={() => navigate('/report')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Report Bug
          </button>
        </div>
      </div>

      <BugFilters filters={filters} onChange={handleFilterChange} onReset={handleReset} />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <BugCardSkeleton key={i} />)}
        </div>
      ) : bugs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Bug size={28} className="text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-base mb-1">No bugs found</h3>
          <p className="text-muted text-sm mb-6">
            {hasActiveFilters ? 'Try adjusting your filters' : 'Be the first to report a bug!'}
          </p>
          <button onClick={() => navigate('/report')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Report Bug
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {bugs.map((bug) => <BugCard key={bug._id} bug={bug} />)}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-muted px-2">
                Page {page} of {pagination.pages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
