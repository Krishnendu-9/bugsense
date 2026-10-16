import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal.jsx';

// In-app replacement for window.confirm: styled like the rest of the app,
// keyboard accessible, and it stays open (and disabled) while `onConfirm`
// runs, so the action cannot be triggered twice.
export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      icon={AlertTriangle}
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary text-sm" data-autofocus>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={`${danger ? 'btn-danger' : 'btn-primary'} text-sm disabled:opacity-60`}>
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-sm text-muted leading-relaxed">{message}</p>
    </Modal>
  );
}
