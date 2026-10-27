import { lazy, Suspense, useRef, useState } from 'react';
import { ImagePlus, Pencil, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal.jsx';
import useBugs from '../../hooks/useBugs.js';
import { dataUrlToFile, getImageUrl } from '../../utils/helpers.js';
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../utils/constants.js';

// Fabric is large and only needed once the annotation dialog opens.
const AnnotationCanvas = lazy(() => import('./AnnotationCanvas.jsx'));

function AnnotationSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading annotation tools">
      <div className="skeleton h-9 w-2/3 rounded-lg" />
      <div className="skeleton h-[360px] w-full rounded-xl" />
    </div>
  );
}

/*
 * A bug's screenshot, annotated or not, with the controls to add one after
 * filing, replace it, and draw on it. `onChange` receives the image fields the
 * server returned, so the page shows them at once.
 */
export default function ScreenshotCard({ bug, canEdit, onChange }) {
  const { uploadScreenshot, uploadAnnotation } = useBugs();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [annotating, setAnnotating] = useState(false);
  const [savingAnnotation, setSavingAnnotation] = useState(false);

  const hasScreenshot = Boolean(bug.screenshot || bug.annotatedScreenshot);
  if (!hasScreenshot && !canEdit) return null;

  const chooseFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Screenshots must be PNG, JPG, GIF or WebP images');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Screenshot must be smaller than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fields = await uploadScreenshot(bug._id, file);
      onChange({ screenshot: fields.screenshot, annotatedScreenshot: fields.annotatedScreenshot || '' });
      toast.success(hasScreenshot ? 'Screenshot replaced' : 'Screenshot added');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload the screenshot');
    } finally {
      setUploading(false);
    }
  };

  const saveAnnotation = async (dataUrl) => {
    setSavingAnnotation(true);
    try {
      const file = await dataUrlToFile(dataUrl, `annotation-${Date.now()}.png`);
      const { annotatedScreenshot } = await uploadAnnotation(bug._id, file);
      onChange({ annotatedScreenshot });
      toast.success('Annotation saved');
      setAnnotating(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save annotation');
    } finally {
      setSavingAnnotation(false);
    }
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept={ALLOWED_IMAGE_TYPES.join(',')}
      className="hidden"
      onChange={chooseFile}
      aria-label="Choose a screenshot"
    />
  );

  if (!hasScreenshot) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-fg mb-3">Screenshot</h3>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full border-2 border-dashed border-border rounded-xl p-6 text-sm text-muted hover:border-accent/50 hover:bg-track transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <ImagePlus size={16} aria-hidden="true" />
          {uploading ? 'Uploading...' : 'Add a screenshot (PNG, JPG, GIF or WebP, up to 5MB)'}
        </button>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-fg">
          {bug.annotatedScreenshot ? 'Annotated Screenshot' : 'Screenshot'}
        </h3>
        {canEdit && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 disabled:opacity-60"
            >
              <Upload size={13} /> {uploading ? 'Uploading...' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={() => setAnnotating(true)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
            >
              <Pencil size={13} /> Annotate
            </button>
            {fileInput}
          </div>
        )}
      </div>
      <img
        src={getImageUrl(bug.annotatedScreenshot || bug.screenshot)}
        alt="Bug screenshot"
        className="rounded-lg max-w-full border border-border"
      />
      {bug.annotatedScreenshot && bug.screenshot && (
        <p className="text-xs text-muted mt-2">
          Showing annotated version.{' '}
          <a href={getImageUrl(bug.screenshot)} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            View original
          </a>
        </p>
      )}

      {annotating && (
        <Modal
          title="Annotate Screenshot"
          icon={Pencil}
          onClose={() => setAnnotating(false)}
          size="2xl"
          closeDisabled={savingAnnotation}
        >
          {savingAnnotation ? (
            <AnnotationSkeleton />
          ) : (
            <Suspense fallback={<AnnotationSkeleton />}>
              <AnnotationCanvas imageUrl={getImageUrl(bug.screenshot || bug.annotatedScreenshot)} onSave={saveAnnotation} />
            </Suspense>
          )}
        </Modal>
      )}
    </div>
  );
}
