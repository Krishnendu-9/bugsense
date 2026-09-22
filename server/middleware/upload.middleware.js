import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { UPLOADS_DIR } from '../utils/uploads.js';

const ALLOWED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    // The extension comes from the validated MIME type, never from the
    // client-supplied file name.
    cb(null, `${uniqueSuffix}${ALLOWED_TYPES[file.mimetype][0]}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedExts = ALLOWED_TYPES[file.mimetype];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts && (allowedExts.includes(ext) || ext === '')) return cb(null, true);

  const err = new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)');
  err.statusCode = 400;
  cb(err);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

export default upload;
