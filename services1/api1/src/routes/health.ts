import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'healthsetu-api',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

healthRouter.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'healthsetu-api',
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now(),
  });
});

// Section 13.6 Network quality pre-call probe (100 KB payload)
const probePayload = Buffer.alloc(100 * 1024, 'H');

healthRouter.get('/api/v1/health/probe', (_req, res) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).send(probePayload);
});
