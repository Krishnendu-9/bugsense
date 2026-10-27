import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import BugForm from '../../components/bugs/BugForm.jsx';
import useBugs from '../../hooks/useBugs.js';

export default function ReportBug() {
  const navigate = useNavigate();
  const location = useLocation();
  const { createBug, uploadScreenshot } = useBugs();
  const [isLoading, setIsLoading] = useState(false);

  const showPossibleDuplicate = ({ _id, title }) => {
    toast(
      (t) => (
        <span className="flex items-center gap-2 text-sm">
          <Copy size={14} className="flex-shrink-0 text-accent" />
          <span>
            Looks similar to &ldquo;{title}&rdquo;.{' '}
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                navigate(`/bugs/${_id}`);
              }}
              className="text-accent hover:underline font-medium"
            >
              View it
            </button>
          </span>
        </span>
      ),
      { duration: 8000 }
    );
  };

  const handleSubmit = async (formData) => {
    setIsLoading(true);
    const { screenshotFile, ...bugData } = formData;

    let bug;
    try {
      bug = await createBug(bugData);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit bug report');
      setIsLoading(false);
      return;
    }

    let screenshotError = null;
    if (screenshotFile) {
      try {
        await uploadScreenshot(bug._id, screenshotFile);
      } catch (err) {
        screenshotError = err.response?.data?.message || 'screenshot upload failed';
      }
    }

    if (screenshotError) {
      toast.error(`Bug saved, but ${screenshotError}`);
    } else {
      toast.success(bug.analysisQueued ? 'Bug reported. Analyzing the error log…' : 'Bug reported successfully!');
    }
    if (bug.possibleDuplicateOf) showPossibleDuplicate(bug.possibleDuplicateOf);

    setIsLoading(false);
    // The server analyses the error log in the background; the bug page shows
    // a pending state until the result arrives over the socket.
    navigate(`/bugs/${bug._id}`, { state: { analysisPending: Boolean(bug.analysisQueued) } });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          // Opened directly (a bookmark, a new tab) there is no in-app page to
          // return to, and Back would leave BugSense.
          onClick={() => (location.key === 'default' ? navigate('/dashboard') : navigate(-1))}
          aria-label="Go back"
          className="p-2 rounded-lg hover:bg-track text-muted hover:text-fg transition-colors duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Bug size={20} className="text-accent" />
            <h1 className="text-2xl font-bold text-fg">Report a bug</h1>
          </div>
          <p className="text-muted text-sm">Fill in the details below. Any error log is analyzed automatically.</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <BugForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  );
}
