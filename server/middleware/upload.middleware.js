import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { UPLOADS_DIR, removeUpload } from '../utils/uploads.js';

const ALLOWED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

// The first bytes each allowed format starts with. The MIME type and file
// name are chosen by the client, so they alone prove nothing about the file.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/gif': (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Files are served publicly at /uploads/<name>, so the name must not be
    // guessable. The extension comes from the validated MIME type, never from
    // the client-supplied file name.
    cb(null, `${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype][0]}`);
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

/**
 * Runs after upload.single(): rejects a stored file whose content is not the
 * image format it claimed to be, and deletes it. Without this, any bytes
 * labelled image/png would be kept and served.
 */
export const verifyImageContent = async (req, res, next) => {
  if (!req.file) return next();
  try {
    const handle = await fs.promises.open(req.file.path, 'r');
    const head = Buffer.alloc(12);
    try {
      await handle.read(head, 0, 12, 0);
    } finally {
      await handle.close();
    }
    if (SIGNATURES[req.file.mimetype]?.(head)) return next();
  } catch {
    // An unreadable file is treated the same as a wrong one.
  }
  await removeUpload(`/uploads/${req.file.filename}`);
  return res.status(400).json({ message: 'The file is not a valid PNG, JPG, GIF or WebP image' });
};

export default upload;
