const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const config = require('./config');
const { pool } = require('./config/db');
const { attachUser } = require('./middleware/auth');
const { general: generalLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const menuRoutes = require('./routes/menu.routes');
const cartRoutes = require('./routes/cart.routes');
const ordersRoutes = require('./routes/orders.routes');
const paymentsRoutes = require('./routes/payments.routes');
const reservationsRoutes = require('./routes/reservations.routes');
const contactRoutes = require('./routes/contact.routes');
const settingsRoutes = require('./routes/settings.routes');
const adminRoutes = require('./routes/admin.routes');
const healthRoutes = require('./routes/health.routes');
const reviewsRoutes = require('./routes/reviews.routes');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('sessionCookieName', config.session.cookieName);
  app.set('trust proxy', 1); // needed for secure cookies behind a reverse proxy / load balancer

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 'unsafe-inline' is required because each page's page-specific logic is an inline
        // <script> block (no build step for this vanilla frontend). This is a known
        // tradeoff — see docs/PRE_LAUNCH_CHECKLIST.md for the nonce-based tightening
        // recommended before a public launch.
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
        frameSrc: ["'self'", 'https://api.razorpay.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https://api.razorpay.com']
      }
    }
  }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));

  // This endpoint checks server responsiveness only; it does not check database health.
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Razorpay webhook needs the exact raw bytes for HMAC verification, so it's
  // parsed as raw *before* the general json() parser touches the body.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
    req.rawBody = req.body;
    try { req.body = JSON.parse(req.body.toString('utf8')); } catch { req.body = {}; }
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(generalLimiter);

  app.use(session({
    store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.env === 'production',
      maxAge: config.session.maxAgeMs
    }
  }));
  app.use(attachUser);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/menu', menuRoutes);
  app.use('/api/cart', cartRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/reservations', reservationsRoutes);
  app.use('/api/contact', contactRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/reviews', reviewsRoutes);
  app.use('/api/admin', adminRoutes);

  // Serve the static frontend (vanilla HTML/CSS/JS) from the same origin as the API.
  app.use(express.static(FRONTEND_DIR, { extensions: ['html'] }));
  app.use('/admin', express.static(path.join(FRONTEND_DIR, 'admin')));

  app.use('/api', notFoundHandler);
  app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html'));
  });

  app.use(errorHandler);
  return app;
}

module.exports = createApp;
