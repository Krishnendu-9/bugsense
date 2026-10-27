import { useState } from 'react';
import { Copy, Download, Check, ShieldAlert, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
import { downloadFile } from '../../utils/helpers.js';
import MarkdownView from './MarkdownView.jsx';

export default function PostMortemModal({ markdown, source, bugTitle, onClose }) {
  const [copied, setCopied] = useState(false);
  // Rendered by default; the source is one click away, as it is what gets
  // copied or downloaded.
  const [view, setView] = useState('preview');

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
    <Modal
      title="Incident post-mortem"
      subtitle={bugTitle || 'Untitled bug'}
      icon={ShieldAlert}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <span className="text-xs text-muted">
            Format: GitHub-flavored Markdown (Compatible with Notion, Confluence, Jira)
          </span>
          <div className="flex gap-2">
            <button onClick={handleCopy} className="btn-secondary text-xs px-3.5 py-1.5 flex items-center gap-1.5">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy MD'}
            </button>
            <button onClick={handleDownload} className="btn-primary text-xs px-3.5 py-1.5 flex items-center gap-1.5">
              <Download size={14} /> Download .md
            </button>
          </div>
        </>
      }
    >
      {isTemplate && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-track border border-border text-xs text-muted">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Template filled in from this bug&apos;s data — not written by AI. Sections marked
            &ldquo;to be completed&rdquo; need filling in by whoever fixed it.
          </span>
        </div>
      )}
      <div className="flex justify-end mb-2">
        {/* The same segmented switch as List / Board: the current option is bg-track. */}
        <div role="group" aria-label="Post-mortem view" className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {[['preview', 'Preview'], ['markdown', 'Markdown']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`px-2.5 py-1 rounded-md transition-colors duration-200 ${view === value ? 'bg-track text-fg' : 'text-muted hover:text-fg'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-canvas rounded-xl p-5 border border-hairline selection:bg-accent/30">
        {view === 'preview' ? (
          <MarkdownView markdown={markdown} />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs text-fg leading-relaxed">{markdown}</pre>
        )}
      </div>
    </Modal>
  );
}
