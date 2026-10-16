export const isStaff = (user) => user?.role === 'admin' || user?.role === 'developer';

// Reporters may change the bugs they filed; developers and admins may change any.
export const canModifyBug = (user, bug) => {
  if (!user || !bug) return false;
  if (isStaff(user)) return true;
  const reporterId = bug.reporter?._id ?? bug.reporter;
  return Boolean(reporterId) && reporterId.toString() === user._id.toString();
};

// Moving a bug through the workflow (in progress, resolved) is triage, which
// belongs to staff. A reporter may only close their own bug ("no longer an
// issue") or reopen it after it was resolved or closed ("still broken").
export const canSetStatus = (user, bug, nextStatus) => {
  if (!canModifyBug(user, bug)) return false;
  if (isStaff(user) || nextStatus === bug.status) return true;
  if (nextStatus === 'closed') return true;
  if (nextStatus === 'open') return bug.status === 'resolved' || bug.status === 'closed';
  return false;
};
