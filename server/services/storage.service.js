import { v2 as cloudinary } from 'cloudinary';
import { removeUpload } from '../utils/uploads.js';

// Uploads live on local disk by default, which needs no configuration but is
// wiped on every redeploy by hosts like Render and Railway. Setting
// CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) moves them to
// Cloudinary instead. Multer always writes to disk first, so file validation
// is identical in both modes.
const folder = () => process.env.CLOUDINARY_FOLDER || 'bugsense';

export const isCloudStorage = () => Boolean(process.env.CLOUDINARY_URL);

// The SDK parses CLOUDINARY_URL on its first config() call and caches it, so
// the config is re-read whenever the variable differs from what was parsed.
let configuredFrom;
const configureCloudinary = () => {
  if (configuredFrom === process.env.CLOUDINARY_URL) return;
  cloudinary.config(true);
  cloudinary.config({ secure: true });
  configuredFrom = process.env.CLOUDINARY_URL;
};

const ownCloudName = () => {
  try {
    configureCloudinary();
    return cloudinary.config().cloud_name || null;
  } catch {
    return null;
  }
};

const storageError = (message) => {
  const err = new Error(message);
  err.statusCode = 502;
  return err;
};

/**
 * Persists a file Multer just stored and returns the URL to save on the
 * document: "/uploads/<name>" locally, or the Cloudinary https URL.
 */
export const storeUpload = async (file) => {
  const localUrl = `/uploads/${file.filename}`;
  if (!isCloudStorage()) return localUrl;

  try {
    configureCloudinary();
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder(),
      resource_type: 'image',
      overwrite: false,
    });
    return result.secure_url;
  } catch (err) {
    console.error('Cloudinary upload failed:', err.message);
    throw storageError('Image storage is unavailable right now. Please try again.');
  } finally {
    await removeUpload(localUrl);
  }
};

// Maps a Cloudinary delivery URL back to its public id, but only for images
// inside our own cloud and folder, so a stored URL can never be used to
// delete someone else's asset.
export const cloudinaryPublicId = (url) => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return null;

  const match = parsed.pathname.match(/^\/([^/]+)\/image\/upload\/(?:v\d+\/)?(.+)\.[A-Za-z0-9]+$/);
  if (!match) return null;

  const [, cloudName, publicId] = match;
  if (!isCloudStorage() || cloudName !== ownCloudName()) return null;
  if (!publicId.startsWith(`${folder()}/`)) return null;
  return publicId;
};

// Removes a previously stored file, wherever it lives. Failures are logged,
// never thrown: a leftover file must not fail the request that replaced it.
export const removeStoredFile = async (url) => {
  if (typeof url !== 'string' || !url) return;
  if (url.startsWith('/uploads/')) {
    await removeUpload(url);
    return;
  }

  const publicId = cloudinaryPublicId(url);
  if (!publicId) return;
  try {
    configureCloudinary();
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    console.warn('Cloudinary cleanup failed (non-fatal):', err.message);
  }
};
