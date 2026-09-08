import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Upload, X, Monitor, Tag, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import StepsReproducer from './StepsReproducer.jsx';
import { PRIORITY_OPTIONS, STATUS_OPTIONS, SEVERITY_OPTIONS } from '../../utils/constants.js';
import { getBrowserInfo } from '../../utils/helpers.js';

export default function BugForm({ onSubmit, defaultValues = {}, isLoading = false }) {
  const [steps, setSteps] = useState(defaultValues.steps || []);
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(defaultValues.screenshot || null);
  const [isDragging, setIsDragging] = useState(false);
  const [tags, setTags] = useState(defaultValues.tags || []);
  const [tagInput, setTagInput] = useState('');

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm({
    defaultValues: {
      title: defaultValues.title || '',
      description: defaultValues.description || '',
      priority: defaultValues.priority || 'medium',
      status: defaultValues.status || 'open',
      severity: defaultValues.severity || 'minor',
      project: defaultValues.project || '',
      errorLog: defaultValues.errorLog || '',
      browserInfo: defaultValues.browserInfo || {},
    },
  });

  useEffect(() => {
    const info = getBrowserInfo();
    setValue('browserInfo', info);
  }, [setValue]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
    } else {
      toast.error('Only image files are allowed');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setScreenshotFile(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const removeTag = (tag) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
  };

  const onFormSubmit = (data) => {
    onSubmit({ ...data, steps, tags, screenshotFile });
  };

  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      ['code-block'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['clean'],
    ],
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      <div>
        <label className="label">
          Title <span className="text-priority-high">*</span>
        </label>
        <input
          {...register('title', { required: 'Title is required' })}
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
          rules={{ required: 'Description is required', validate: (v) => v !== '<p><br></p>' || 'Description is required' }}
          render={({ field }) => (
            <ReactQuill
              theme="snow"
              value={field.value}
              onChange={field.onChange}
              modules={quillModules}
              placeholder="Describe the bug in detail..."
            />
          )}
        />
        {errors.description && <p className="text-priority-high text-xs mt-1">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Priority</label>
          <select {...register('priority')} className="input-field">
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select {...register('status')} className="input-field">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Severity</label>
          <select {...register('severity')} className="input-field">
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Project</label>
        <input
          {...register('project')}
          className="input-field"
          placeholder="Project or component name..."
        />
      </div>

      <div>
        <label className="label flex items-center gap-2">
          <span>Steps to Reproduce</span>
          <span className="text-xs text-muted">(press Enter to add)</span>
        </label>
        <StepsReproducer value={steps} onChange={setSteps} />
      </div>

      <div>
        <label className="label flex items-center gap-2">
          <AlertTriangle size={14} />
          Error Log / Stack Trace
        </label>
        <textarea
          {...register('errorLog')}
          className="input-field font-mono text-xs resize-none"
          rows={5}
          placeholder="Paste your error message, stack trace, or console output here..."
        />
      </div>

      <div>
        <label className="label flex items-center gap-2">
          <Monitor size={14} />
          Browser Info
          <span className="text-xs text-muted">(auto-captured)</span>
        </label>
        <div className="p-3 rounded-lg bg-white/5 border border-border text-xs text-muted font-mono space-y-1">
          <p>OS: {navigator.platform}</p>
          <p>Screen: {window.screen.width}×{window.screen.height}</p>
          <p className="truncate">UA: {navigator.userAgent.slice(0, 80)}...</p>
        </div>
      </div>

      <div>
        <label className="label">Tags</label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              className="input-field flex-1 py-1.5 text-sm"
              placeholder="Add tag and press Enter..."
            />
            <button type="button" onClick={addTag} className="btn-secondary text-sm py-1.5 px-3">
              <Tag size={14} />
            </button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                  #{tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-priority-high transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="label">Screenshot</label>
        {screenshotPreview ? (
          <div className="relative rounded-xl overflow-hidden border border-border">
            <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-48 object-cover" />
            <button
              type="button"
              onClick={removeScreenshot}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-priority-high/80 text-white hover:bg-priority-high transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 cursor-pointer ${
              isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-white/3'
            }`}
            onClick={() => document.getElementById('screenshot-upload').click()}
          >
            <Upload size={24} className="mx-auto text-muted mb-2" />
            <p className="text-sm text-muted">Drag & drop screenshot or <span className="text-primary">browse</span></p>
            <p className="text-xs text-muted mt-1">PNG, JPG, GIF up to 5MB</p>
            <input
              id="screenshot-upload"
              type="file"
              accept="image/*"
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
        <button type="submit" disabled={isLoading} className="btn-primary min-w-[120px]">
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting...
            </span>
          ) : (
            'Submit Bug'
          )}
        </button>
      </div>
    </form>
  );
}
