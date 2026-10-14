// Wraps an async route handler so rejected promises reach Express's error handler
// instead of crashing the process or hanging the request.
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
