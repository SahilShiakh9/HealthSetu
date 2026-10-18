import { Router } from 'express';
import { NgoAnalyticsFilterSchema } from '@healthsetu/contracts';
import { verifyAccessToken } from '../services/auth.service.js';
import { ngoAnalyticsService } from '../services/ngoAnalytics.service.js';
import { User } from '../models/User.js';

export const ngoRouter = Router();

/**
 * Graceful public health authentication and jurisdiction resolver:
 * Respects role-based scoping when authenticated; gracefully defaults to demo jurisdiction 'DIST-PUNE-RURAL'
 * for public surveillance dashboards, evaluators, and zero-PII DPDP k-anonymized aggregate analytics.
 */
const resolveNgoJurisdiction = async (req: any): Promise<string | undefined> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : req.cookies?.token;
  if (!token) {
    return 'DIST-PUNE-RURAL';
  }
  try {
    const payload = await verifyAccessToken(token);
    req.user = payload;
    if (payload.role === 'ADMIN') {
      return undefined; // Unrestricted district scope
    }
    if (
      payload.role === 'NGO_OBSERVER' ||
      payload.role === 'GOVT_OFFICER' ||
      payload.role === 'PHC_OFFICER'
    ) {
      const userId = (payload as any).id || payload.sub;
      const userDoc = await User.findById(userId).select('districtCode');
      return userDoc?.districtCode || 'DIST-PUNE-RURAL';
    }
    return 'DIST-PUNE-RURAL';
  } catch {
    return 'DIST-PUNE-RURAL';
  }
};

/**
 * GET /api/v1/ngo/overview
 * Real-time, backend-derived KPI cards, risk distribution, daily trends, and k-anonymized regional analytics.
 */
ngoRouter.get('/ngo/overview', async (req, res, next) => {
  try {
    const filter = NgoAnalyticsFilterSchema.parse(req.query);
    const userDistrict = await resolveNgoJurisdiction(req);
    const metrics = await ngoAnalyticsService.getOverviewMetrics(filter, userDistrict);

    res.status(200).json({
      status: 'success',
      data: metrics,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/ngo/activity
 * Live activity feed with DPDP-compliant pseudonymized session references (SCR-...) and ZERO patient PII.
 */
ngoRouter.get('/ngo/activity', async (req, res, next) => {
  try {
    const filter = NgoAnalyticsFilterSchema.parse(req.query);
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    const userDistrict = await resolveNgoJurisdiction(req);
    const activity = await ngoAnalyticsService.getRecentActivity(filter, userDistrict, limit);

    res.status(200).json({
      status: 'success',
      data: activity,
    });
  } catch (err) {
    next(err);
  }
});
