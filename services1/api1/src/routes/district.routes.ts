import { Router } from 'express';
import { districtService } from '../services/district.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolveScope } from '../middleware/scope.js';
import { AppError } from '../middleware/errorHandler.js';

export const districtRouter = Router();

districtRouter.use(requireAuth);
districtRouter.use(requireRole('ADMIN', 'PHC_OFFICER', 'GOVT_OFFICER', 'NGO_OBSERVER'));
districtRouter.use(resolveScope);

// GET /api/v1/district/summary
districtRouter.get('/summary', async (req, res, next) => {
  try {
    const effectiveDistrict = req.scope?.districtCode || (req.user?.role === 'ADMIN' ? 'PUNE' : undefined);
    if (!effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned district scope found for user',
      });
    }

    const requestedDistrict = req.query.districtCode as string | undefined;
    if (requestedDistrict && req.scope?.districtCode !== '*' && requestedDistrict !== effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Unauthorized district access: district outside assigned scope',
      });
    }

    const targetDistrict = requestedDistrict || effectiveDistrict;
    const summary = await districtService.getDistrictSummary(
      targetDistrict,
      req.user?.id,
      req.user?.role,
    );

    res.status(200).json({
      status: 'success',
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/district/aggregates
districtRouter.get('/aggregates', async (req, res, next) => {
  try {
    const effectiveDistrict = req.scope?.districtCode || (req.user?.role === 'ADMIN' ? 'PUNE' : undefined);
    if (!effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned district scope found for user',
      });
    }

    const requestedDistrict = req.query.districtCode as string | undefined;
    if (requestedDistrict && req.scope?.districtCode !== '*' && requestedDistrict !== effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Unauthorized district access: district outside assigned scope',
      });
    }

    const targetDistrict = requestedDistrict || effectiveDistrict;
    const aggregates = await districtService.getDistrictAggregates(
      targetDistrict,
      req.user?.id,
      req.user?.role,
    );

    res.status(200).json({
      status: 'success',
      total: aggregates.length,
      aggregates,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/district/surveillance
districtRouter.get('/surveillance', async (req, res, next) => {
  try {
    const effectiveDistrict =
      req.scope?.districtCode ||
      (req.user?.role === 'ADMIN' ? 'PUNE' : (req.user as any)?.districtCode);

    if (!effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned district scope found for user',
      });
    }

    const requestedDistrict = req.query.districtCode as string | undefined;
    if (requestedDistrict && req.scope?.districtCode !== '*' && requestedDistrict !== effectiveDistrict) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Unauthorized district access: district outside assigned scope',
      });
    }

    const targetDistrict = requestedDistrict || effectiveDistrict;
    const timeRange = (req.query.timeRange as 'today' | 'last7days' | 'last30days') || 'last7days';

    const surveillance = await districtService.getDistrictSurveillance(
      targetDistrict,
      timeRange,
      req.user?.id,
      req.user?.role,
    );

    res.status(200).json({
      status: 'success',
      data: surveillance,
    });
  } catch (err) {
    next(err);
  }
});
