import { Router } from 'express';
import { SyndromeEnum } from '@healthsetu/contracts';
import { intelligenceService } from '../services/intelligence.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { resolveScope, assertFacilityInScope } from '../middleware/scope.js';
import { AppError } from '../middleware/errorHandler.js';

export const intelligenceRouter = Router();

intelligenceRouter.use(
  '/intelligence',
  requireAuth,
  requireRole('PHC_OFFICER', 'ADMIN', 'GOVT_OFFICER', 'NGO_OBSERVER'),
  resolveScope,
);

// GET /api/v1/intelligence/summary (Overall PHC epidemiological summary)
intelligenceRouter.get('/intelligence/summary', async (req, res, next) => {
  try {
    const requestedPhcId = req.query.phcId as string | undefined;
    if (requestedPhcId) {
      assertFacilityInScope(req, requestedPhcId, false);
    }

    const phcId = requestedPhcId || req.scope?.facilityIds[0] || 'phc-pabal';
    const summary = await intelligenceService.getPhcSummary(phcId);

    res.status(200).json({
      status: 'success',
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/intelligence/aggregates (Syndromic aggregates with k-anonymity)
intelligenceRouter.get('/intelligence/aggregates', async (req, res, next) => {
  try {
    const requestedPhcId = req.query.phcId as string | undefined;
    if (requestedPhcId) {
      assertFacilityInScope(req, requestedPhcId, false);
    }

    const phcId = requestedPhcId || req.scope?.facilityIds[0] || 'phc-pabal';
    const startDay = req.query.startDay as string | undefined;
    const endDay = req.query.endDay as string | undefined;
    let syndrome = undefined;
    if (req.query.syndrome) {
      syndrome = SyndromeEnum.parse(req.query.syndrome);
    }

    const aggregates = await intelligenceService.getSyndromicAggregates({
      phcId,
      startDay,
      endDay,
      syndrome,
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

// GET /api/v1/intelligence/alerts (Epidemic outbreak alerts)
intelligenceRouter.get('/intelligence/alerts', async (req, res, next) => {
  try {
    const requestedPhcId = req.query.phcId as string | undefined;
    if (requestedPhcId) {
      assertFacilityInScope(req, requestedPhcId, false);
    }

    const requestedDistrict = req.query.districtCode as string | undefined;
    const districtCode =
      requestedDistrict ||
      (req.scope?.districtCode && req.scope.districtCode !== '*' ? req.scope.districtCode : undefined) ||
      (req.user?.role === 'GOVT_OFFICER' ? (req.user as any).districtCode : undefined);

    const phcId = requestedPhcId || req.scope?.facilityIds?.[0];
    const alerts = await intelligenceService.getAlerts(phcId, districtCode);

    res.status(200).json({
      status: 'success',
      total: alerts.length,
      alerts,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/intelligence/alerts/:id/acknowledge (Acknowledge alert)
intelligenceRouter.patch('/intelligence/alerts/:id/acknowledge', async (req, res, next) => {
  try {
    const success = await intelligenceService.acknowledgeAlert(
      req.params.id,
      req.user?.name || req.user?.id || 'Medical Officer',
      req.user?.id,
      req.user?.role,
    );

    if (!success) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Alert not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Alert acknowledged',
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/intelligence/alerts/:id/workflow (Update workflow stage, notes, task assignment)
intelligenceRouter.patch('/intelligence/alerts/:id/workflow', async (req, res, next) => {
  try {
    const updated = await intelligenceService.updateAlertWorkflow(
      req.params.id,
      {
        workflowStage: req.body.workflowStage,
        investigationNotes: req.body.investigationNotes,
        assignedTo: req.body.assignedTo,
        actionPlan: req.body.actionPlan,
        dueDate: req.body.dueDate,
        status: req.body.status,
      },
      req.user?.name || req.user?.id || 'Surveillance Officer',
      req.user?.id,
      req.user?.role,
    );

    if (!updated) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Alert not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Alert workflow updated successfully',
      alert: updated,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/intelligence/alerts/:id/resolve (Resolve alert with audit log)
intelligenceRouter.patch('/intelligence/alerts/:id/resolve', async (req, res, next) => {
  try {
    const reason = req.body.reason || 'Investigation completed; threshold normalized';
    const notes = req.body.notes;

    const resolved = await intelligenceService.resolveAlert(
      req.params.id,
      { reason, notes },
      req.user?.name || req.user?.id || 'Surveillance Officer',
      req.user?.id,
      req.user?.role,
    );

    if (!resolved) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Alert not found' });
    }

    res.status(200).json({
      status: 'success',
      message: 'Alert resolved successfully',
      alert: resolved,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/intelligence/generate-synthetic (Seed synthetic outbreak dataset)
intelligenceRouter.post('/intelligence/generate-synthetic', async (req, res, next) => {
  try {
    const requestedPhcId = req.body.phcId as string | undefined;
    if (requestedPhcId) {
      assertFacilityInScope(req, requestedPhcId, false);
    }

    const phcId = requestedPhcId || req.scope?.facilityIds[0] || 'phc-pabal';
    const villageCode = (req.body.villageCode as string) || 'VIL-412208';
    const syndrome = req.body.syndrome
      ? SyndromeEnum.parse(req.body.syndrome)
      : 'febrile_illness';

    await intelligenceService.generateSyntheticOutbreak(phcId, villageCode, syndrome);

    res.status(201).json({
      status: 'success',
      message: 'Synthetic epidemiological outbreak data created',
    });
  } catch (err) {
    next(err);
  }
});
