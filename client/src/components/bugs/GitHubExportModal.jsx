import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Github } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
import api from '../../api/axios.js';

const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

// Files a bug as a GitHub issue. The server's token only works for the
// repositories it lists (GITHUB_ALLOWED_REPOS); anything else needs the
// user's own token, which is sent for this one request and never stored.
export default function GitHubExportModal({ bugId, onClose, onExported }) {
  const [serverRepos, setServerRepos] = useState([]);
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { repoOwner: '', repoName: '', githubToken: '' },
  });

  useEffect(() => {
    let cancelled = false;
    api.get('/bugs/github-config')
      .then((res) => { if (!cancelled) setServerRepos(res.data.repos || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const pickRepo = (fullName) => {
    const [owner, name] = fullName.split('/');
    setValue('repoOwner', owner, { shouldValidate: true });
    setValue('repoName', name, { shouldValidate: true });
  };

  const onSubmit = async ({ repoOwner, repoName, githubToken }) => {
    try {
      const res = await api.post(`/bugs/${bugId}/github`, {
        repoOwner: repoOwner.trim(),
        repoName: repoName.trim(),
        githubToken: githubToken || undefined,
      });
      toast.success('Successfully converted to GitHub Issue!');
      onExported(res.data.githubIssue);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export to GitHub');
    }
  };

  return (
    <Modal
      title="Export to GitHub Issue"
      subtitle="Steps, error log and diagnosis are attached"
      icon={Github}
      onClose={onClose}
      closeDisabled={isSubmitting}
    >
      <form id="github-export-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        {serverRepos.length > 0 && (
          <div>
            <p className="label text-xs">Repositories enabled on this server</p>
            <div className="flex flex-wrap gap-1.5">
              {serverRepos.map((repo) => (
                <button
                  key={repo}
                  type="button"
                  onClick={() => pickRepo(repo)}
                  className="px-2.5 py-1 rounded-lg text-xs bg-track border border-border text-muted hover:text-fg hover:border-accent/40 transition-colors duration-200"
                >
                  {repo}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="label text-xs" htmlFor="gh-owner">Repository Owner</label>
          <input
            id="gh-owner"
            data-autofocus
            {...register('repoOwner', {
              required: 'Owner is required',
              pattern: { value: OWNER_PATTERN, message: 'Letters, numbers and dashes only' },
            })}
            placeholder="e.g. facebook or your-username"
            className="input-field text-sm"
          />
          {errors.repoOwner && <p className="text-priority-high text-xs mt-1">{errors.repoOwner.message}</p>}
        </div>
        <div>
          <label className="label text-xs" htmlFor="gh-repo">Repository Name</label>
          <input
            id="gh-repo"
            {...register('repoName', {
              required: 'Repository is required',
              pattern: { value: REPO_PATTERN, message: 'Letters, numbers, dots, dashes and underscores only' },
            })}
            placeholder="e.g. react or my-app"
            className="input-field text-sm"
          />
          {errors.repoName && <p className="text-priority-high text-xs mt-1">{errors.repoName.message}</p>}
        </div>
        <div>
          <label className="label text-xs" htmlFor="gh-token">
            Personal Access Token {serverRepos.length > 0 ? '(not needed for the repositories above)' : ''}
          </label>
          <input
            id="gh-token"
            type="password"
            autoComplete="off"
            {...register('githubToken')}
            placeholder="ghp_..."
            className="input-field text-sm font-mono"
          />
          <p className="text-[11px] text-muted mt-1">Sent once to the BugSense server for this request and not stored.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="btn-secondary text-xs">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="btn-primary text-xs flex items-center gap-1.5">
            {isSubmitting ? 'Exporting...' : 'Create GitHub Issue'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
