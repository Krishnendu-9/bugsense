export const isStaff = (user) => user?.role === 'admin' || user?.role === 'developer';

// Reporters may change the bugs they filed; developers and admins may change any.
export const canModifyBug = (user, bug) => {
  if (!user || !bug) return false;
  if (isStaff(user)) return true;
  const reporterId = bug.reporter?._id ?? bug.reporter;
  return Boolean(reporterId) && reporterId.toString() === user._id.toString();
};
