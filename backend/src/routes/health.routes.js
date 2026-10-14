const express = require('express');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/live', (req, res) => res.json({ status: 'ok' }));

router.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (error) {
    logger.warn('PostgreSQL readiness check failed', error.message);
    res.status(503).json({ status: 'error', db: 'unreachable' });
  }
});

module.exports = router;
