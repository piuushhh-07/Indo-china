const config = require('./config');
const createApp = require('./app');
const { pool } = require('./config/db');
const logger = require('./utils/logger');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`Indo China Restaurant server listening on port ${config.port} (${config.env})`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} is already in use. Stop the existing server or set PORT to another port.`);
  } else {
    logger.error('Could not start the HTTP server', error.message);
  }
  process.exit(1);
});

function shutdown(signal) {
  logger.info(`${signal} received; shutting down.`);
  server.close((error) => {
    if (error) {
      logger.error('Error while closing the HTTP server', error.message);
      process.exit(1);
      return;
    }
    pool.end()
      .then(() => process.exit(0))
      .catch((poolError) => {
        logger.error('Error while closing the PostgreSQL pool', poolError.message);
        process.exit(1);
      });
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
