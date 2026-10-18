import { calculateHaversineDistanceKm } from './ranker.js';

export interface RouteEstimate {
  distanceKm: number;
  durationMinutes: number;
  provider: 'estimated' | 'osrm';
  isApprox: boolean;
}

export interface RoutingProvider {
  calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteEstimate>;
}

/**
 * Default rural routing provider using Haversine straight-line distance,
 * rural road factor (1.3), and assumed average speed (default 35 km/h).
 * Labeled explicitly as "approx" per Section 8.
 */
export class EstimatedRoutingProvider implements RoutingProvider {
  constructor(
    private avgSpeedKmh: number = 35,
    private roadFactor: number = 1.3,
  ) {}

  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteEstimate> {
    const straightLine = calculateHaversineDistanceKm(originLat, originLng, destLat, destLng);
    const routedDistance = Math.round(straightLine * this.roadFactor * 10) / 10;
    const durationMinutes = Math.max(
      Math.round((routedDistance / Math.max(this.avgSpeedKmh, 10)) * 60),
      5,
    );

    return {
      distanceKm: routedDistance,
      durationMinutes,
      provider: 'estimated',
      isApprox: true,
    };
  }
}

/**
 * Optional routing service provider when ROUTING_BASE_URL is configured.
 * Never points production traffic at a public demo server.
 */
export class ServiceRoutingProvider implements RoutingProvider {
  constructor(
    private baseUrl: string,
    private fallback: RoutingProvider = new EstimatedRoutingProvider(),
  ) {}

  async calculateRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteEstimate> {
    if (!this.baseUrl) {
      return this.fallback.calculateRoute(originLat, originLng, destLat, destLng);
    }

    try {
      // OSRM style route request: /route/v1/driving/{lng1},{lat1};{lng2},{lat2}?overview=false
      const url = `${this.baseUrl.replace(/\/$/, '')}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return {
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMinutes: Math.max(Math.round(route.duration / 60), 1),
            provider: 'osrm',
            isApprox: false,
          };
        }
      }
    } catch {
      // Fallback to estimated routing on network or timeout failure
    }

    return this.fallback.calculateRoute(originLat, originLng, destLat, destLng);
  }
}
