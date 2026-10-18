import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { facilityService } from '../services/facility.service.js';
import { FacilityModel } from '../models/Facility.js';
import {
  calculateBearing,
  calculateHaversineDistanceKm,
  EstimatedRoutingProvider,
  rankFacilities,
  type Facility,
} from '@healthsetu/contracts';

let mongoServer: MongoMemoryServer;
let app: any;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  app = createApp();
  // Ensure default facilities and 2dsphere indexes are seeded
  await facilityService.seedDefaultFacilities();
  await FacilityModel.createIndexes();
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Phase 8: Geospatial Coordinates & Facility Ranking', () => {
  describe('Geospatial Invariants & Spherical Calculations', () => {
    it('calculates spherical forward bearing accurately in 0-360 range', () => {
      // Due North: lat increases, lon constant -> ~0°
      const north = calculateBearing(18.0, 74.0, 19.0, 74.0);
      expect(north).toBeCloseTo(0, 0);

      // Due East: lat constant, lon increases -> ~90°
      const east = calculateBearing(18.0, 74.0, 18.0, 75.0);
      expect(east).toBeCloseTo(90, 0);

      // Due South: lat decreases, lon constant -> ~180°
      const south = calculateBearing(19.0, 74.0, 18.0, 74.0);
      expect(south).toBeCloseTo(180, 0);

      // Due West: lat constant, lon decreases -> ~270°
      const west = calculateBearing(18.0, 75.0, 18.0, 74.0);
      expect(west).toBeCloseTo(270, 0);
    });

    it('EstimatedRoutingProvider applies 1.3 road factor with approx flag', async () => {
      const provider = new EstimatedRoutingProvider(35, 1.3);

      const from = { lat: 18.7842, lng: 74.1205 }; // Kendur
      const to = { lat: 18.8252, lng: 74.0531 }; // Pabal (~8.5 km straight-line)

      const straightDistance = calculateHaversineDistanceKm(from.lat, from.lng, to.lat, to.lng);
      const route = await provider.calculateRoute(from.lat, from.lng, to.lat, to.lng);

      expect(route.isApprox).toBe(true);
      expect(route.provider).toBe('estimated');
      expect(route.distanceKm).toBeCloseTo(Math.round(straightDistance * 1.3 * 10) / 10, 1);
      expect(route.durationMinutes).toBeGreaterThan(0);
    });

    it('MongoDB $geoNear strictly adheres to [longitude, latitude] GeoJSON ordering', async () => {
      // Kendur coords: lat = 18.7842, lng = 74.1205
      const queryLng = 74.1205;
      const queryLat = 18.7842;

      const results = await FacilityModel.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [queryLng, queryLat], // Strictly [lng, lat]
            },
            distanceField: 'calculatedDistanceMeters',
            maxDistance: 60000,
            spherical: true,
          },
        },
      ]);

      expect(results.length).toBeGreaterThan(0);
      // Closest facility to Kendur should be Kendur Sub-Centre within 1 km (1000m)
      const closest = results[0];
      expect(closest.calculatedDistanceMeters).toBeLessThan(1000);
      expect(closest.name).toContain('Kendur');
    });
  });

  describe('Explainable Weighted Ranking: 0.40 Proximity + 0.25 Tier + 0.20 Load + 0.15 Services', () => {
    const mockUserLat = 18.7842;
    const mockUserLng = 74.1205;

    it('ranks a suitable nearby PHC over a distant large hospital for LOW risk symptoms', () => {
      const testFacilities: Facility[] = [
        {
          id: 'fac-phc-local',
          name: 'Kendur Primary Health Centre',
          type: 'PHC',
          location: { type: 'Point', coordinates: [74.121, 18.785] }, // 0.1 km away
          districtCode: 'PUN',
          services: ['OPD', 'Maternal', 'Immunization'],
          servicesMask: 7,
          open24x7: false,
          openHours: '8:00 AM - 4:00 PM',
          phone: '+91 9800000001',
          capacityPerDay: 50,
          currentLoad: 15,
          emergencyCapable: false,
          dataSource: 'MANUAL_VERIFIED',
          isMock: false,
          updatedAt: Date.now(),
        },
        {
          id: 'fac-dh-distant',
          name: 'Pune District Hospital',
          type: 'DH',
          location: { type: 'Point', coordinates: [73.8567, 18.5204] }, // ~40 km away
          districtCode: 'PUN',
          services: ['ICU', 'Surgery', 'Emergency', 'Blood Bank'],
          servicesMask: 15,
          open24x7: true,
          openHours: '24x7',
          phone: '+91 9800000002',
          capacityPerDay: 500,
          currentLoad: 300,
          emergencyCapable: true,
          dataSource: 'ABDM_HFR',
          isMock: false,
          updatedAt: Date.now(),
        },
      ];

      const ranked = rankFacilities(testFacilities, mockUserLat, mockUserLng, { riskTier: 'LOW' });

      expect(ranked.length).toBe(2);
      // For low risk, local PHC must rank first due to proximity and primary tier fit
      expect(ranked[0].facility.id).toBe('fac-phc-local');
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
      expect(ranked[0].breakdown).toBeDefined();
      expect(ranked[0].breakdown?.proximity).toBeGreaterThan(ranked[1].breakdown?.proximity ?? 0);
    });

    it('ranks emergency-capable facility first for HIGH risk triage', () => {
      const testFacilities: Facility[] = [
        {
          id: 'fac-phc-local',
          name: 'Kendur Sub-Centre (No Emergency)',
          type: 'SC',
          location: { type: 'Point', coordinates: [74.121, 18.785] }, // 0.1 km away
          districtCode: 'PUN',
          services: ['OPD'],
          servicesMask: 1,
          open24x7: false,
          openHours: '9:00 AM - 3:00 PM',
          phone: '+91 9800000001',
          capacityPerDay: 20,
          currentLoad: 5,
          emergencyCapable: false,
          dataSource: 'MANUAL_VERIFIED',
          isMock: false,
          updatedAt: Date.now(),
        },
        {
          id: 'fac-chc-emergency',
          name: 'Shikrapur Emergency Trauma Centre',
          type: 'CHC',
          location: { type: 'Point', coordinates: [74.1215, 18.6948] }, // ~10 km away
          districtCode: 'PUN',
          services: ['24x7 Trauma', 'Emergency ICU', 'Ambulance'],
          servicesMask: 15,
          open24x7: true,
          openHours: '24x7',
          phone: '+91 9800000003',
          capacityPerDay: 120,
          currentLoad: 40,
          emergencyCapable: true,
          dataSource: 'ABDM_HFR',
          isMock: false,
          updatedAt: Date.now(),
        },
      ];

      const ranked = rankFacilities(testFacilities, mockUserLat, mockUserLng, { riskTier: 'HIGH' });

      expect(ranked.length).toBe(2);
      // For HIGH risk, emergencyCapable must rank first even if further away
      expect(ranked[0].facility.id).toBe('fac-chc-emergency');
      expect(ranked[0].facility.emergencyCapable).toBe(true);
      expect(ranked[0].isEmergencyMatch).toBe(true);
    });
  });

  describe('API Directory Privacy & Verification Sanitization', () => {
    it('returns public fields only and includes data provenance in GET /api/v1/facilities/nearby', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 18.7842,
          lng: 74.1205,
          riskTier: 'LOW',
          maxRadiusKm: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.facilities.length).toBeGreaterThan(0);

      const firstItem = res.body.facilities[0];
      // Public directory assertions
      expect(firstItem.facility).toHaveProperty('id');
      expect(firstItem.facility).toHaveProperty('name');
      expect(firstItem.facility).toHaveProperty('dataSource');
      expect(firstItem.facility).toHaveProperty('isMock');

      // Privacy: operational metrics MUST NOT be exposed on public facility objects
      expect((firstItem.facility as any).capacityPerDay).toBeUndefined();
      expect((firstItem.facility as any).currentLoad).toBeUndefined();

      // Explainable ranking fields
      expect(firstItem).toHaveProperty('distanceKm');
      expect(firstItem).toHaveProperty('approxTravelTimeMinutes');
      expect(firstItem).toHaveProperty('score');
      expect(firstItem).toHaveProperty('bearingDeg');
      expect(firstItem).toHaveProperty('breakdown');
      expect(firstItem.breakdown).toHaveProperty('proximity');
      expect(firstItem.breakdown).toHaveProperty('tierFit');
    });
  });

  describe('India-Wide Production Hardening & Real OSM Discovery', () => {
    it('discovers actual OpenStreetMap healthcare facilities in Alandi (18.6775, 73.8970)', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 18.6775,
          lng: 73.8970,
          maxRadiusKm: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.facilities.length).toBeGreaterThan(0);

      // Verify real Alandi records exist in results
      const facilityNames = res.body.facilities.map((f: any) => f.facility.name);
      expect(facilityNames).toContain('Rural Hospital, Alandi');
      expect(facilityNames).toContain('Shri Sai Hospital, Alandi');

      // Verify OSM data provenance and attribution
      const ruralHospital = res.body.facilities.find((f: any) => f.facility.name === 'Rural Hospital, Alandi');
      expect(ruralHospital).toBeDefined();
      expect(ruralHospital.facility.dataSource).toBe('OPEN_STREET_MAP');
      expect(ruralHospital.facility.sourceAttribution).toBe('© OpenStreetMap contributors');
      expect(ruralHospital.distanceKm).toBeLessThan(2.0); // Directly in Alandi (< 2 km)
    });

    it('discovers facilities in secondary Indian test location (Nashik: 19.9982, 73.7891) without returning Pune facilities', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 19.9982,
          lng: 73.7891,
          maxRadiusKm: 30,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.facilities.length).toBeGreaterThan(0);

      const facilityNames = res.body.facilities.map((f: any) => f.facility.name);
      expect(facilityNames).toContain('Nashik Civil District Hospital');

      // Zero Pune facilities should be returned for a 30km search in Nashik
      expect(facilityNames).not.toContain('Rural Hospital, Alandi');
      expect(facilityNames).not.toContain('Kendur Health Sub-Centre');
    });

    it('honestly returns empty result for unmapped regions without inventing facilities', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 15.0,
          lng: 70.0,
          maxRadiusKm: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.total).toBe(0);
      expect(res.body.facilities).toEqual([]);
    });

    it('verifies MongoDB geospatial index (2dsphere IXSCAN) via explain plan', async () => {
      const explain = await facilityService.explainNearbyQuery(18.6775, 73.8970, 25);
      const winningPlan = explain.queryPlanner?.winningPlan;

      const planString = JSON.stringify(winningPlan);
      expect(planString).toContain('2dsphere');
      expect(planString).toContain('location_2dsphere');
    });

    it('rejects invalid coordinates with descriptive validation error', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 95.0, // Invalid latitude > 90
          lng: 73.8970,
        });

      expect(res.status).toBe(400);
    });

    it('discovers multiple real healthcare facilities in Delhi (28.6448, 77.2167) with radius breakdown', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 28.6448,
          lng: 77.2167,
          maxRadiusKm: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.effectiveRadiusKm).toBe(10);
      expect(res.body.breakdown).toBeDefined();
      expect(res.body.breakdown.within10km).toBeGreaterThanOrEqual(10);
      expect(res.body.facilities.length).toBeGreaterThanOrEqual(10);

      // Verify specific real Central Delhi hospitals and clinics
      const names = res.body.facilities.map((f: any) => f.facility.name);
      expect(names).toContain('Lok Nayak Hospital (LNJP)');
      expect(names).toContain('Lady Hardinge Medical College & Hospital (SSKH)');
      expect(names).toContain('Aam Aadmi Mohalla Clinic, Paharganj');

      // Verify all returned Delhi facilities have real OSM data provenance and no mock flag
      for (const item of res.body.facilities) {
        expect(item.facility.dataSource).toBe('OPEN_STREET_MAP');
        expect(item.facility.isMock).toBe(false);
      }
    });

    it('discovers real healthcare facilities in Bengaluru Urban (12.9716, 77.5946)', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 12.9716,
          lng: 77.5946,
          maxRadiusKm: 15,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.facilities.length).toBeGreaterThan(0);

      const names = res.body.facilities.map((f: any) => f.facility.name);
      expect(names).toContain('Victoria Hospital (Bangalore Medical College)');
      expect(names).toContain('Bowring & Lady Curzon Hospital');
    });

    it('classifies OSM healthcare tags into standard Indian facility types accurately', async () => {
      const { overpassService } = await import('../services/overpass.service.js');

      expect(overpassService.classifyFacilityType({ name: 'Alandi PHC', amenity: 'clinic' })).toBe('PHC');
      expect(overpassService.classifyFacilityType({ name: 'Charholi Sub-Centre', healthcare: 'subcentre' })).toBe('SC');
      expect(overpassService.classifyFacilityType({ name: 'Shirur CHC', healthcare: 'community_health_centre' })).toBe('CHC');
      expect(overpassService.classifyFacilityType({ name: 'Civil District Hospital Nashik', amenity: 'hospital' })).toBe('DH');
      expect(overpassService.classifyFacilityType({ name: 'Apollo Pharmacy', amenity: 'pharmacy' })).toBe('PHARMACY');
      expect(overpassService.classifyFacilityType({ name: 'Care Clinic', amenity: 'clinic' })).toBe('CLINIC');
      expect(overpassService.classifyFacilityType({ name: 'Lilavati Private Hospital', amenity: 'hospital', 'operator:type': 'private' })).toBe('PRIVATE');
    });

    it('converts Overpass elements to Facility without fabricating missing attributes', async () => {
      const { overpassService } = await import('../services/overpass.service.js');

      const element: any = {
        type: 'node',
        id: 99887766,
        lat: 18.9696,
        lon: 72.8193,
        tags: {
          name: 'Mumbai Central Municipal Dispensary',
          amenity: 'clinic',
          // Note: No phone, no opening_hours, no emergency tag!
        },
      };

      const facility = overpassService.elementToFacility(element);
      expect(facility).not.toBeNull();
      expect(facility!.id).toBe('osm:node:99887766');
      expect(facility!.osmId).toBe('99887766');
      expect(facility!.name).toBe('Mumbai Central Municipal Dispensary');
      expect(facility!.type).toBe('CLINIC');
      // Must NOT fabricate fake phone or fake hours:
      expect(facility!.phone).toBe('');
      expect(facility!.openHours).toBe('');
      expect(facility!.emergencyCapable).toBe(false);
      expect(facility!.dataSource).toBe('OPEN_STREET_MAP');
      expect(facility!.sourceAttribution).toBe('© OpenStreetMap contributors');
      expect(facility!.isMock).toBe(false);
    });

    it('handles live discovery failure gracefully by returning existing database records', async () => {
      const { overpassService } = await import('../services/overpass.service.js');
      const spy = vi.spyOn(overpassService, 'discoverHealthcareFacilities').mockResolvedValueOnce({
        attempted: true,
        success: false,
        provider: 'https://overpass-api.de/api/interpreter',
        durationMs: 8000,
        rawCount: 0,
        validCount: 0,
        facilities: [],
        error: '504 Gateway Timeout',
      });

      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({
          lat: 18.6775,
          lng: 73.8970,
          maxRadiusKm: 25,
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.facilities.length).toBeGreaterThan(0);
      expect(res.body.discovery.liveSuccess).toBe(false);
      expect(res.body.discovery.error).toBe('504 Gateway Timeout');

      spy.mockRestore();
    });
  });
});
