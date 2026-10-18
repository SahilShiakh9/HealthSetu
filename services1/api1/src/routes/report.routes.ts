import { Router } from 'express';
import { reportService } from '../services/report.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

export const reportRouter = Router();

reportRouter.use('/reports', requireAuth, requireRole('PATIENT', 'ASHA', 'DOCTOR', 'ADMIN'));

// GET /api/v1/reports (List reports for authenticated patient or doctor)
reportRouter.get('/reports', async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const reports = await reportService.listReports(req.user);

    res.status(200).json({
      status: 'success',
      total: reports.length,
      reports,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/:id (Get single medical report with service-layer authorization)
reportRouter.get('/reports/:id', async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError({ statusCode: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const report = await reportService.getReport(req.params.id, req.user);

    res.status(200).json({
      status: 'success',
      report,
    });
  } catch (err) {
    next(err);
  }
});
