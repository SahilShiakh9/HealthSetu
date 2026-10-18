import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFacilities } from '../features/facilities/useFacilities.js';
import { FacilityListPage } from '../features/facilities/FacilityListPage.js';
import { db } from '../offline/db.js';
import type { RankedFacility } from '@healthsetu/contracts';

vi.mock('../offline/network.js', () => ({
  isOnline: () => true,
  networkMonitor: {
    isOnline: true,
    subscribe: () => () => {},
  },
}));

// Mock Leaflet Map for jsdom
vi.mock('../features/facilities/FacilityMap.js', () => ({
  FacilityMap: ({ facilities, selectedFacilityId, onSelectFacility }: any) => (
    <div data-testid="mock-facility-map">
      <span>Mock Leaflet Map ({facilities?.length || 0} facilities)</span>
      {facilities?.map((f: any) => (
        <button
          key={f.facility.id}
          data-testid={`map-marker-${f.facility.id}`}
          onClick={() => onSelectFacility(f.facility.id)}
        >
          {f.facility.name} {selectedFacilityId === f.facility.id ? '[SELECTED]' : ''}
        </button>
      ))}
    </div>
  ),
}));

const SAMPLE_GEOAPIFY_FACILITIES: RankedFacility[] = [
  {
    facility: {
      id: 'fac-geo-001',
      name: 'Sahyadri Specialty Hospital',
      type: 'DH',
      location: { type: 'Point', coordinates: [73.8567, 18.5204] },
      address: 'Deccan Gymkhana, Pune',
      phone: '+912067213000',
      openHours: '24 Hours',
      open24x7: true,
      emergencyCapable: true,
      services: ['ICU', 'Emergency', 'Cardiology'],
      dataSource: 'GEOAPIFY',
      sources: ['GEOAPIFY'],
      sourceAttribution: 'Powered by Geoapify',
      districtCode: 'PUNE',
      isMock: false,
      updatedAt: Date.now(),
    },
    distanceKm: 4.2,
    approxTravelTimeMinutes: 12,
    score: 92,
    isEmergencyMatch: true,
    breakdown: { proximity: 90, tierFit: 95, load: 90, serviceFit: 95 },
  },
];

const SAMPLE_MONGODB_FACILITIES: RankedFacility[] = [
  {
    facility: {
      id: 'fac-db-001',
      name: 'Pabal Primary Health Centre',
      type: 'PHC',
      location: { type: 'Point', coordinates: [74.0531, 18.8256] },
      address: 'Pabal, Shirur, Pune',
      phone: '+912138242100',
      openHours: '8:00 AM - 4:00 PM',
      open24x7: false,
      emergencyCapable: false,
      services: ['OPD', 'Maternal Health', 'Vaccination'],
      dataSource: 'MANUAL_VERIFIED',
      sources: ['MANUAL_VERIFIED'],
      sourceAttribution: 'Government of Maharashtra Public Directory',
      districtCode: 'PUNE',
      isMock: false,
      updatedAt: Date.now(),
    },
    distanceKm: 7.5,
    approxTravelTimeMinutes: 18,
    score: 84,
    isEmergencyMatch: false,
    breakdown: { proximity: 85, tierFit: 85, load: 80, serviceFit: 85 },
  },
];

const SAMPLE_OVERPASS_FACILITIES: RankedFacility[] = [
  {
    facility: {
      id: 'osm:node:998877',
      name: 'Alandi Primary Health Centre',
      type: 'PHC',
      location: { type: 'Point', coordinates: [73.898, 18.6752] },
      address: 'Alandi Devachi, Pune',
      phone: '', // Unlisted
      openHours: '9:00 AM - 5:00 PM',
      open24x7: false,
      emergencyCapable: false,
      services: ['OPD', 'Immunization'],
      dataSource: 'OPEN_STREET_MAP',
      sources: ['OPEN_STREET_MAP'],
      sourceAttribution: '© OpenStreetMap contributors',
      districtCode: 'PUNE',
      isMock: false,
      updatedAt: Date.now(),
    },
    distanceKm: 0.8,
    approxTravelTimeMinutes: 5,
    score: 85,
    isEmergencyMatch: false,
    breakdown: { proximity: 98, tierFit: 80, load: 85, serviceFit: 80 },
  },
];

describe('Nearby Healthcare Discovery & GPS Automation (Frontend)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.facilities.clear();

    // Default mock fetch returning strategy-specific fixtures
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('strategy=geoapify')) {
        return {
          ok: true,
          json: async () => ({
            facilities: SAMPLE_GEOAPIFY_FACILITIES,
            discovery: { provider: 'geoapify', durationMs: 120, liveSuccess: true },
          }),
        } as any;
      }
      if (url.includes('strategy=mongodb')) {
        return {
          ok: true,
          json: async () => ({
            facilities: SAMPLE_MONGODB_FACILITIES,
            discovery: { provider: 'mongodb', durationMs: 15, liveSuccess: true },
          }),
        } as any;
      }
      if (url.includes('strategy=overpass')) {
        return {
          ok: true,
          json: async () => ({
            facilities: SAMPLE_OVERPASS_FACILITIES,
            discovery: { provider: 'overpass', durationMs: 400, liveSuccess: true },
          }),
        } as any;
      }

      return {
        ok: true,
        json: async () => ({
          facilities: [...SAMPLE_GEOAPIFY_FACILITIES, ...SAMPLE_OVERPASS_FACILITIES],
          discovery: { provider: 'hybrid', durationMs: 180, liveSuccess: true },
        }),
      } as any;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('1. useFacilities Hook & GPS Automation Flow', () => {
    it('initializes with default/saved region marked as approximate fallback', () => {
      const { result } = renderHook(() => useFacilities('LOW'));

      expect(result.current.isGpsActive).toBe(false);
      expect(result.current.isApproximateLocation).toBe(true);
      expect(result.current.userCoords.lat).toBeCloseTo(18.6752, 2);
      expect(result.current.userCoords.lng).toBeCloseTo(73.898, 2);
    });

    it('handles GPS permission grant and updates location accurately', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn().mockImplementation((success) => {
          success({
            coords: {
              latitude: 18.5204,
              longitude: 73.8567,
              accuracy: 15,
            },
          });
        }),
      };
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: mockGeolocation,
        permissions: { query: vi.fn().mockResolvedValue({ state: 'granted', onchange: null }) },
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      await act(async () => {
        result.current.requestLocation();
      });

      expect(result.current.isGpsActive).toBe(true);
      expect(result.current.isApproximateLocation).toBe(false);
      expect(result.current.coordsAccuracyM).toBe(15);
      expect(result.current.locationLabel).toContain('Live GPS');
      expect(result.current.userCoords.lat).toBe(18.5204);
      expect(result.current.userCoords.lng).toBe(73.8567);
    });

    it('handles GPS permission denial gracefully without substituting unrelated coordinates', async () => {
      const mockGeolocation = {
        getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
          error({
            code: 1, // PERMISSION_DENIED
            PERMISSION_DENIED: 1,
          });
        }),
      };
      vi.stubGlobal('navigator', {
        ...navigator,
        geolocation: mockGeolocation,
        permissions: { query: vi.fn().mockResolvedValue({ state: 'denied', onchange: null }) },
      });

      const { result } = renderHook(() => useFacilities('LOW'));
      const initialCoords = { ...result.current.userCoords };

      await act(async () => {
        result.current.requestLocation();
      });

      expect(result.current.isGpsActive).toBe(false);
      expect(result.current.isApproximateLocation).toBe(true);
      expect(result.current.locationError).toContain('Location permission was denied');
      expect(result.current.userCoords.lat).toBe(initialCoords.lat);
      expect(result.current.userCoords.lng).toBe(initialCoords.lng);
    });

    it('switches discovery region and marks it as approximate location', async () => {
      const { result } = renderHook(() => useFacilities('LOW'));

      const shikrapurPreset = {
        name: 'Shikrapur (Shirur, Pune)',
        lat: 18.7842,
        lng: 74.1205,
        district: 'Pune',
        state: 'Maharashtra',
      };

      await act(async () => {
        result.current.selectLocation(shikrapurPreset);
      });

      expect(result.current.isGpsActive).toBe(false);
      expect(result.current.isApproximateLocation).toBe(true);
      expect(result.current.userCoords.lat).toBe(18.7842);
      expect(result.current.userCoords.lng).toBe(74.1205);
      expect(result.current.locationLabel).toContain('Shikrapur (Shirur, Pune)');
    });

    it('validates manual custom coordinates properly', async () => {
      const { result } = renderHook(() => useFacilities('LOW'));
      const prevCoords = { ...result.current.userCoords };

      // Invalid latitude (> 90) must be ignored
      await act(async () => {
        result.current.setCustomCoordinates(95, 74.0);
      });
      expect(result.current.userCoords.lat).toBe(prevCoords.lat);

      // Valid coordinates are applied
      await act(async () => {
        result.current.setCustomCoordinates(19.9982, 73.7891, 'Nashik Pin');
      });
      expect(result.current.userCoords.lat).toBe(19.9982);
      expect(result.current.userCoords.lng).toBe(73.7891);
      expect(result.current.locationLabel).toBe('Nashik Pin');
    });

    it('filters facilities accurately by category and emergency readiness', async () => {
      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.facilities.length).toBeGreaterThanOrEqual(1);
      });

      // Filter by HOSPITAL only (matches DH / CHC / SDH)
      act(() => {
        result.current.setFilterType('HOSPITAL');
      });
      expect(result.current.facilities.every((f) => ['DH', 'CHC', 'SDH'].includes(f.facility.type))).toBe(true);

      // Filter by EMERGENCY only
      act(() => {
        result.current.setFilterType('EMERGENCY');
      });
      expect(result.current.facilities.every((f) => f.facility.emergencyCapable)).toBe(true);
    });
  });

  describe('2. FacilityListPage UI App Experience', () => {
    it('renders the native app header, emergency guidance banner, and Use My Current Location button', async () => {
      render(
        <MemoryRouter>
          <FacilityListPage />
        </MemoryRouter>,
      );

      // Page Title & Header
      expect(screen.getByRole('heading', { name: /Nearby Facilities/i })).toBeInTheDocument();

      // Emergency 108 Ambulance Guidance
      expect(screen.getByText(/108 Ambulance/i)).toBeInTheDocument();
      expect(screen.getByText(/112 Emergency/i)).toBeInTheDocument();

      // Primary Action Button
      expect(screen.getByText(/Use My Current Location/i)).toBeInTheDocument();
    });

    it('renders Geoapify and OpenStreetMap provenance badges on facility cards', async () => {
      render(
        <MemoryRouter>
          <FacilityListPage />
        </MemoryRouter>,
      );

      // Wait for facilities to render
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sahyadri Specialty Hospital' })).toBeInTheDocument();
      });

      // Geoapify Places Badge
      expect(screen.getAllByText(/Geoapify Places/i).length).toBeGreaterThanOrEqual(1);

      // Verified call button for facility with valid phone
      expect(screen.getAllByText(/Call Facility/i).length).toBeGreaterThanOrEqual(1);
    });

    it('opens and closes the Change Discovery Location modal', async () => {
      render(
        <MemoryRouter>
          <FacilityListPage />
        </MemoryRouter>,
      );

      // Tap Change Area button
      const changeAreaBtn = screen.getByRole('button', { name: /Change Area/i });
      fireEvent.click(changeAreaBtn);

      // Modal appears
      expect(screen.getByText(/Change Discovery Location/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search city, district/i)).toBeInTheDocument();

      // Close modal
      const closeBtn = screen.getByLabelText(/Close/i);
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByText(/Change Discovery Location/i)).not.toBeInTheDocument();
      });
    });

    it('synchronizes selection between facility cards and map markers', async () => {
      render(
        <MemoryRouter>
          <FacilityListPage />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Sahyadri Specialty Hospital' })).toBeInTheDocument();
      });

      // Click card
      const heading = screen.getByRole('heading', { name: 'Sahyadri Specialty Hospital' });
      const card = heading.closest('#facility-card-fac-geo-001');
      expect(card).toBeInTheDocument();
      fireEvent.click(card!);

      // Map marker reflects selection
      await waitFor(() => {
        expect(screen.getByTestId('map-marker-fac-geo-001')).toHaveTextContent(/\[SELECTED\]/);
      });
    });
  });

  describe('3. Deterministic Progressive Discovery & Provider Resilience Suite', () => {
    it('1. Geoapify results render before a deliberately slow Overpass response completes', async () => {
      let resolveOverpass: any;
      const overpassPromise = new Promise((resolve) => {
        resolveOverpass = resolve;
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('strategy=geoapify')) {
          return {
            ok: true,
            json: async () => ({
              facilities: SAMPLE_GEOAPIFY_FACILITIES,
              discovery: { provider: 'geoapify', durationMs: 80, liveSuccess: true },
            }),
          } as any;
        }
        if (url.includes('strategy=mongodb')) {
          return {
            ok: true,
            json: async () => ({ facilities: [], discovery: { provider: 'mongodb', durationMs: 5 } }),
          } as any;
        }
        if (url.includes('strategy=overpass')) {
          await overpassPromise;
          return {
            ok: true,
            json: async () => ({ facilities: SAMPLE_OVERPASS_FACILITIES, discovery: { provider: 'overpass' } }),
          } as any;
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      // Geoapify renders immediately (< 100ms) while Overpass is still pending
      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'fac-geo-001')).toBe(true);
      });

      expect(result.current.providerProgress.geoapify.status).toBe('done');
      expect(result.current.providerProgress.overpass.status).toBe('searching');

      // Now release slow Overpass
      await act(async () => {
        resolveOverpass();
      });

      // Overpass is now merged
      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'osm:node:998877')).toBe(true);
      });
      expect(result.current.providerProgress.overpass.status).toBe('done');
    });

    it('2. MongoDB results render immediately if MongoDB responds first', async () => {
      let resolveGeoapify: any;
      const geoapifyPromise = new Promise((resolve) => {
        resolveGeoapify = resolve;
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('strategy=mongodb')) {
          return {
            ok: true,
            json: async () => ({
              facilities: SAMPLE_MONGODB_FACILITIES,
              discovery: { provider: 'mongodb', durationMs: 10, liveSuccess: true },
            }),
          } as any;
        }
        if (url.includes('strategy=geoapify')) {
          await geoapifyPromise;
          return {
            ok: true,
            json: async () => ({ facilities: SAMPLE_GEOAPIFY_FACILITIES, discovery: { provider: 'geoapify' } }),
          } as any;
        }
        if (url.includes('strategy=overpass')) {
          return { ok: true, json: async () => ({ facilities: [] }) } as any;
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      // MongoDB renders first
      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'fac-db-001')).toBe(true);
      });
      expect(result.current.providerProgress.mongodb.status).toBe('done');

      // Then Geoapify completes
      await act(async () => {
        resolveGeoapify();
      });

      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'fac-geo-001')).toBe(true);
      });
    });

    it('3. Overpass results are appended after Geoapify without clearing the existing list', async () => {
      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.facilities.length).toBe(3);
      });

      const ids = result.current.facilities.map((f) => f.facility.id);
      expect(ids).toContain('fac-geo-001');
      expect(ids).toContain('fac-db-001');
      expect(ids).toContain('osm:node:998877');
    });

    it('4. Duplicate facilities appear only once', async () => {
      // Return the same facility from both Geoapify and OSM
      const duplicateOsmFacility: RankedFacility = {
        facility: {
          id: 'osm:node:998877',
          osmId: '998877',
          name: 'Sahyadri Specialty Hospital, Pune',
          type: 'DH',
          location: { type: 'Point', coordinates: [73.8567, 18.5204] }, // identical coords
          address: 'Deccan Gymkhana, Pune',
          phone: '',
          openHours: '24 Hours',
          open24x7: true,
          emergencyCapable: true,
          services: ['ICU', 'Emergency'],
          dataSource: 'OPEN_STREET_MAP',
          sources: ['OPEN_STREET_MAP'],
          districtCode: 'PUNE',
          isMock: false,
          updatedAt: Date.now(),
        },
        distanceKm: 4.2,
        approxTravelTimeMinutes: 12,
        score: 90,
        isEmergencyMatch: true,
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('strategy=geoapify')) {
          return { ok: true, json: async () => ({ facilities: SAMPLE_GEOAPIFY_FACILITIES }) } as any;
        }
        if (url.includes('strategy=overpass')) {
          return { ok: true, json: async () => ({ facilities: [duplicateOsmFacility] }) } as any;
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.providerProgress.geoapify.status).toBe('done');
        expect(result.current.providerProgress.overpass.status).toBe('done');
      });

      // Deduplication collapses both records into 1 unique facility
      const sahyadriMatches = result.current.facilities.filter((f) =>
        f.facility.name.includes('Sahyadri'),
      );
      expect(sahyadriMatches.length).toBe(1);
    });

    it('5. A failed Geoapify request does not prevent MongoDB results from appearing', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('strategy=geoapify')) {
          return { ok: false, status: 500 } as any;
        }
        if (url.includes('strategy=mongodb')) {
          return { ok: true, json: async () => ({ facilities: SAMPLE_MONGODB_FACILITIES }) } as any;
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'fac-db-001')).toBe(true);
      });
      expect(result.current.providerProgress.geoapify.status).toBe('failed');
      expect(result.current.providerProgress.mongodb.status).toBe('done');
    });

    it('6. An Overpass timeout does not erase Geoapify or MongoDB results', async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('strategy=geoapify')) {
          return { ok: true, json: async () => ({ facilities: SAMPLE_GEOAPIFY_FACILITIES }) } as any;
        }
        if (url.includes('strategy=mongodb')) {
          return { ok: true, json: async () => ({ facilities: SAMPLE_MONGODB_FACILITIES }) } as any;
        }
        if (url.includes('strategy=overpass')) {
          return { ok: false, status: 504 } as any; // HTTP 504 Gateway Timeout
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.providerProgress.overpass.status).toBe('timeout');
      });

      // Geoapify and MongoDB facilities are preserved and visible
      expect(result.current.facilities.some((f) => f.facility.id === 'fac-geo-001')).toBe(true);
      expect(result.current.facilities.some((f) => f.facility.id === 'fac-db-001')).toBe(true);
      expect(result.current.statusMessage).toContain('OpenStreetMap timed out; showing 2 facilities');
    });

    it('7. A changed GPS location prevents older requests from overwriting the new location results', async () => {
      let resolveFirstGeoapify: any;
      const firstGeoPromise = new Promise((resolve) => {
        resolveFirstGeoapify = resolve;
      });

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('lat=18.6752')) {
          await firstGeoPromise;
          return {
            ok: true,
            json: async () => ({ facilities: SAMPLE_GEOAPIFY_FACILITIES }),
          } as any;
        }
        if (url.includes('lat=28.6139')) {
          // New Delhi coordinates
          return {
            ok: true,
            json: async () => ({
              facilities: [
                {
                  facility: {
                    id: 'delhi-aiims-001',
                    name: 'AIIMS New Delhi',
                    type: 'DH',
                    location: { type: 'Point', coordinates: [77.209, 28.6139] },
                    address: 'Ansari Nagar, New Delhi',
                    phone: '+911126588500',
                    openHours: '24 Hours',
                    open24x7: true,
                    emergencyCapable: true,
                    services: ['Emergency', 'Trauma'],
                    dataSource: 'MANUAL_VERIFIED',
                    districtCode: 'NEW_DELHI',
                    isMock: false,
                    updatedAt: Date.now(),
                  },
                  distanceKm: 1.2,
                  approxTravelTimeMinutes: 5,
                  score: 95,
                  isEmergencyMatch: true,
                },
              ],
            }),
          } as any;
        }
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      // Immediately switch location to New Delhi before first request completes
      await act(async () => {
        result.current.setCustomCoordinates(28.6139, 77.209, 'New Delhi');
      });

      // New Delhi results appear
      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'delhi-aiims-001')).toBe(true);
      });

      // Now release first older request
      await act(async () => {
        resolveFirstGeoapify();
      });

      // Stale response must NOT overwrite New Delhi results
      expect(result.current.facilities.some((f) => f.facility.id === 'delhi-aiims-001')).toBe(true);
      expect(result.current.facilities.some((f) => f.facility.id === 'fac-geo-001')).toBe(false);
    });

    it('8. Loading and empty states are accurate', async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        return { ok: true, json: async () => ({ facilities: [] }) } as any;
      });

      const { result } = renderHook(() => useFacilities('LOW'));

      await waitFor(() => {
        expect(result.current.providerProgress.geoapify.status).toBe('done');
        expect(result.current.providerProgress.mongodb.status).toBe('done');
        expect(result.current.providerProgress.overpass.status).toBe('done');
      });

      expect(result.current.facilities.length).toBe(0);
      expect(result.current.statusMessage).toContain('No facilities found within 25 km');
    });

    it('9. Offline cached results remain available when providers fail', async () => {
      // Seed Dexie with a cached facility
      await db.facilities.put({
        id: 'cached-sc-001',
        name: 'Alandi Sub-Centre (Cached)',
        type: 'SC',
        location: { type: 'Point', coordinates: [73.898, 18.6752] },
        districtCode: 'PUNE',
        services: ['Primary Care'],
        servicesMask: 1,
        open24x7: false,
        openHours: '9:00 AM - 4:00 PM',
        phone: '',
        emergencyCapable: false,
        dataSource: 'MANUAL_VERIFIED',
        isMock: false,
        updatedAt: Date.now(),
      });

      // All network requests fail
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

      const { result } = renderHook(() => useFacilities('LOW'));

      // Cached result loaded immediately from local storage
      await waitFor(() => {
        expect(result.current.facilities.some((f) => f.facility.id === 'cached-sc-001')).toBe(true);
      });
    });

    it('10. The private Geoapify API key never appears in frontend responses or logs', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const errorSpy = vi.spyOn(console, 'error');

      render(
        <MemoryRouter>
          <FacilityListPage />
        </MemoryRouter>,
      );

      // Verify no API keys in HTML DOM
      const html = document.body.innerHTML;
      expect(html).not.toMatch(/apiKey=[a-zA-Z0-9_-]{20,}/i);
      expect(html).not.toMatch(/GEOAPIFY_API_KEY/i);

      // Verify no leaked keys in logs
      for (const call of [...consoleSpy.mock.calls, ...errorSpy.mock.calls]) {
        for (const arg of call) {
          const str = String(arg);
          expect(str).not.toMatch(/apiKey=[a-zA-Z0-9_-]{20,}/i);
        }
      }
    });
  });
});
