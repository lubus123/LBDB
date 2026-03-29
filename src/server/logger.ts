const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function getLevel(): Level {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in LEVELS) return env as Level;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const showTimestamps = process.env.LOG_TIMESTAMPS === 'true';

export function createLogger(tag: string) {
  const threshold = LEVELS[getLevel()];

  function emit(level: Level, method: 'log' | 'warn' | 'error', args: unknown[]) {
    if (LEVELS[level] < threshold) return;
    const prefix = showTimestamps
      ? `${new Date().toISOString()} [${tag}]`
      : `[${tag}]`;
    console[method](prefix, ...args);
  }

  return {
    debug: (...args: unknown[]) => emit('debug', 'log', args),
    info:  (...args: unknown[]) => emit('info', 'log', args),
    warn:  (...args: unknown[]) => emit('warn', 'warn', args),
    error: (...args: unknown[]) => emit('error', 'error', args),
  };
}
