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

    try {
      const bug = await createBug(bugData);

      if (screenshotFile) {
        try {
          await uploadScreenshot(bug._id, screenshotFile);
        } catch {
          toast.error('Bug saved but screenshot upload failed');
        }
      }

      if (bugData.errorLog?.trim()) {
        try {
          await analyze(bugData.errorLog, bugData.description, bug._id);
          toast.success('Bug reported with AI analysis!');
        } catch {
          toast.success('Bug reported successfully!');
        }
      } else {
        toast.success('Bug reported successfully!');
      }

      navigate(`/bugs/${bug._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit bug report');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-white/5 text-muted hover:text-text-base transition-colors duration-200"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Bug size={20} className="text-primary" />
            <h1 className="text-2xl font-bold text-text-base">Report a Bug</h1>
          </div>
          <p className="text-muted text-sm">Fill in the details below. AI will auto-analyze any error logs.</p>
        </div>
      </div>

      <div className="glass-card p-6">
        <BugForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  );
}
