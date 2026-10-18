import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, checkSessionValid } from '../services/auth.service.js';
import { ConsentService } from '../services/consent.service.js';
import { AppError } from './errorHandler.js';
import type { Role, ConsentPurpose } from '@healthsetu/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        name: string;
        language: string;
        sid?: string;
      };
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Add Cache-Control: no-store and Pragma: no-cache to every authenticated API response
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError({
        code: 'UNAUTHORIZED',
        statusCode: 401,
        message: 'Authorization token required',
      });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyAccessToken(token);

    if (payload.sid) {
      const isSessionValid = await checkSessionValid(payload.sid);
      if (!isSessionValid) {
        throw new AppError({
          code: 'UNAUTHORIZED',
          statusCode: 401,
          message: 'Session has been revoked or expired',
        });
      }
    }

    req.user = {
      id: payload.sub,
      role: payload.role,
      name: payload.name,
      language: payload.language,
      sid: payload.sid,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...allowedRoles: (Role | Role[])[]) => {
  const flatRoles = allowedRoles.flat();
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(
        new AppError({
          code: 'UNAUTHORIZED',
          statusCode: 401,
          message: 'Authentication required',
        }),
      );
      return;
    }

    if (!flatRoles.includes(req.user.role)) {
      next(
        new AppError({
          code: 'FORBIDDEN',
          statusCode: 403,
          message: `Access denied. Requires one of roles: [${flatRoles.join(', ')}]`,
        }),
      );
      return;
    }

    next();
  };
};

export const requireConsent = (purpose: ConsentPurpose) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AppError({
          code: 'UNAUTHORIZED',
          statusCode: 401,
          message: 'Authentication required',
        });
      }

      const hasConsent = await ConsentService.hasActiveConsent(req.user.id, purpose);
      if (!hasConsent) {
        throw new AppError({
          code: 'CONSENT_REQUIRED',
          statusCode: 403,
          message: `Operation requires active '${purpose}' consent.`,
          details: { purpose },
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
