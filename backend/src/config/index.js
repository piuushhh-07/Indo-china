require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

module.exports = {
  env: required('NODE_ENV', 'development'),
  port: parseInt(required('PORT', '3000'), 10),
  appBaseUrl: required('APP_BASE_URL', 'http://localhost:3000'),

  database: {
    url: required('DATABASE_URL'),
    ssl: required('DATABASE_SSL', 'false') === 'true'
  },

  session: {
    secret: required('SESSION_SECRET'),
    cookieName: required('SESSION_COOKIE_NAME', 'ics_session'),
    maxAgeMs: parseInt(required('SESSION_MAX_AGE_MS', String(7 * 24 * 60 * 60 * 1000)), 10)
  },

  corsOrigin: required('CORS_ORIGIN', 'http://localhost:3000'),

  razorpay: {
    keyId: required('RAZORPAY_KEY_ID', ''),
    keySecret: required('RAZORPAY_KEY_SECRET', ''),
    webhookSecret: required('RAZORPAY_WEBHOOK_SECRET', ''),
    get enabled() {
      return Boolean(this.keyId && this.keySecret);
    }
  },

  rateLimit: {
    windowMs: parseInt(required('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    max: parseInt(required('RATE_LIMIT_MAX', '100'), 10)
  }
};
