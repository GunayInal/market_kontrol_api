const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const currentLevel = LOG_LEVELS.DEBUG;

function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, levelName, message) {
  if (level <= currentLevel) {
    const timestamp = formatTimestamp();
    const prefix = `[${timestamp}] [${levelName}]`;
    console.log(`${prefix} ${message}`);
  }
}

module.exports = {
  error: (message) => log(LOG_LEVELS.ERROR, 'ERROR', message),
  warn: (message) => log(LOG_LEVELS.WARN, 'WARN', message),
  info: (message) => log(LOG_LEVELS.INFO, 'INFO', message),
  debug: (message) => log(LOG_LEVELS.DEBUG, 'DEBUG', message),
};
