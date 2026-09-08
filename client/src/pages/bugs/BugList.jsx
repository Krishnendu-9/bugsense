import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Plus, Bug, LayoutGrid, Download, FileSpreadsheet, FileCode, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import useBugs from '../../hooks/useBugs.js';
import { useSocketEvent } from '../../hooks/useSocket.js';
import BugCard from '../../components/bugs/BugCard.jsx';
import BugFilters from '../../components/bugs/BugFilters.jsx';
import { BugCardSkeleton } from '../../components/common/Loader.jsx';

const DEFAULT_FILTERS = { status: '', priority: '', project: '', search: '' };

export default function BugList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { bugs, setBugs, loading, pagination, fetchBugs } = useBugs();
  const [filters, setFilters] = useState(() => ({
    status: searchParams.get('status') || '',
    priority: searchParams.get('priority') || '',
    project: searchParams.get('project') || '',
    search: searchParams.get('search') || '',
  }));
  const [page, setPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Sync state when URL params change (e.g. clicking different dashboard cards or search queries)
  useEffect(() => {
    setFilters({
      status: searchParams.get('status') || '',
      priority: searchParams.get('priority') || '',
      project: searchParams.get('project') || '',
      search: searchParams.get('search') || '',
    });
    setPage(1);
  }, [searchParams]);

  const load = useCallback(() => {
    const activeFilters = { ...filters, page };
    Object.keys(activeFilters).forEach((k) => { if (!activeFilters[k]) delete activeFilters[k]; });
    fetchBugs(activeFilters);
  }, [filters, page, fetchBugs]);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent('bug:created', useCallback((newBug) => {
    setBugs((prev) => {
      if (prev.some((b) => b._id === newBug._id)) return prev;
      toast.success(`New bug reported: "${newBug.title.slice(0, 40)}..."`, { icon: '🐛' });
      return [newBug, ...prev];
    });
  }, [setBugs]));

  useSocketEvent('bug:updated', useCallback((updated) => {
    setBugs((prev) => prev.map((b) => b._id === updated._id ? { ...b, ...updated } : b));
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

  const filteredBugs = filters.search
    ? bugs.filter((b) => b.title.toLowerCase().includes(filters.search.toLowerCase()))
    : bugs;

  const handleExportCSV = () => {
    if (!filteredBugs.length) {
      toast.error('No bugs available to export');
      return;
    }
    const headers = ['ID', 'Title', 'Status', 'Priority', 'Severity', 'Project', 'Occurrences', 'Source', 'Reporter', 'Created At'];
    const rows = filteredBugs.map((b) => [
      `"${b._id}"`,
      `"${(b.title || '').replace(/"/g, '""')}"`,
      `"${b.status || ''}"`,
      `"${b.priority || ''}"`,
      `"${b.severity || ''}"`,
      `"${b.project || 'General'}"`,
      b.occurrences || 1,
      `"${b.source || 'manual'}"`,
      `"${b.reporter?.name || 'Anonymous'}"`,
      `"${new Date(b.createdAt).toISOString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bugsense-export-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    toast.success(`Exported ${filteredBugs.length} bugs to CSV`);
  };

  const handleExportJSON = () => {
    if (!filteredBugs.length) {
      toast.error('No bugs available to export');
      return;
    }
    const jsonContent = JSON.stringify(filteredBugs, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `bugsense-export-${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
    toast.success(`Exported ${filteredBugs.length} bugs to JSON`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text-base">Bug Reports</h1>
          <p className="text-muted text-sm mt-0.5">
            {pagination.total} bug{pagination.total !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((p) => !p)}
              className="btn-secondary flex items-center gap-1.5 text-sm py-2"
            >
              <Download size={15} /> Export <ChevronDown size={12} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1.5 w-44 bg-surface border border-white/10 rounded-xl shadow-2xl p-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-text-base hover:bg-white/5 transition-colors"
                >
                  <FileSpreadsheet size={14} className="text-green-400" /> Export CSV (.csv)
                </button>
                <button
                  onClick={handleExportJSON}
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
      ) : filteredBugs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Bug size={28} className="text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-base mb-1">No bugs found</h3>
          <p className="text-muted text-sm mb-6">
            {Object.values(filters).some(Boolean) ? 'Try adjusting your filters' : 'Be the first to report a bug!'}
          </p>
          <button onClick={() => navigate('/report')} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Report Bug
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBugs.map((bug) => <BugCard key={bug._id} bug={bug} />)}
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
                disabled={page === pagination.pages}
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
