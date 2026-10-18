import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { facilityService } from '../services/facility.service.js';
import { FacilityModel } from '../models/Facility.js';

let mongoServer: MongoMemoryServer;
let app: any;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  app = createApp();
  // Pre-seed facilities
  await facilityService.seedDefaultFacilities();
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Facility API & Geospatial Services', () => {
  it('seeds default facilities into MongoDB', async () => {
    const count = await FacilityModel.countDocuments();
    expect(count).toBeGreaterThan(0);
  });

  it('lists facilities via GET /api/v1/facilities', async () => {
    const res = await request(app).get('/api/v1/facilities');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.facilities[0]).toHaveProperty('name');
    expect(res.body.facilities[0]).toHaveProperty('location');
  });

  it('fetches a single facility by id via GET /api/v1/facilities/:id', async () => {
    const res = await request(app).get('/api/v1/facilities/fac-phc-001');
    expect(res.status).toBe(200);
    expect(res.body.facility.id).toBe('fac-phc-001');
    expect(res.body.facility.name).toContain('Pabal');
  });

  it('returns 404 for non-existent facility id', async () => {
    const res = await request(app).get('/api/v1/facilities/fac-non-existent-999');
    expect(res.status).toBe(404);
  });

  it('returns ranked nearby facilities favoring emergency centers for HIGH risk tier', async () => {
    // User location: Kendur village [18.7842, 74.1205]
    const res = await request(app)
      .get('/api/v1/facilities/nearby')
      .query({
        lat: 18.7842,
        lng: 74.1205,
        riskTier: 'HIGH',
        maxRadiusKm: 50,
      });

    expect(res.status).toBe(200);
    expect(res.body.facilities.length).toBeGreaterThan(0);

    const topMatch = res.body.facilities[0];
    // For HIGH risk, top facility must be emergency capable
    expect(topMatch.facility.emergencyCapable).toBe(true);
    expect(topMatch.isEmergencyMatch).toBe(true);
  });

  it('returns ranked nearby facilities favoring closest sub-centre / PHC for LOW risk tier', async () => {
    const res = await request(app)
      .get('/api/v1/facilities/nearby')
      .query({
        lat: 18.7842,
        lng: 74.1205,
        riskTier: 'LOW',
        maxRadiusKm: 50,
      });

    expect(res.status).toBe(200);
    const topMatch = res.body.facilities[0];
    // Kendur SC is within 1 km
    expect(topMatch.distanceKm).toBeLessThan(2);
  });
});
