import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

export const createRateLimiter = (options: RateLimitOptions) => {
  const hits = new Map<string, number[]>();

  // Prune expired records every minute
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < options.windowMs);
      if (valid.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, valid);
      }
    }
  }, 60000);

  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : (req.ip || 'anonymous');
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < options.windowMs);

    if (timestamps.length >= options.max) {
      return next(
        new AppError({
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          message: options.message || 'Too many requests. Please try again later.',
        }),
      );
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
};
