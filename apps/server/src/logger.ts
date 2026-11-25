const silent = process.env.NODE_ENV === 'test' || process.env.LOG_LEVEL === 'silent';

export const logger = {
  info: (...args: unknown[]) => {
    if (!silent) console.info('[info]', ...args);
  },
  warn: (...args: unknown[]) => {
    if (!silent) console.warn('[warn]', ...args);
  },
  error: (...args: unknown[]) => {
    if (!silent) console.error('[error]', ...args);
  },
};
