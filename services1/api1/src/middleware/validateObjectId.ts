import type { Request, Response, NextFunction } from 'express';
import { ObjectIdSchema } from '@healthsetu/contracts';
import { AppError } from './errorHandler.js';

/**
 * Validates a route parameter (default 'id') as a valid 24-char hexadecimal ObjectId.
 * Rejects malformed IDs with a clean 400 Bad Request error.
 */
export const validateObjectIdParam = (paramName = 'id') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const rawId = req.params[paramName];
    if (!rawId) {
      return next();
    }

    const result = ObjectIdSchema.safeParse(rawId);
    if (!result.success) {
      throw new AppError({
        statusCode: 400,
        code: 'INVALID_OBJECT_ID',
        message: `Invalid 24-character hexadecimal ObjectId parameter '${paramName}': ${rawId}`,
        details: result.error.format(),
      });
    }

    next();
  };
};

/**
 * Helper to validate any ID string.
 */
export const isValidObjectId = (id?: string | null): boolean => {
  if (!id) return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};
