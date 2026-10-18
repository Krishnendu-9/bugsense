import { broadcast } from '../config/socket.js';
import { topFrameOf } from '../utils/fingerprint.util.js';

// The shape every client receives for a bug on its detail page, whether from
// GET /bugs/:id or a socket event. Sending the same fully-populated document
// means a listener can replace its copy without losing names, avatars or
// history.
export const BUG_POPULATE = [
  { path: 'reporter', select: 'name email avatar' },
  { path: 'assignedTo', select: 'name email avatar' },
  { path: 'statusHistory.changedBy', select: 'name avatar' },
];

// Heavy per-bug fields the list views (bug list, Kanban, dashboard) never
// render. GET /bugs leaves them out, and so do events broadcast to everyone:
// a crash loop re-sends its bug on every occurrence, and each copy would
// otherwise carry the error log and breadcrumbs to every connected client.
export const LIST_EXCLUDED_FIELDS = ['breadcrumbs', 'gitPatch', 'statusHistory', 'aiInsights', 'errorLog', 'browserInfo'];

export const populateBug = (bug) => bug.populate(BUG_POPULATE);

// The one list-row shape, used by GET /bugs and by broadcast events alike, so a
// row updated over the socket looks the same as one fetched with the page.
// SDK rows carry their top stack frame (a single line) in place of the error
// log it was cut from.
export const toListPayload = (bug) => {
  const payload = typeof bug.toObject === 'function' ? bug.toObject() : { ...bug };
  payload.topFrame = payload.source === 'sdk' ? topFrameOf(payload.errorLog) : null;
  for (const field of LIST_EXCLUDED_FIELDS) delete payload[field];
  return payload;
};

export const emitBugCreated = async (bug) => {
  await populateBug(bug);
  broadcast('bug:created', toListPayload(bug));
};

// List views get the slim copy; only clients viewing this bug (its room)
// get the full document.
export const emitBugUpdated = async (bug) => {
  await populateBug(bug);
  broadcast('bug:updated', toListPayload(bug));
  broadcast('bug:detail:updated', bug, `bug:${bug._id}`);
};

export const emitBugDeleted = (bugId) => {
  broadcast('bug:deleted', { _id: bugId.toString() });
};
