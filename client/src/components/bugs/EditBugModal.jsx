import { useState } from 'react';
import { FileEdit } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
import BugForm from './BugForm.jsx';

// Edits what a bug says (title, description, steps, tags, severity, project,
// error log). Triage fields live in the Triage panel on the bug page.
export default function EditBugModal({ bug, onSave, onClose }) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (content) => {
    setSaving(true);
    try {
      await onSave(content);
      toast.success('Bug details updated');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update bug');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Edit Bug Details" subtitle={bug.title} icon={FileEdit} onClose={onClose} size="xl" closeDisabled={saving}>
      <BugForm
        mode="edit"
        defaultValues={{
          title: bug.title,
          description: bug.description,
          severity: bug.severity,
          project: bug.project,
          errorLog: bug.errorLog,
          steps: bug.steps,
          tags: bug.tags,
        }}
        onSubmit={handleSubmit}
        onCancel={onClose}
        isLoading={saving}
        descriptionRequired={bug.source !== 'sdk'}
      />
    </Modal>
  );
}
