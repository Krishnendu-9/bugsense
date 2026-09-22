import multer from 'multer';
import mongoose from 'mongoose';

export const notFound = (req, res, next) => {
  const error = new Error(`Not found — ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Translates known library errors into client-facing status codes so that bad
// input is reported as 4xx instead of an opaque 500.
const classify = (err) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return { status: 413, message: 'File is too large — the limit is 5MB' };
    return { status: 400, message: err.message };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, message: `Invalid value for ${err.path}` };
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const first = Object.values(err.errors)[0];
    return { status: 400, message: first?.message || 'Validation failed' };
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return { status: 409, message: field === 'email' ? 'Email already in use' : 'Duplicate record' };
  }
  if (err?.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large' };
  }
  if (err?.type === 'entity.parse.failed') {
    return { status: 400, message: 'Malformed JSON body' };
  }
  if (err?.statusCode) {
    return { status: err.statusCode, message: err.message };
  }
  return null;
};

export const errorHandler = (err, _req, res, _next) => {
  const known = classify(err);
  const status = known?.status || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (status >= 500) console.error(err);

  res.status(status).json({
    // Internal error details are only exposed outside production.
    message: known?.message || (isProduction ? 'Internal server error' : err.message),
    stack: isProduction ? undefined : err.stack,
  });
};
