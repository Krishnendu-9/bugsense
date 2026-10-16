import { useState } from 'react';
import { Copy, Download, Check, ShieldAlert, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
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
    <Modal
      title="Engineering Incident Post-Mortem"
      subtitle={bugTitle || 'Incident Report'}
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
        <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-white/5 border border-white/10 text-xs text-muted">
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Template filled in from this incident&apos;s data — not written by AI. Sections marked
            &ldquo;to be completed&rdquo; need the incident owner.
          </span>
        </div>
      )}
      <pre className="whitespace-pre-wrap font-sans text-sm text-text-base leading-relaxed bg-[#0B0F19] rounded-xl p-5 border border-white/5 selection:bg-primary/30">
        {markdown}
      </pre>
    </Modal>
  );
}
