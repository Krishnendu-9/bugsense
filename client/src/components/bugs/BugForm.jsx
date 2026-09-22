import { useState, useEffect, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Upload, X, Monitor, Tag, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import StepsReproducer from './StepsReproducer.jsx';
import useAuth from '../../hooks/useAuth.js';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, SEVERITY_OPTIONS } from '../../utils/constants.js';
import { getBrowserInfo, isStaff, stripHtml } from '../../utils/helpers.js';

// Mirrors the server's upload rules so users get immediate feedback.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    ['code-block', 'link'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
};

export default function BugForm({ onSubmit, defaultValues = {}, isLoading = false }) {
  const { user } = useAuth();
  const staff = isStaff(user);
  const fileInputRef = useRef(null);
  const [steps, setSteps] = useState(defaultValues.steps || []);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(defaultValues.screenshot || null);
  const [isDragging, setIsDragging] = useState(false);
  const [tags, setTags] = useState(defaultValues.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [browserInfo] = useState(getBrowserInfo);

  const { register, handleSubmit, control, formState: { errors } } = useForm({
    defaultValues: {
      title: defaultValues.title || '',
      description: defaultValues.description || '',
      priority: defaultValues.priority || 'medium',
      status: defaultValues.status || 'open',
      severity: defaultValues.severity || 'minor',
      project: defaultValues.project || '',
      errorLog: defaultValues.errorLog || '',
    },
  });

  // Object URLs hold the file in memory until revoked.
  useEffect(() => {
    if (!screenshotPreview?.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(screenshotPreview);
  }, [screenshotPreview]);

  const acceptFile = (file) => {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Screenshots must be PNG, JPG, GIF or WebP images');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Screenshot must be smaller than 5MB');
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e) => {
    acceptFile(e.target.files[0]);
    e.target.value = '';
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  };

  const onFormSubmit = (data) => {
    const payload = { ...data, steps: steps.map((s) => s.trim()).filter(Boolean), tags, browserInfo };
    // Triage fields are the team's call; the API ignores them from reporters.
    if (!staff) delete payload.status;
    onSubmit({ ...payload, screenshotFile });
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div>
        <label className="label" htmlFor="bug-title">
          Title <span className="text-priority-high">*</span>
        </label>
        <input
          id="bug-title"
          {...register('title', {
            required: 'Title is required',
            validate: (v) => v.trim().length > 0 || 'Title is required',
            maxLength: { value: 200, message: 'Title cannot exceed 200 characters' },
          })}
          className="input-field"
          placeholder="Brief description of the bug..."
        />
        {errors.title && <p className="text-priority-high text-xs mt-1">{errors.title.message}</p>}
      </div>

      <div>
        <label className="label">
          Description <span className="text-priority-high">*</span>
        </label>
        <Controller
          name="description"
          control={control}
          rules={{
            validate: (v) => stripHtml(v).trim().length > 0 || 'Description is required',
          }}
          render={({ field }) => (
            <ReactQuill
              theme="snow"
              value={field.value}
              onChange={field.onChange}
              modules={QUILL_MODULES}
              placeholder="Describe the bug in detail..."
            />
          )}
        />
        {errors.description && <p className="text-priority-high text-xs mt-1">{errors.description.message}</p>}
      </div>

      <div className={`grid grid-cols-1 gap-4 ${staff ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div>
          <label className="label" htmlFor="bug-priority">Priority</label>
          <select id="bug-priority" {...register('priority')} className="input-field">
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {staff && (
          <div>
            <label className="label" htmlFor="bug-status">Status</label>
            <select id="bug-status" {...register('status')} className="input-field">
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="bug-severity">Severity</label>
          <select id="bug-severity" {...register('severity')} className="input-field">
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="bug-project">Project</label>
        <input
          id="bug-project"
          {...register('project')}
          className="input-field"
          placeholder="Project or component name..."
        />
      </div>

      <div>
        <label className="label flex items-center gap-2">
          <span>Steps to Reproduce</span>
          <span className="text-xs text-muted normal-case tracking-normal font-normal">(press Enter to add)</span>
        </label>
        <StepsReproducer value={steps} onChange={setSteps} />
      </div>

      <div>
        <label className="label flex items-center gap-2" htmlFor="bug-errorlog">
          <AlertTriangle size={14} />
          Error Log / Stack Trace
        </label>
        <textarea
          id="bug-errorlog"
          {...register('errorLog')}
          className="input-field font-mono text-xs resize-y"
          rows={5}
          placeholder="Paste your error message, stack trace, or console output here..."
        />
      </div>

      <div>
        <p className="label flex items-center gap-2">
          <Monitor size={14} />
          Browser Info
          <span className="text-xs text-muted normal-case tracking-normal font-normal">(auto-captured)</span>
        </p>
        <div className="p-3 rounded-lg bg-white/5 border border-border text-xs text-muted font-mono space-y-1">
          <p>Browser: {browserInfo.browser} {browserInfo.version}</p>
          <p>OS: {browserInfo.os}</p>
          <p>Screen: {browserInfo.screenSize}</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="bug-tag">Tags</label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              id="bug-tag"
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              maxLength={40}
              className="input-field flex-1 py-1.5 text-sm"
              placeholder="Add tag and press Enter..."
            />
            <button type="button" onClick={addTag} aria-label="Add tag" className="btn-secondary text-sm py-1.5 px-3">
              <Tag size={14} />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="hover:text-priority-high transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="label">Screenshot</p>
        {screenshotPreview ? (
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-48 object-cover" />
            <button
              type="button"
              onClick={removeScreenshot}
              aria-label="Remove screenshot"
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-priority-high/80 text-white hover:bg-priority-high transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a screenshot"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-white/[0.03]'
            }`}
          >
            <Upload size={24} className="mx-auto text-muted mb-2" />
            <p className="text-sm text-muted">Drag & drop screenshot or <span className="text-primary">browse</span></p>
            <p className="text-xs text-muted mt-1">PNG, JPG, GIF or WebP up to 5MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button type="button" onClick={() => window.history.back()} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isLoading} className="btn-primary min-w-[120px] disabled:opacity-70">
          {isLoading ? 'Submitting...' : 'Submit Bug'}
        </button>
      </div>
    </form>
  );
}
