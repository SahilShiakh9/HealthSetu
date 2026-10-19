import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.routes.js';
import { profileRouter } from './routes/profile.routes.js';
import { consentRouter } from './routes/consent.routes.js';
import { rbacTestRouter } from './routes/rbacTest.routes.js';
import { syncRouter } from './routes/sync.routes.js';
import { screeningRouter } from './routes/screening.routes.js';
import { facilityRouter } from './routes/facility.routes.js';
import { consultationRouter } from './routes/consultation.routes.js';
import { intelligenceRouter } from './routes/intelligence.routes.js';
import { phcRouter } from './routes/phc.routes.js';
import { districtRouter } from './routes/district.routes.js';
import { reportRouter } from './routes/report.routes.js';
import { affiliationRouter } from './routes/affiliation.routes.js';
import { doctorRouter } from './routes/doctor.routes.js';
import { ngoRouter } from './routes/ngo.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export const createApp = (): express.Application => {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS: Strict in prod, flexible across localhost ports in development
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin === env.CORS_ORIGIN ||
          origin.endsWith('.vercel.app') ||
          (env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
        ) {
          return callback(null, origin);
        }
        return callback(new Error(`CORS origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  );

  // Parsers
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Structured HTTP logging (quiet for health checks in test/dev)
  if (env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/health' || req.url === '/api/v1/health',
        },
      }),
    );
  }

  // Health and Core Routes
  app.use(healthRouter);

  // Versioned API Routes (/api/v1)
  app.use('/api/v1', authRouter);
  app.use('/api/v1', profileRouter);
  app.use('/api/v1', consentRouter);
  app.use('/api/v1', rbacTestRouter);
  app.use('/api/v1', syncRouter);
  app.use('/api/v1', screeningRouter);
  app.use('/api/v1', facilityRouter);
  app.use('/api/v1', consultationRouter);
  app.use('/api/v1/phc', phcRouter);
  app.use('/api/v1/district', districtRouter);
  app.use('/api/v1', intelligenceRouter);
  app.use('/api/v1', reportRouter);
  app.use('/api/v1', affiliationRouter);
  app.use('/api/v1', doctorRouter);
  app.use('/api/v1', ngoRouter);

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
