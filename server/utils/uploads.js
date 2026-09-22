import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Deletes a file previously stored by Multer, given the public URL saved on a
// document (e.g. "/uploads/123.png"). Anything that does not resolve inside the
// uploads directory is ignored, so a crafted value can never delete other files.
export const removeUpload = async (publicUrl) => {
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) return;

  const filePath = path.resolve(UPLOADS_DIR, path.basename(publicUrl));
  if (!filePath.startsWith(UPLOADS_DIR + path.sep)) return;

  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('Upload cleanup failed (non-fatal):', err.message);
  }
};
