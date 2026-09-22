import { broadcast } from '../config/socket.js';

// The shape every client receives for a bug, whether from GET /bugs/:id or a
// socket event. Sending the same fully-populated document everywhere means a
// listener can replace its copy without losing names, avatars or history.
export const BUG_POPULATE = [
  { path: 'reporter', select: 'name email avatar' },
  { path: 'assignedTo', select: 'name email avatar' },
  { path: 'statusHistory.changedBy', select: 'name avatar' },
];

export const populateBug = (bug) => bug.populate(BUG_POPULATE);

export const emitBugCreated = async (bug) => {
  await populateBug(bug);
  broadcast('bug:created', bug);
};

export const emitBugUpdated = async (bug) => {
  await populateBug(bug);
  broadcast('bug:updated', bug);
  broadcast('bug:detail:updated', bug, `bug:${bug._id}`);
};

export const emitBugDeleted = (bugId) => {
  broadcast('bug:deleted', { _id: bugId.toString() });
};
