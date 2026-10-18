import React from 'react';
import { AlertOctagon, RotateCcw, Home } from 'lucide-react';
import { reportClientError } from '../../utils/selfReport.js';

/**
 * variant="app" (default) replaces the whole screen and wraps the app root.
 * variant="page" renders inside the layout, so one crashing page leaves the
 * navigation usable; a new `resetKey` (the path) clears the error.
 * Either way the crash is reported to BugSense's own telemetry.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, reported: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught a runtime exception:', error, errorInfo);
    reportClientError(error, errorInfo?.componentStack).then((reported) => {
      if (reported) this.setState({ reported: true });
    });
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, reported: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = '/';
  };

  renderDetails() {
    const { error, reported } = this.state;
    return (
      <>
        {error && (
          <div className="text-left bg-track border border-hairline rounded-lg p-3.5 text-xs font-mono text-muted overflow-x-auto max-h-32">
            <span className="text-priority-high font-semibold">{error.toString()}</span>
          </div>
        )}
        {reported && (
          <p className="text-xs text-muted">This crash was reported to BugSense automatically.</p>
        )}
      </>
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.variant === 'page') {
      return (
        <div role="alert" className="glass-card max-w-lg mx-auto mt-10 p-8 text-center space-y-5 border border-priority-high/30">
          <div className="w-14 h-14 rounded-2xl bg-priority-high/10 border border-priority-high/30 flex items-center justify-center mx-auto text-priority-high">
            <AlertOctagon size={28} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-base mb-1">This page crashed</h1>
            <p className="text-sm text-muted">The rest of BugSense still works. Your data is safe.</p>
          </div>
          {this.renderDetails()}
          <div className="flex items-center justify-center gap-3">
            <button onClick={this.reset} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
              <RotateCcw size={15} /> Try Again
            </button>
            <button onClick={this.handleHome} className="btn-secondary flex items-center gap-2 text-sm px-4 py-2">
              <Home size={15} /> Dashboard
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background text-text-base flex items-center justify-center p-6">
        <div role="alert" className="glass-card max-w-lg w-full p-8 text-center space-y-6 relative overflow-hidden border border-priority-high/30 shadow-2xl">
          {/* Background ambient red glow */}
          <div className="absolute -top-16 -left-16 w-36 h-36 bg-priority-high/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-secondary/15 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-priority-high/10 border border-priority-high/30 flex items-center justify-center mx-auto text-priority-high">
            <AlertOctagon size={32} />
          </div>

          <div>
            <h1 className="text-xl font-bold text-text-base mb-1.5">Something unexpected happened</h1>
            <p className="text-sm text-muted">BugSense encountered an unexpected runtime state. Your data is safe.</p>
          </div>

          {this.renderDetails()}

          <div className="flex items-center justify-center gap-3 pt-2">
            <button onClick={this.handleReload} className="btn-primary flex items-center gap-2 text-sm px-4 py-2">
              <RotateCcw size={15} /> Reload Application
            </button>
            <button onClick={this.handleHome} className="btn-secondary flex items-center gap-2 text-sm px-4 py-2">
              <Home size={15} /> Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}
