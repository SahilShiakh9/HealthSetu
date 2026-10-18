import { Router } from 'express';
import { SyndromeEnum } from '@healthsetu/contracts';
import { phcService } from '../services/phc.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolveScope, assertFacilityInScope } from '../middleware/scope.js';
import { AppError } from '../middleware/errorHandler.js';

export const phcRouter = Router();

// Apply requireAuth, requireRole (PHC_OFFICER or ADMIN), and resolveScope to all /phc routes
phcRouter.use(requireAuth);
phcRouter.use(requireRole('PHC_OFFICER', 'ADMIN', 'HOSPITAL_ADMIN'));
phcRouter.use(resolveScope);

// GET /api/v1/phc/summary
phcRouter.get('/summary', async (req, res, next) => {
  try {
    if (!req.scope || req.scope.facilityIds.length === 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned facility scope found for user',
      });
    }

    const requestedFacilityId = req.query.facilityId as string | undefined;
    if (requestedFacilityId) {
      assertFacilityInScope(req, requestedFacilityId, false);
    }

    const targetFacilities = requestedFacilityId
      ? [requestedFacilityId]
      : req.scope.facilityIds;

    const summary = await phcService.getPhcSummary(targetFacilities);

    // Audit log cross-record read by staff
    await phcService.logAuditEvent({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: 'PHC_SUMMARY_READ',
      resourceType: 'Facility',
      resourceId: summary.facilityId,
      metadata: { targetFacilities },
    });

    res.status(200).json({
      status: 'success',
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/phc/facility (Operational facility record for staff)
phcRouter.get('/facility', async (req, res, next) => {
  try {
    if (!req.scope || req.scope.facilityIds.length === 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned facility scope found for user',
      });
    }

    const requestedFacilityId = req.query.facilityId as string | undefined;
    if (requestedFacilityId) {
      assertFacilityInScope(req, requestedFacilityId, true);
    }

    const targetFacilityId = requestedFacilityId || req.scope.facilityIds[0];
    const facility = await phcService.getOperationalFacility(targetFacilityId);

    res.status(200).json({
      status: 'success',
      facility,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/phc/facility/:id (Resource-by-id lookup with 404 for unauthorized access)
phcRouter.get('/facility/:id', async (req, res, next) => {
  try {
    assertFacilityInScope(req, req.params.id, true);

    const facility = await phcService.getOperationalFacility(req.params.id);

    res.status(200).json({
      status: 'success',
      facility,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/phc/alerts
phcRouter.get('/alerts', async (req, res, next) => {
  try {
    if (!req.scope || req.scope.facilityIds.length === 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned facility scope found for user',
      });
    }

    const requestedFacilityId = req.query.facilityId as string | undefined;
    if (requestedFacilityId) {
      assertFacilityInScope(req, requestedFacilityId, false);
    }

    const targetFacilities = requestedFacilityId
      ? [requestedFacilityId]
      : req.scope.facilityIds;

    const alerts = await phcService.getAlerts(targetFacilities);

    res.status(200).json({
      status: 'success',
      total: alerts.length,
      alerts,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/phc/alerts/:id/acknowledge
phcRouter.patch('/alerts/:id/acknowledge', async (req, res, next) => {
  try {
    if (!req.scope) {
      throw new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'No scope found' });
    }

    const alert = await phcService.acknowledgeAlert(
      req.params.id,
      req.scope.facilityIds,
      req.user?.name || req.user?.id || 'Medical Officer',
    );

    res.status(200).json({
      status: 'success',
      message: 'Alert acknowledged',
      alert,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/phc/aggregates
phcRouter.get('/aggregates', async (req, res, next) => {
  try {
    if (!req.scope || req.scope.facilityIds.length === 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned facility scope found for user',
      });
    }

    const requestedFacilityId = req.query.facilityId as string | undefined;
    if (requestedFacilityId) {
      assertFacilityInScope(req, requestedFacilityId, false);
    }

    const targetFacilities = requestedFacilityId
      ? [requestedFacilityId]
      : req.scope.facilityIds;

    const startDay = req.query.startDay as string | undefined;
    const endDay = req.query.endDay as string | undefined;
    let syndrome = undefined;
    if (req.query.syndrome) {
      syndrome = SyndromeEnum.parse(req.query.syndrome);
    }

    const aggregates = await phcService.getSyndromicAggregates({
      scopedFacilityIds: targetFacilities,
      startDay,
      endDay,
      syndrome,
    });

    // Audit log cross-record read
    await phcService.logAuditEvent({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: 'PHC_AGGREGATES_READ',
      resourceType: 'Facility',
      resourceId: targetFacilities[0],
      metadata: { targetFacilities },
    });

    res.status(200).json({
      status: 'success',
      total: aggregates.length,
      aggregates,
    });
  } catch (err) {
    next(err);
  }
});
