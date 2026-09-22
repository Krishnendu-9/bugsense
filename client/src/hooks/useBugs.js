import { useState, useCallback, useRef } from 'react';
import api from '../api/axios.js';
import toast from 'react-hot-toast';

const MAX_PAGE_SIZE = 100;

const toParams = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
};

export default function useBugs() {
  const [bugs, setBugs] = useState([]);
  const [bug, setBug] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

  // Only the latest request may update state; a slow earlier response (e.g.
  // from the previous filter or bug) must not overwrite a newer one.
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);

  const fetchBugs = useCallback(async (filters = {}) => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    try {
      const { data } = await api.get(`/bugs?${toParams(filters)}`);
      if (requestId !== listRequestId.current) return null;
      setBugs(data.bugs);
      setPagination({ total: data.total, page: data.page, pages: data.pages });
      return data;
    } catch (err) {
      if (requestId === listRequestId.current) {
        toast.error(err.response?.data?.message || 'Failed to load bugs');
      }
      return null;
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, []);

  // Every bug matching the filters, across all pages (used by exports).
  const fetchAllBugs = useCallback(async (filters = {}) => {
    const all = [];
    let page = 1;
    let pages = 1;
    do {
      const { data } = await api.get(`/bugs?${toParams({ ...filters, page, limit: MAX_PAGE_SIZE })}`);
      all.push(...data.bugs);
      pages = data.pages;
      page += 1;
    } while (page <= pages);
    return all;
  }, []);

  const fetchBugById = useCallback(async (id, { silent = false } = {}) => {
    const requestId = ++detailRequestId.current;
    if (!silent) {
      setLoading(true);
      setBug(null);
    }
    try {
      const { data } = await api.get(`/bugs/${id}`);
      if (requestId !== detailRequestId.current) return null;
      setBug(data);
      return data;
    } catch (err) {
      if (requestId === detailRequestId.current) {
        toast.error(err.response?.data?.message || 'Failed to load bug');
      }
      return null;
    } finally {
      if (requestId === detailRequestId.current) setLoading(false);
    }
  }, []);

  const createBug = useCallback(async (payload) => {
    const { data } = await api.post('/bugs', payload);
    return data;
  }, []);

  const updateBug = useCallback(async (id, payload) => {
    const { data } = await api.put(`/bugs/${id}`, payload);
    setBug((prev) => (prev && prev._id === id ? { ...prev, ...data } : prev));
    return data;
  }, []);

  const deleteBug = useCallback(async (id) => {
    await api.delete(`/bugs/${id}`);
    setBugs((prev) => prev.filter((b) => b._id !== id));
  }, []);

  const uploadImage = useCallback(async (id, file, field, endpoint) => {
    const form = new FormData();
    form.append(field, file);
    const { data } = await api.post(`/bugs/${id}/${endpoint}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }, []);

  const uploadScreenshot = useCallback(
    (id, file) => uploadImage(id, file, 'screenshot', 'screenshot'),
    [uploadImage]
  );

  const uploadAnnotation = useCallback(
    (id, file) => uploadImage(id, file, 'annotation', 'annotation'),
    [uploadImage]
  );

  const fetchStats = useCallback(async () => {
    const { data } = await api.get('/bugs/stats');
    return data;
  }, []);

  return {
    bugs,
    setBugs,
    bug,
    setBug,
    loading,
    pagination,
    setPagination,
    fetchBugs,
    fetchAllBugs,
    fetchBugById,
    createBug,
    updateBug,
    deleteBug,
    uploadScreenshot,
    uploadAnnotation,
    fetchStats,
  };
}
