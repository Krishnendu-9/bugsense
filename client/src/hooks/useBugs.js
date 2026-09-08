import { useState, useCallback } from 'react';
import api from '../api/axios.js';
import toast from 'react-hot-toast';

export default function useBugs() {
  const [bugs, setBugs] = useState([]);
  const [bug, setBug] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });

  const fetchBugs = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const { data } = await api.get(`/bugs?${params.toString()}`);
      setBugs(data.bugs);
      setPagination({ total: data.total, page: data.page, pages: data.pages });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bugs');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBugById = useCallback(async (id) => {
    setLoading(true);
    setBug(null);
    try {
      const { data } = await api.get(`/bugs/${id}`);
      setBug(data);
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bug');
    } finally {
      setLoading(false);
    }
  }, []);

  const createBug = useCallback(async (payload) => {
    const { data } = await api.post('/bugs', payload);
    return data;
  }, []);

  const updateBug = useCallback(async (id, payload) => {
    const { data } = await api.put(`/bugs/${id}`, payload);
    setBug((prev) => (prev && prev._id === id ? data : prev));
    return data;
  }, []);

  const deleteBug = useCallback(async (id) => {
    await api.delete(`/bugs/${id}`);
    setBugs((prev) => prev.filter((b) => b._id !== id));
  }, []);

  const uploadScreenshot = useCallback(async (id, file) => {
    const form = new FormData();
    form.append('screenshot', file);
    const { data } = await api.post(`/bugs/${id}/screenshot`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  }, []);

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
    fetchBugs,
    fetchBugById,
    createBug,
    updateBug,
    deleteBug,
    uploadScreenshot,
    fetchStats,
  };
}
