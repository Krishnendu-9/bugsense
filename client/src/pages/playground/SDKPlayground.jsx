import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, AlertOctagon, Terminal, ShoppingBag, ArrowRight, Zap, RefreshCw, CheckCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSocketEvent } from '../../hooks/useSocket.js';
import { timeAgo } from '../../utils/helpers.js';

export default function SDKPlayground() {
  const [recentBugs, setRecentBugs] = useState([]);
  const [sdkReady, setSdkReady] = useState(false);

  // Dynamically load the BugSense SDK script if not already present
  useEffect(() => {
    let script = document.getElementById('bugsense-sdk-script');
    if (!script) {
      script = document.createElement('script');
      script.id = 'bugsense-sdk-script';
      script.src = '/sdk/bugsense.js';
      script.setAttribute('data-api-url', window.location.origin);
      script.setAttribute('data-project', 'Storefront Demo');
      script.onload = () => setSdkReady(true);
      document.body.appendChild(script);
    } else {
      setSdkReady(true);
    }

    return () => {
      // Clean up floating pill when leaving playground
      const pill = document.getElementById('bugsense-floating-pill');
      const modal = document.getElementById('bugsense-modal-container');
      if (pill) pill.remove();
      if (modal) modal.remove();
      if (script) script.remove();
    };
  }, []);

  // Listen for real-time bug creations
  useSocketEvent('bug:created', (newBug) => {
    setRecentBugs((prev) => [newBug, ...prev.slice(0, 4)]);
    toast.success(
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-secondary" />
        <span>Telemetry received: <strong>{newBug.title.slice(0, 35)}...</strong></span>
      </div>,
      { duration: 4000 }
    );
  });

  // Simulation Handlers
  const handleSimulateNullPointer = () => {
    toast('Triggering simulated null reference dereference...', { icon: '💥' });
    setTimeout(() => {
      // Intentional undefined dereference
      const checkoutState = null;
      checkoutState.user.shippingAddress.postalCode = '94103';
    }, 100);
  };

  const handleSimulateApiError = async () => {
    toast('Simulating 500 Internal Server Error network call...', { icon: '🌐' });
    try {
      await fetch('/api/non-existent-order-endpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 149.99, cartId: 'cart_demo_881' }),
      });
    } catch {
      // Error is caught by SDK fetch wrapper
    }
  };

  const handleSimulatePromiseRejection = () => {
    toast('Simulating unhandled async promise rejection...', { icon: '⏳' });
    setTimeout(() => {
      Promise.reject(new Error('Stripe Payment Gateway: Card declined due to insufficient credit'));
    }, 100);
  };

  const handleCustomCapture = () => {
    if (window.BugSense?.captureMessage) {
      window.BugSense.captureMessage('Telemetry Event: User clicked promotional coupon banner #SUMMER50', 'low');
      toast.success('Dispatched custom telemetry message to BugSense API!');
    } else {
      toast.error('SDK is still initializing, try again in a second.');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header Banner */}
      <div className="glass-card p-6 relative overflow-hidden border border-primary/30">
        <div className="absolute -top-20 -right-20 w-56 h-56 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-primary/20 text-primary border border-primary/30 flex items-center gap-1.5">
                <Play size={10} className="fill-primary" /> Live Telemetry Sandbox
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-mono border flex items-center gap-1 ${
                  sdkReady
                    ? 'bg-green-500/15 text-green-400 border-green-500/30'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                }`}
              >
                <ShieldCheck size={11} /> {sdkReady ? 'SDK Active' : 'Loading SDK...'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-text-base mb-1">
              Client SDK Observability Simulator
            </h1>
            <p className="text-xs text-muted max-w-2xl leading-relaxed">
              This interactive playground demonstrates the BugSense Client SDK (<code>bugsense.js</code>).
              Click any fault-injection button below to trigger real browser exceptions. Watch the SDK record
              the Flight Recorder breadcrumbs and stream incidents to your dashboard in real-time.
            </p>
          </div>
          <Link
            to="/bugs"
            className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5"
          >
            Go to Bug Dashboard <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mock Storefront Interactive App (2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 border border-white/10 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                  <ShoppingBag size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-base">Simulated Customer Storefront</h3>
                  <p className="text-[11px] text-muted">Client website with embedded &lt;script src=&quot;.../bugsense.js&quot;&gt;</p>
                </div>
              </div>
              <span className="text-xs font-mono text-muted bg-black/40 px-2.5 py-1 rounded border border-white/5">
                Cart: $149.99
              </span>
            </div>

            {/* Cart Items Mock */}
            <div className="space-y-2 bg-black/30 p-3 rounded-xl border border-white/5 text-xs text-muted">
              <div className="flex justify-between items-center py-1">
                <span className="text-text-base font-medium">Mechanical Keyboard Pro (RGB Wireless)</span>
                <span className="font-mono text-text-base">$129.00</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-text-base font-medium">Braided USB-C Aviator Cable</span>
                <span className="font-mono text-text-base">$20.99</span>
              </div>
            </div>

            {/* Fault Injection Panel */}
            <div>
              <h4 className="text-xs font-semibold text-text-base uppercase tracking-wider text-muted mb-3">
                Interactive Fault Injection Triggers
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={handleSimulateNullPointer}
                  className="p-3.5 rounded-xl text-left glass-card border-priority-high/30 hover:border-priority-high hover:bg-priority-high/5 transition-all group"
                >
                  <div className="flex items-center gap-2 text-priority-high mb-1.5 font-semibold text-xs">
                    <AlertOctagon size={15} /> Null Pointer Dereference
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Accesses properties of <code>null</code>. Triggers <code>window.onerror</code> with stack trace.
                  </p>
                </button>

                <button
                  onClick={handleSimulateApiError}
                  className="p-3.5 rounded-xl text-left glass-card border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/5 transition-all group"
                >
                  <div className="flex items-center gap-2 text-amber-400 mb-1.5 font-semibold text-xs">
                    <Terminal size={15} /> Simulated API Network 500
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Executes failing <code>window.fetch</code> to log API breadcrumbs into telemetry.
                  </p>
                </button>

                <button
                  onClick={handleSimulatePromiseRejection}
                  className="p-3.5 rounded-xl text-left glass-card border-purple-500/30 hover:border-purple-500 hover:bg-purple-500/5 transition-all group"
                >
                  <div className="flex items-center gap-2 text-purple-400 mb-1.5 font-semibold text-xs">
                    <Zap size={15} /> Async Promise Rejection
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Throws unhandled Promise rejection. Captured by <code>unhandledrejection</code>.
                  </p>
                </button>

                <button
                  onClick={handleCustomCapture}
                  className="p-3.5 rounded-xl text-left glass-card border-secondary/30 hover:border-secondary hover:bg-secondary/5 transition-all group"
                >
                  <div className="flex items-center gap-2 text-secondary mb-1.5 font-semibold text-xs">
                    <CheckCircle2 size={15} /> Custom SDK Telemetry Message
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Calls <code>window.BugSense.captureMessage()</code> to ship an operational event.
                  </p>
                </button>
              </div>
            </div>

            {/* Widget Tip Banner */}
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-muted">
              <div>
                <span className="font-semibold text-primary block mb-0.5">Tip: Try the Floating Bug Pill!</span>
                Look at the bottom-right of this page. Click the purple <strong>&quot;🐞 Report Bug&quot;</strong> pill to submit user feedback with auto-attached breadcrumbs.
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Telemetry Ingestion Feed (1 Column) */}
        <div className="space-y-4">
          <div className="glass-card p-5 border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h3 className="text-xs font-semibold text-text-base uppercase tracking-wider text-muted flex items-center gap-1.5">
                <RefreshCw size={12} className="text-secondary animate-spin" /> Live Ingestion Feed
              </h3>
              <span className="text-[10px] text-muted font-mono">WebSocket Sync</span>
            </div>

            {recentBugs.length === 0 ? (
              <div className="text-center py-10 space-y-2 text-muted text-xs">
                <p>No telemetry received in this session yet.</p>
                <p className="text-[11px] text-muted/60">Click any fault trigger on the left to fire a live incident!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentBugs.map((b) => (
                  <Link
                    key={b._id}
                    to={`/bugs/${b._id}`}
                    className="block p-3 rounded-lg bg-black/40 border border-white/5 hover:border-primary/40 hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-semibold text-text-base group-hover:text-primary transition-colors line-clamp-1">
                        {b.title}
                      </span>
                      <span className="text-[10px] text-priority-high font-mono font-bold bg-priority-high/15 px-1.5 py-0.5 rounded border border-priority-high/30">
                        {b.occurrences || 1}x
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted">
                      <span>{b.source?.toUpperCase() || 'SDK'} • {b.project}</span>
                      <span>{timeAgo(b.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
