const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Centralized error handler. Never leaks stack traces, raw DB errors, or credentials
// to the client — those go to the server log only.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, err);
  } else {
    logger.warn(`${req.method} ${req.originalUrl}`, err.message);
  }

  const body = { error: statusCode >= 500 ? 'Internal server error' : err.message };
  if (err.details) body.details = err.details;
  res.status(statusCode).json(body);
}

module.exports = { AppError, notFoundHandler, errorHandler };
