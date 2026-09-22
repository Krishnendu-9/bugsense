import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug } from 'lucide-react';
import toast from 'react-hot-toast';
import BugForm from '../../components/bugs/BugForm.jsx';
import useBugs from '../../hooks/useBugs.js';
import useAI from '../../hooks/useAI.js';

export default function ReportBug() {
  const navigate = useNavigate();
  const { createBug, uploadScreenshot } = useBugs();
  const { analyze } = useAI();
  const [isLoading, setIsLoading] = useState(false);

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

    const problems = [];

    if (screenshotFile) {
      try {
        await uploadScreenshot(bug._id, screenshotFile);
      } catch (err) {
        problems.push(err.response?.data?.message || 'screenshot upload failed');
      }
    }

    let analysis = null;
    if (bugData.errorLog?.trim()) {
      // analyze() shows its own error toast and resolves to null on failure.
      analysis = await analyze(bugData.errorLog, bugData.description, bug._id);
    }

    if (problems.length) {
      toast.error(`Bug saved, but ${problems.join('; ')}`);
    } else if (analysis?.source === 'claude') {
      toast.success('Bug reported with AI analysis!');
    } else {
      toast.success('Bug reported successfully!');
    }

    if (bug.possibleDuplicateOf) {
      toast(`Looks similar to an existing report: "${bug.possibleDuplicateOf.title}"`, { icon: '🔁', duration: 6000 });
    }

    setIsLoading(false);
    navigate(`/bugs/${bug._id}`);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="p-2 rounded-lg hover:bg-white/5 text-muted hover:text-text-base transition-colors duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Bug size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-text-base">Report a Bug</h1>
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
