import { useState, useCallback } from 'react';
import api from '../api/axios.js';
import toast from 'react-hot-toast';

export default function useAI() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (errorLog, bugContext = '', bugId = null) => {
    if (!errorLog.trim()) {
      toast.error('Please provide an error log to analyze');
      return null;
    }
    setLoading(true);
    setInsights(null);
    try {
      const { data } = await api.post('/ai/analyze', { errorLog, bugContext, bugId });
      setInsights(data);
      return data;
    } catch (err) {
      const msg = err.response?.data?.message || 'AI analysis failed';
      toast.error(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setInsights(null);
  }, []);

  return { insights, loading, analyze, reset };
}
