// Deliberately tiny — swap for pino/winston later without touching call sites.
const level = process.env.LOG_LEVEL || 'info';
function ts() {
  return new Date().toISOString();
}
module.exports = {
  info: (...args) => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args) => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args) => console.error(`[${ts()}] ERROR`, ...args),
  debug: (...args) => { if (level === 'debug') console.log(`[${ts()}] DEBUG`, ...args); }
};
