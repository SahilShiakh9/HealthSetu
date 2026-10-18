import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const rbacTestRouter = Router();

rbacTestRouter.get('/test/patient-only', requireAuth, requireRole('PATIENT', 'ASHA'), (req, res) => {
  res.status(200).json({ allowed: true, role: req.user!.role, area: 'patient-portal' });
});

rbacTestRouter.get('/test/doctor-only', requireAuth, requireRole('DOCTOR'), (req, res) => {
  res.status(200).json({ allowed: true, role: req.user!.role, area: 'doctor-queue' });
});

rbacTestRouter.get('/test/phc-only', requireAuth, requireRole('PHC_OFFICER'), (req, res) => {
  res.status(200).json({ allowed: true, role: req.user!.role, area: 'epidemic-dashboard' });
});

rbacTestRouter.get('/test/admin-only', requireAuth, requireRole('ADMIN'), (req, res) => {
  res.status(200).json({ allowed: true, role: req.user!.role, area: 'admin-audit' });
});
