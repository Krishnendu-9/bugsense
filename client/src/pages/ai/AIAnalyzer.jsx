import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Cpu, Zap, RotateCcw, AlertTriangle, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import useAI from '../../hooks/useAI.js';
import ErrorInsights from '../../components/ai/ErrorInsights.jsx';

const EXAMPLE_ERRORS = [
  {
    label: 'TypeError: Cannot read properties',
    value: `TypeError: Cannot read properties of undefined (reading 'map')
    at BugList (BugList.jsx:42:18)
    at renderWithHooks (react-dom.development.js:14985)
    at updateFunctionComponent (react-dom.development.js:17356)`,
  },
  {
    label: 'MongoDB connection error',
    value: `MongoServerError: Authentication failed.
    at Connection.onMessage (/node_modules/mongodb/lib/cmap/connection.js:207)
    at MessageStream.<anonymous> (/node_modules/mongodb/lib/cmap/connection.js:60)
    MongoError: connect ECONNREFUSED 127.0.0.1:27017`,
  },
  {
    label: 'JWT verification failed',
    value: `JsonWebTokenError: invalid signature
    at /node_modules/jsonwebtoken/verify.js:63
    at /server/middleware/auth.middleware.js:12
    at Layer.handle [as handle_request] (/node_modules/express/lib/router/layer.js:95)`,
  },
];

export default function AIAnalyzer() {
  const { insights, loading, analyze, reset } = useAI();
  const [charCount, setCharCount] = useState(0);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    defaultValues: { errorLog: '', bugContext: '' },
  });

  const errorLog = watch('errorLog');

  const onSubmit = async (data) => {
    const result = await analyze(data.errorLog, data.bugContext);
    if (result) toast.success('Analysis complete!');
  };

  const handleReset = () => {
    reset();
    setValue('errorLog', '');
    setValue('bugContext', '');
    setCharCount(0);
  };

  const loadExample = (value) => {
    setValue('errorLog', value);
    setCharCount(value.length);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/25">
            <Cpu size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-base">AI Debug Analyzer</h1>
            <p className="text-muted text-sm">Powered by Claude — paste any error and get instant debug insights</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={14} className="text-muted" />
          <h3 className="text-sm font-semibold text-text-base">Example Errors</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_ERRORS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => loadExample(ex.value)}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-border text-muted hover:text-text-base hover:border-primary/40 transition-all duration-200"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="glass-card p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label flex items-center gap-1.5">
                <AlertTriangle size={13} />
                Error Log / Stack Trace <span className="text-priority-high">*</span>
              </label>
              <span className="text-xs text-muted">{charCount} chars</span>
            </div>
            <textarea
              {...register('errorLog', { required: 'Please provide an error log' })}
              onChange={(e) => {
                setCharCount(e.target.value.length);
              }}
              className="input-field font-mono text-xs resize-none"
              rows={10}
              placeholder="Paste your error message, stack trace, console output, or any debug text here..."
            />
            {errors.errorLog && (
              <p className="text-priority-high text-xs mt-1">{errors.errorLog.message}</p>
            )}
          </div>

          <div>
            <label className="label">Bug Context (optional)</label>
            <textarea
              {...register('bugContext')}
              className="input-field text-sm resize-none"
              rows={3}
              placeholder="Describe what you were doing when the error occurred, any recent changes, etc."
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              type="button"
              onClick={handleReset}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RotateCcw size={14} /> Reset
            </button>

            <button
              type="submit"
              disabled={loading || !errorLog?.trim()}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Zap size={16} />
                  Analyze with AI
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      <ErrorInsights insights={insights} isLoading={loading} />

      {!insights && !loading && (
        <div className="glass-card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Cpu size={28} className="text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-text-base mb-2">Ready to Debug</h3>
          <p className="text-muted text-sm max-w-sm mx-auto">
            Paste your error log above and Claude will analyze the root cause and suggest actionable fixes in seconds.
          </p>
        </div>
      )}
    </div>
  );
}
