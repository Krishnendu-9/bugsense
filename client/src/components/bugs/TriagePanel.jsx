import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Check } from 'lucide-react';
import api from '../../api/axios.js';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/constants.js';

/*
 * Status (and, for staff, priority and assignee) for one bug. A reporter only
 * sees the statuses they may move their own bug to: close it, or reopen it.
 * `onSave` receives the form values and resolves once the change is saved.
 */
export default function TriagePanel({ bug, staff, allowedStatuses, onSave }) {
  const [assignees, setAssignees] = useState([]);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      status: bug.status,
      statusNote: '',
      ...(staff ? { priority: bug.priority, assignedTo: bug.assignedTo?._id || '' } : {}),
    },
  });

  useEffect(() => {
    if (!staff) return undefined;
    let cancelled = false;
    api.get('/users/assignable')
      .then((res) => { if (!cancelled) setAssignees(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [staff]);

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-fg mb-1">{staff ? 'Triage' : 'Update Status'}</h3>
      {!staff && (
        <p className="text-xs text-muted mb-4">
          You can close your bug if it no longer happens, or reopen it if it came back. The team handles the rest of the workflow.
        </p>
      )}
      <form onSubmit={handleSubmit(onSave)} className={`flex flex-wrap gap-3 items-end ${staff ? 'mt-3' : ''}`}>
        <div>
          <label className="label" htmlFor="edit-status">Status</label>
          <select id="edit-status" {...register('status')} className="input-field py-1.5 text-sm">
            {STATUS_OPTIONS.filter((opt) => allowedStatuses.includes(opt.value)).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {staff && (
          <div>
            <label className="label" htmlFor="edit-priority">Priority</label>
            <select id="edit-priority" {...register('priority')} className="input-field py-1.5 text-sm">
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        {staff && (
          <div>
            <label className="label" htmlFor="edit-assignee">Assignee</label>
            <select id="edit-assignee" {...register('assignedTo')} className="input-field py-1.5 text-sm min-w-[160px]">
              <option value="">Unassigned</option>
              {/* Keep the current assignee selectable while the list loads. */}
              {bug.assignedTo && !assignees.some((a) => a._id === bug.assignedTo._id) && (
                <option value={bug.assignedTo._id}>{bug.assignedTo.name}</option>
              )}
              {assignees.map((a) => (
                <option key={a._id} value={a._id}>{a.name} ({a.role})</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1 min-w-[180px]">
          <label className="label" htmlFor="edit-note">Status Note (optional)</label>
          <input id="edit-note" {...register('statusNote')} maxLength={500} className="input-field py-1.5 text-sm" placeholder="Reason for change..." />
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 disabled:opacity-60">
          <Check size={14} /> {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
