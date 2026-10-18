import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geoapifyService, type GeoapifyPlaceFeature } from '../services/geoapify.service.js';
import { facilityService } from '../services/facility.service.js';
import { env } from '../config/env.js';

describe('Geoapify Places API Adapter & Healthcare Normalization', () => {
  beforeEach(() => {
    geoapifyService.clearCache();
    vi.restoreAllMocks();
  });

  describe('Category & Indian Healthcare Facility Type Mapping', () => {
    it('classifies sub-centres accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Kendur Sub Centre',
          categories: ['healthcare.clinic'],
          lon: 74.12,
          lat: 18.78,
        }),
      ).toBe('SC');

      expect(
        geoapifyService.classifyFacilityType({
          name: 'Pabal Arogya Upkendra',
          categories: ['healthcare.clinic'],
          lon: 74.05,
          lat: 18.82,
        }),
      ).toBe('SC');
    });

    it('classifies primary health centres accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Alandi Primary Health Centre',
          categories: ['healthcare.clinic'],
          lon: 73.89,
          lat: 18.67,
        }),
      ).toBe('PHC');

      expect(
        geoapifyService.classifyFacilityType({
          name: 'Waki PHC',
          categories: ['healthcare.clinic'],
          lon: 73.85,
          lat: 18.72,
        }),
      ).toBe('PHC');
    });

    it('classifies community health centres accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Chakan Community Health Centre',
          categories: ['healthcare.hospital'],
          lon: 73.85,
          lat: 18.75,
        }),
      ).toBe('CHC');
    });

    it('classifies district & civil hospitals accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Pune District Hospital, Aundh',
          categories: ['healthcare.hospital'],
          lon: 73.80,
          lat: 18.55,
        }),
      ).toBe('DH');

      expect(
        geoapifyService.classifyFacilityType({
          name: 'Nashik Civil Hospital',
          categories: ['healthcare.hospital'],
          lon: 73.78,
          lat: 19.99,
        }),
      ).toBe('DH');
    });

    it('classifies pharmacies and chemists accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Apollo Pharmacy Alandi',
          categories: ['healthcare.pharmacy'],
          lon: 73.89,
          lat: 18.67,
        }),
      ).toBe('PHARMACY');

      expect(
        geoapifyService.classifyFacilityType({
          name: 'Pradhan Mantri Jan Aushadhi Kendra',
          categories: ['commercial.chemist'],
          lon: 73.89,
          lat: 18.67,
        }),
      ).toBe('PHARMACY');
    });

    it('classifies general hospitals and private clinics accurately', () => {
      expect(
        geoapifyService.classifyFacilityType({
          name: 'Shree Hospital',
          categories: ['healthcare.hospital'],
          lon: 73.85,
          lat: 18.52,
        }),
      ).toBe('DH');

      expect(
        geoapifyService.classifyFacilityType({
          name: 'Dr. Patil Family Dental Clinic',
          categories: ['healthcare.clinic'],
          lon: 73.85,
          lat: 18.52,
        }),
      ).toBe('CLINIC');
    });
  });

  describe('Feature Normalization & Data Integrity Rules', () => {
    it('normalizes a valid Geoapify place feature without data fabrication', () => {
      const mockFeature: GeoapifyPlaceFeature = {
        type: 'Feature',
        properties: {
          place_id: 'geo_place_12345',
          osm_id: 998877,
          name: 'Shri Sai Hospital, Alandi',
          formatted: 'Dehu Phata, Alandi, Pune, Maharashtra 412105, India',
          lon: 73.8975,
          lat: 18.6772,
          categories: ['healthcare.hospital'],
          contact: {
            phone: '+91 20 2718 1234',
          },
          opening_hours: '24/7',
          datasource: {
            raw: {
              emergency: 'yes',
            },
          },
        },
        geometry: {
          type: 'Point',
          coordinates: [73.8975, 18.6772],
        },
      };

      const facility = geoapifyService.featureToFacility(mockFeature);
      expect(facility).not.toBeNull();
      expect(facility!.id).toBe('geoapify:place:geo_place_12345');
      expect(facility!.osmId).toBe('998877');
      expect(facility!.name).toBe('Shri Sai Hospital, Alandi');
      expect(facility!.type).toBe('DH');
      expect(facility!.location.coordinates).toEqual([73.8975, 18.6772]);
      expect(facility!.phone).toBe('+91 20 2718 1234');
      expect(facility!.open24x7).toBe(true);
      expect(facility!.emergencyCapable).toBe(true);
      expect(facility!.dataSource).toBe('GEOAPIFY');
      expect(facility!.sourceAttribution).toContain('Powered by Geoapify');
      expect(facility!.isMock).toBe(false);
    });

    it('does NOT fabricate phone numbers, operating hours, or emergency capability when missing', () => {
      const incompleteFeature: GeoapifyPlaceFeature = {
        type: 'Feature',
        properties: {
          place_id: 'geo_minimal_999',
          name: 'Rural Wellness Dispensary',
          formatted: 'Kendur Village Road, Shirur',
          lon: 74.1205,
          lat: 18.7842,
          categories: ['healthcare.clinic'],
          // Missing contact, opening_hours, emergency tag
        },
        geometry: {
          type: 'Point',
          coordinates: [74.1205, 18.7842],
        },
      };

      const facility = geoapifyService.featureToFacility(incompleteFeature);
      expect(facility).not.toBeNull();
      expect(facility!.phone).toBe('');
      expect(facility!.open24x7).toBe(false);
      expect(facility!.emergencyCapable).toBe(false);
      expect(facility!.openHours).toBe('Consult facility');
    });

    it('rejects invalid or out-of-range coordinates cleanly', () => {
      const invalidLatFeature: GeoapifyPlaceFeature = {
        type: 'Feature',
        properties: {
          name: 'Invalid Place',
          lon: 73.89,
          lat: 120.5, // Invalid > 90
        },
        geometry: { type: 'Point', coordinates: [73.89, 120.5] },
      };
      expect(geoapifyService.featureToFacility(invalidLatFeature)).toBeNull();

      const invalidLonFeature: GeoapifyPlaceFeature = {
        type: 'Feature',
        properties: {
          name: 'Invalid Place',
          lon: -200, // Invalid < -180
          lat: 18.5,
        },
        geometry: { type: 'Point', coordinates: [-200, 18.5] },
      };
      expect(geoapifyService.featureToFacility(invalidLonFeature)).toBeNull();
    });
  });

  describe('Discovery Strategy & Provider Fallback Behavior', () => {
    it('returns empty discovery note when GEOAPIFY_API_KEY is not configured', async () => {
      const originalKey = env.GEOAPIFY_API_KEY;
      (env as any).GEOAPIFY_API_KEY = '';

      const res = await geoapifyService.discoverHealthcareFacilities(18.6752, 73.898, 25000);
      expect(res.attempted).toBe(false);
      expect(res.success).toBe(false);
      expect(res.facilities).toEqual([]);
      expect(res.note).toContain('GEOAPIFY_API_KEY not configured');

      (env as any).GEOAPIFY_API_KEY = originalKey;
    });

    it('handles HTTP error responses (e.g. 429 rate limit or 500 error) gracefully', async () => {
      const originalKey = env.GEOAPIFY_API_KEY;
      (env as any).GEOAPIFY_API_KEY = 'mock_geoapify_key_for_test';

      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too Many Requests' }), {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      const res = await geoapifyService.discoverHealthcareFacilities(18.6752, 73.898, 25000);
      expect(res.attempted).toBe(true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('rate limit');
      expect(res.facilities).toEqual([]);

      (env as any).GEOAPIFY_API_KEY = originalKey;
    });

    it('handles network timeouts gracefully without throwing unhandled exceptions', async () => {
      const originalKey = env.GEOAPIFY_API_KEY;
      (env as any).GEOAPIFY_API_KEY = 'mock_geoapify_key_for_test';

      const timeoutError = new Error('The operation was aborted due to timeout');
      timeoutError.name = 'TimeoutError';
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(timeoutError);

      const res = await geoapifyService.discoverHealthcareFacilities(18.6752, 73.898, 25000);
      expect(res.attempted).toBe(true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('timed out');
      expect(res.facilities).toEqual([]);

      (env as any).GEOAPIFY_API_KEY = originalKey;
    });

    it('returns parsed facilities from valid Geoapify GeoJSON response and caches them', async () => {
      const originalKey = env.GEOAPIFY_API_KEY;
      (env as any).GEOAPIFY_API_KEY = 'mock_geoapify_key_for_test';

      const mockGeoapifyResponse = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              place_id: 'geo_alandi_clinic',
              name: 'Alandi Citizens Clinic',
              formatted: 'Markandeya Nagar, Alandi, Pune',
              lon: 73.897,
              lat: 18.678,
              categories: ['healthcare.clinic'],
            },
            geometry: {
              type: 'Point',
              coordinates: [73.897, 18.678],
            },
          },
        ],
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockGeoapifyResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await geoapifyService.discoverHealthcareFacilities(18.6752, 73.898, 25000);
      expect(res.attempted).toBe(true);
      expect(res.success).toBe(true);
      expect(res.facilities.length).toBe(1);
      expect(res.facilities[0].name).toBe('Alandi Citizens Clinic');
      expect(res.facilities[0].dataSource).toBe('GEOAPIFY');

      // Subsequent identical call should hit memory cache without re-fetching
      const cachedRes = await geoapifyService.discoverHealthcareFacilities(18.6752, 73.898, 25000);
      expect(cachedRes.provider).toContain('memory-cache');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      (env as any).GEOAPIFY_API_KEY = originalKey;
    });
  });
});
