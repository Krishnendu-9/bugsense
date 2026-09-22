import { useState } from 'react';
import { Copy, Download, Check, X, ShieldAlert, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadFile } from '../../utils/helpers.js';

export default function PostMortemModal({ markdown, source, bugTitle, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!markdown) return null;

  const isTemplate = source === 'template';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success('Post-mortem markdown copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Clipboard access was blocked by the browser');
    }
  };

  const handleDownload = () => {
    downloadFile(markdown, `incident-postmortem-${Date.now()}.md`, 'text/markdown;charset=utf-8;');
    toast.success('Downloaded post-mortem markdown file');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Incident post-mortem">
      <div className="glass-card max-w-3xl w-full max-h-[85vh] flex flex-col border border-primary/30 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
              <ShieldAlert size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-text-base text-sm flex items-center gap-2">
                Engineering Incident Post-Mortem
              </h3>
              <p className="text-xs text-muted truncate max-w-md">{bugTitle || 'Incident Report'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-muted hover:text-text-base hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {isTemplate && (
          <div className="flex items-start gap-2 px-6 py-3 border-b border-white/10 bg-white/5 text-xs text-muted">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Template filled in from this incident&apos;s data — not written by AI. Sections marked
              &ldquo;to be completed&rdquo; need the incident owner.
            </span>
          </div>
        )}

        {/* Markdown Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 font-mono text-xs text-text-base leading-relaxed bg-[#0B0F19]">
          <pre className="whitespace-pre-wrap font-sans text-sm text-text-base leading-relaxed selection:bg-primary/30">
            {markdown}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-surface/30 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-muted">
            Format: GitHub-flavored Markdown (Compatible with Notion, Confluence, Jira)
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="btn-secondary text-xs px-3.5 py-1.5 flex items-center gap-1.5"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy MD'}
            </button>
            <button
              onClick={handleDownload}
              className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5"
            >
              <Download size={14} /> Download .md
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
