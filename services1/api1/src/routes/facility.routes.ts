import { Router } from 'express';
import { NearbyFacilitiesQuerySchema } from '@healthsetu/contracts';
import { facilityService } from '../services/facility.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const facilityRouter = Router();

// GET /api/v1/facilities/nearby
facilityRouter.get('/facilities/nearby', async (req, res, next) => {
  try {
    const query = NearbyFacilitiesQuerySchema.parse({
      lat: req.query.lat,
      lng: req.query.lng,
      riskTier: req.query.riskTier,
      syndrome: req.query.syndrome,
      maxRadiusKm: req.query.maxRadiusKm,
      strategy: req.query.strategy,
    });

    const detailed = await facilityService.getNearbyFacilitiesDetailed(query);

    res.status(200).json({
      status: 'success',
      effectiveRadiusKm: detailed.effectiveRadiusKm,
      breakdown: detailed.breakdown,
      discovery: detailed.discovery,
      total: detailed.facilities.length,
      facilities: detailed.facilities,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/facilities/nearby/stream - Progressive Server-Sent Events stream
facilityRouter.get('/facilities/nearby/stream', async (req, res) => {
  try {
    const query = NearbyFacilitiesQuerySchema.parse({
      lat: req.query.lat,
      lng: req.query.lng,
      riskTier: req.query.riskTier,
      syndrome: req.query.syndrome,
      maxRadiusKm: req.query.maxRadiusKm,
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let isClosed = false;
    req.on('close', () => {
      isClosed = true;
    });

    const sendEvent = (data: any) => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    sendEvent({ type: 'start', query });

    let pendingProviders = 3;
    const checkComplete = () => {
      pendingProviders--;
      if (pendingProviders === 0 && !isClosed) {
        sendEvent({ type: 'complete' });
        res.end();
      }
    };

    // 1. Geoapify Discovery (External primary discovery)
    facilityService
      .getNearbyFacilitiesDetailed({ ...query, strategy: 'geoapify' })
      .then((result) => {
        sendEvent({
          type: 'provider_result',
          provider: 'geoapify',
          facilities: result.facilities,
          total: result.facilities.length,
          discovery: result.discovery,
        });
      })
      .catch((err) => {
        sendEvent({
          type: 'provider_error',
          provider: 'geoapify',
          error: err?.message || 'Geoapify request failed',
        });
      })
      .finally(checkComplete);

    // 2. MongoDB Local Database
    facilityService
      .getNearbyFacilitiesDetailed({ ...query, strategy: 'mongodb' })
      .then((result) => {
        sendEvent({
          type: 'provider_result',
          provider: 'mongodb',
          facilities: result.facilities,
          total: result.facilities.length,
          discovery: result.discovery,
        });
      })
      .catch((err) => {
        sendEvent({
          type: 'provider_error',
          provider: 'mongodb',
          error: err?.message || 'MongoDB query failed',
        });
      })
      .finally(checkComplete);

    // 3. OpenStreetMap Overpass (Secondary external discovery)
    facilityService
      .getNearbyFacilitiesDetailed({ ...query, strategy: 'overpass' })
      .then((result) => {
        sendEvent({
          type: 'provider_result',
          provider: 'overpass',
          facilities: result.facilities,
          total: result.facilities.length,
          discovery: result.discovery,
        });
      })
      .catch((err) => {
        sendEvent({
          type: 'provider_error',
          provider: 'overpass',
          error: err?.message || 'Overpass request failed or timed out',
        });
      })
      .finally(checkComplete);
  } catch (err: any) {
    res.status(400).json({ status: 'error', message: err?.message || 'Invalid query parameters' });
  }
});

// GET /api/v1/facilities/:id
facilityRouter.get('/facilities/:id', async (req, res, next) => {
  try {
    const facility = await facilityService.getPublicFacilityById(req.params.id);
    if (!facility) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Healthcare facility not found',
      });
    }

    res.status(200).json({
      status: 'success',
      facility,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/facilities
facilityRouter.get('/facilities', async (req, res, next) => {
  try {
    const districtCode = typeof req.query.districtCode === 'string' ? req.query.districtCode : undefined;
    const registeredOnly = req.query.registeredOnly === 'true' || req.query.registered === 'true';
    const facilities = await facilityService.listFacilities(districtCode, registeredOnly);

    res.status(200).json({
      status: 'success',
      total: facilities.length,
      facilities,
    });
  } catch (err) {
    next(err);
  }
});
