import type { Facility, RankedFacility } from './schemas/facility.js';
import type { RiskTier, Syndrome } from './enums.js';

/**
 * Pure Haversine formula distance calculation in kilometers.
 */
export const calculateHaversineDistanceKm = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
};

/**
 * Calculate initial forward bearing from (lat1, lon1) to (lat2, lon2) in degrees (0..360).
 * 0° = North, 90° = East, 180° = South, 270° = West.
 */
export const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return Math.round(((toDeg(θ) + 360) % 360) * 10) / 10;
};

/**
 * Estimate rural road travel time in minutes assuming 35 km/h average rural road speed.
 */
export const estimateTravelTimeMinutes = (
  distanceKm: number,
  avgSpeedKmh: number = 35,
): number => {
  const hours = (distanceKm * 1.3) / Math.max(avgSpeedKmh, 10);
  return Math.max(Math.round(hours * 60), 5);
};

export interface RankingOptions {
  riskTier?: RiskTier;
  syndrome?: Syndrome;
  maxRadiusKm?: number;
}

/**
 * Facility Ranking Algorithm per Section 8:
 * Formula: 0.40 Proximity + 0.25 Tier Fit + 0.20 Load Fit + 0.15 Service Fit
 * - Low/Medium risk prefers suitable nearby PHCs, CHCs and Sub-Centres over distant tertiary hospitals.
 * - Emergency cases strictly favor emergency-capable facilities ranked primarily by distance.
 */
export const rankFacilities = (
  facilities: Facility[],
  userLat: number,
  userLng: number,
  options: RankingOptions = {},
): RankedFacility[] => {
  const { riskTier = 'LOW', maxRadiusKm = 50 } = options;

  const results: RankedFacility[] = [];

  for (const facility of facilities) {
    const [facLng, facLat] = facility.location.coordinates;
    const distanceKm = calculateHaversineDistanceKm(userLat, userLng, facLat, facLng);

    if (distanceKm > maxRadiusKm) {
      continue;
    }

    const approxTravelTimeMinutes = estimateTravelTimeMinutes(distanceKm);
    const bearingDeg = calculateBearing(userLat, userLng, facLat, facLng);

    // 1. Proximity Term (0.0 to 1.0) - weight: 0.40
    // Linear decay within search radius
    const proximityTerm = Math.max(0, 1 - distanceKm / maxRadiusKm);

    // 2. Tier Fit Term (0.0 to 1.0) - weight: 0.25
    let tierFitTerm = 0.5;
    let isEmergencyMatch = false;
    let notes = '';

    if (riskTier === 'HIGH') {
      if (facility.emergencyCapable) {
        tierFitTerm = 1.0;
        isEmergencyMatch = true;
        notes = 'Equipped for 24x7 emergency response and critical stabilization.';
      } else {
        tierFitTerm = 0.05; // Do not recommend facilities that cannot meet emergency need
        notes = 'Basic outpatient only. Not equipped for acute emergencies.';
      }
    } else if (riskTier === 'MEDIUM') {
      if (facility.type === 'PHC' || facility.type === 'CHC') {
        tierFitTerm = 1.0;
        notes = 'Recommended primary care facility with doctor & pharmacy.';
      } else if (facility.type === 'CLINIC') {
        tierFitTerm = 0.85;
        notes = 'Medical clinic with outpatient consultation.';
      } else if (facility.type === 'SC') {
        tierFitTerm = 0.6;
        notes = 'Village sub-centre for initial nursing check & advice.';
      } else if (facility.type === 'PHARMACY') {
        tierFitTerm = 0.2;
        notes = 'Dispensary only - clinical evaluation recommended.';
      } else {
        // SDH, DH - large hospitals not favoured over suitable PHC
        tierFitTerm = 0.7;
        notes = 'Secondary care facility.';
      }
    } else {
      // LOW risk - nearest accessible PHC, SC, or clinic is best
      if (facility.type === 'PHC' || facility.type === 'SC' || facility.type === 'PRIVATE' || facility.type === 'CLINIC') {
        tierFitTerm = 1.0;
        notes = 'Nearest accessible outpatient center for mild symptoms.';
      } else if (facility.type === 'PHARMACY') {
        tierFitTerm = 0.75;
        notes = 'Dispensary & pharmacy for essential OTC / prescribed medicines.';
      } else if (facility.type === 'CHC') {
        tierFitTerm = 0.8;
        notes = 'Community health center.';
      } else {
        // Distant DH/SDH penalised for low-risk so tertiary hospitals are not overcrowded
        tierFitTerm = 0.5;
        notes = 'Tertiary hospital - basic primary clinic preferred for mild symptoms.';
      }
    }

    // 3. Load Fit Term (0.0 to 1.0) - weight: 0.20
    let loadTerm = 0.7; // Neutral fallback when load is unmonitored
    if (facility.capacityPerDay && facility.currentLoad !== undefined) {
      const loadRatio = facility.currentLoad / Math.max(facility.capacityPerDay, 1);
      loadTerm = Math.max(0, Math.min(1, 1 - loadRatio));
    }

    // 4. Service Fit Term (0.0 to 1.0) - weight: 0.15
    let serviceFitTerm = 0.75;
    if (facility.open24x7) {
      serviceFitTerm = 1.0;
    } else if (facility.services && facility.services.length > 3) {
      serviceFitTerm = 0.85;
    }

    // Weighted Score: 0.40 proximity + 0.25 tier fit + 0.20 load + 0.15 service fit
    const rawScore =
      0.4 * proximityTerm +
      0.25 * tierFitTerm +
      0.2 * loadTerm +
      0.15 * serviceFitTerm;

    const finalScore = Math.max(0, Math.min(100, Math.round(rawScore * 100)));

    results.push({
      facility,
      distanceKm,
      approxTravelTimeMinutes,
      score: finalScore,
      isEmergencyMatch,
      notes,
      bearingDeg,
      breakdown: {
        proximity: Math.round(proximityTerm * 100),
        tierFit: Math.round(tierFitTerm * 100),
        load: Math.round(loadTerm * 100),
        serviceFit: Math.round(serviceFitTerm * 100),
      },
    });
  }

  // Sorting:
  // For HIGH risk / Emergency: emergencyCapable facilities ALWAYS appear first, ordered by distance ascending
  // For LOW/MEDIUM: sorted by final weighted score descending, then distance ascending
  return results.sort((a, b) => {
    if (riskTier === 'HIGH') {
      const aEmerg = a.facility.emergencyCapable ? 1 : 0;
      const bEmerg = b.facility.emergencyCapable ? 1 : 0;
      if (bEmerg !== aEmerg) return bEmerg - aEmerg;
      return a.distanceKm - b.distanceKm;
    }

    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.distanceKm - b.distanceKm;
  });
};
