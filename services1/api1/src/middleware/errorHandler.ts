import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface AppErrorOptions {
  code: string;
  statusCode: number;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    const flat = err.flatten();
    const firstField = Object.values(flat.fieldErrors).flat().filter(Boolean)[0] as string | undefined;
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: firstField || 'Request payload validation failed',
        details: flat,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ code: err.code, message: err.message, details: err.details }, 'AppError handled');
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  logger.error({ err }, 'Unhandled server error');

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message:
        env.NODE_ENV === 'production'
          ? 'An internal server error occurred'
          : err.message || 'Internal Server Error',
    },
  });
};
