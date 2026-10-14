const { AppError } = require('./errorHandler');

// Populates req.user from the session (set at login). Does NOT reject if absent —
// use requireAuth / requireRole to enforce that on specific routes, so public
// routes can still optionally read req.user (e.g. "is this customer logged in?").
function attachUser(req, res, next) {
  req.user = req.session && req.session.user ? req.session.user : null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new AppError('Authentication required', 401));
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to do that', 403));
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
