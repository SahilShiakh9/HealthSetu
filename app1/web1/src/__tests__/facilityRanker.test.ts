import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceKm,
  estimateTravelTimeMinutes,
  rankFacilities,
  MOCK_FACILITIES,
} from '@healthsetu/contracts';

describe('Facility Ranker & Haversine Distance', () => {
  // Test point: Kendur village center [18.7842, 74.1205]
  const userLat = 18.7842;
  const userLng = 74.1205;

  it('calculates accurate Haversine distance in kilometers', () => {
    // Distance from Kendur to Pabal PHC [18.8286, 74.0531]
    const dist = calculateHaversineDistanceKm(userLat, userLng, 18.8286, 74.0531);
    expect(dist).toBeGreaterThan(5);
    expect(dist).toBeLessThan(12);

    // Distance to same point is 0
    expect(calculateHaversineDistanceKm(userLat, userLng, userLat, userLng)).toBe(0);
  });

  it('estimates realistic rural travel time', () => {
    // 35 km with 1.3 rural road factor = 45.5 km; at 35 km/h is ~78 mins
    const minutes = estimateTravelTimeMinutes(35, 35);
    expect(minutes).toBe(78);

    // Very short distance has a minimum of 5 mins
    expect(estimateTravelTimeMinutes(0.5)).toBe(5);
  });

  it('ranks emergency-capable facilities higher for HIGH risk triage patients', () => {
    const ranked = rankFacilities(MOCK_FACILITIES, userLat, userLng, {
      riskTier: 'HIGH',
      maxRadiusKm: 50,
    });

    expect(ranked.length).toBeGreaterThan(0);
    const topFacility = ranked[0];

    // For high-risk patients, top facility must be emergency capable
    expect(topFacility.facility.emergencyCapable).toBe(true);
    expect(topFacility.isEmergencyMatch).toBe(true);
    expect(topFacility.score).toBeGreaterThan(50);
  });

  it('ranks nearest accessible local care center higher for LOW risk patients', () => {
    const ranked = rankFacilities(MOCK_FACILITIES, userLat, userLng, {
      riskTier: 'LOW',
      maxRadiusKm: 50,
    });

    expect(ranked.length).toBeGreaterThan(0);
    const topFacility = ranked[0];

    // Kendur SC is right at user location (< 1km)
    expect(topFacility.distanceKm).toBeLessThan(2);
    expect(['SC', 'PHC', 'PRIVATE']).toContain(topFacility.facility.type);
  });

  it('filters out facilities outside the maximum radius', () => {
    const strictRanked = rankFacilities(MOCK_FACILITIES, userLat, userLng, {
      maxRadiusKm: 15,
    });

    for (const item of strictRanked) {
      expect(item.distanceKm).toBeLessThanOrEqual(15);
    }
  });
});
