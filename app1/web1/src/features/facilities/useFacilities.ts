import { useState, useEffect, useCallback, useRef } from 'react';
import {
  rankFacilities,
  mergeAndDeduplicateFacilities,
  type RankedFacility,
  type Facility,
  type RiskTier,
} from '@healthsetu/contracts';
import { db } from '../../offline/db.js';
import { isOnline } from '../../offline/network.js';

export interface LocationPreset {
  name: string;
  lat: number;
  lng: number;
  district: string;
  state: string;
}

// India-wide representative test & discovery presets
// Shikrapur (Shirur, Pune) is explicitly included and disambiguated
export const INDIA_LOCATION_PRESETS: LocationPreset[] = [
  { name: 'Shikrapur (Shirur, Pune)', lat: 18.7842, lng: 74.1205, district: 'Pune', state: 'Maharashtra' },
  { name: 'Nagpur Central', lat: 21.1458, lng: 79.0882, district: 'Nagpur', state: 'Maharashtra' },
  { name: 'Alandi Devachi, Pune', lat: 18.6752, lng: 73.8980, district: 'Pune', state: 'Maharashtra' },
  { name: 'Pimpri-Chinchwad (PCMC)', lat: 18.6231, lng: 73.8184, district: 'Pune', state: 'Maharashtra' },
  { name: 'Pune City Central', lat: 18.5204, lng: 73.8567, district: 'Pune', state: 'Maharashtra' },
  { name: 'Shirur Rural Cluster', lat: 18.8256, lng: 74.3789, district: 'Pune', state: 'Maharashtra' },
  { name: 'Nashik District Center', lat: 19.9982, lng: 73.7891, district: 'Nashik', state: 'Maharashtra' },
  { name: 'New Delhi Central', lat: 28.6139, lng: 77.2090, district: 'New Delhi', state: 'Delhi' },
  { name: 'Mumbai Central', lat: 18.9696, lng: 72.8193, district: 'Mumbai', state: 'Maharashtra' },
  { name: 'Bengaluru Urban', lat: 12.9716, lng: 77.5946, district: 'Bengaluru', state: 'Karnataka' },
  { name: 'Hyderabad Central', lat: 17.3850, lng: 78.4867, district: 'Hyderabad', state: 'Telangana' },
  { name: 'Chennai Central', lat: 13.0827, lng: 80.2707, district: 'Chennai', state: 'Tamil Nadu' },
  { name: 'Kolkata Central', lat: 22.5726, lng: 88.3639, district: 'Kolkata', state: 'West Bengal' },
  { name: 'Jaipur Central', lat: 26.9124, lng: 75.7873, district: 'Jaipur', state: 'Rajasthan' },
  { name: 'Lucknow Central', lat: 26.8467, lng: 80.9462, district: 'Lucknow', state: 'Uttar Pradesh' },
  { name: 'Ahmedabad Central', lat: 23.0225, lng: 72.5714, district: 'Ahmedabad', state: 'Gujarat' },
];

export interface ProviderProgress {
  status: 'idle' | 'searching' | 'done' | 'failed' | 'timeout';
  count: number;
  durationMs?: number;
  error?: string;
}

export interface ProviderProgressState {
  geoapify: ProviderProgress;
  mongodb: ProviderProgress;
  overpass: ProviderProgress;
}

// Initial default coordinate: checks localStorage for last-known location or defaults to Alandi test coordinates
export const getInitialCoordinates = () => {
  try {
    const saved = localStorage.getItem('healthsetu_last_coords');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return { lat: 18.6752, lng: 73.8980 }; // Alandi coordinates
};

export const useFacilities = (riskTier: RiskTier = 'LOW') => {
  const [facilities, setFacilities] = useState<RankedFacility[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number }>(getInitialCoordinates);
  const [locationLabel, setLocationLabel] = useState<string>('Alandi Devachi, Pune (Approximate Fallback)');
  const [coordsAccuracyM, setCoordsAccuracyM] = useState<number | null>(null);
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isApproximateLocation, setIsApproximateLocation] = useState<boolean>(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'granted' | 'prompt' | 'denied' | 'unsupported'>('prompt');
  const [discoveryStrategy, setDiscoveryStrategy] = useState<'hybrid' | 'mongodb' | 'geoapify' | 'overpass'>('hybrid');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [emergencyOnly, setEmergencyOnly] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(!isOnline());
  const [lastCacheUpdate, setLastCacheUpdate] = useState<number | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [isOutOfCacheArea, setIsOutOfCacheArea] = useState<boolean>(false);
  const [searchRadiusKm, setSearchRadiusKm] = useState<number>(25);

  // Progressive provider progress tracking
  const [providerProgress, setProviderProgress] = useState<ProviderProgressState>({
    geoapify: { status: 'idle', count: 0 },
    mongodb: { status: 'idle', count: 0 },
    overpass: { status: 'idle', count: 0 },
  });

  const [discoveryMetadata, setDiscoveryMetadata] = useState<{
    liveAttempted: boolean;
    liveSuccess: boolean;
    provider: string;
    durationMs: number;
    dbCount: number;
    liveRawCount: number;
    validLiveCount: number;
    newLiveAdded: number;
    duplicatesRemoved: number;
    strategy?: string;
    note?: string;
    error?: string;
  } | null>(null);

  // Performance tracking & AbortController to discard stale in-flight requests
  const activeRequestIdRef = useRef<number>(0);
  const inFlightKeyRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(false);
  const displayedFacilitiesRef = useRef<Facility[]>([]);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOfflineMode(false);
    const handleOffline = () => setIsOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check geolocation permissions safely
  useEffect(() => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        'permissions' in navigator &&
        typeof navigator.permissions?.query === 'function'
      ) {
        const queryPromise = navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (queryPromise && typeof queryPromise.then === 'function') {
          queryPromise
            .then((status) => {
              if (status) {
                setPermissionState(status.state as any);
                status.onchange = () => {
                  setPermissionState(status.state as any);
                };
              }
            })
            .catch(() => {
              setPermissionState('prompt');
            });
          return;
        }
      }
    } catch {
      // Geolocation permissions query unsupported or restricted
    }
    setPermissionState('prompt');
  }, []);

  // Fast offline cache loader (< 15ms)
  const rankFromLocalCache = useCallback(
    async (coords: { lat: number; lng: number }) => {
      try {
        const cached = await db.facilities.toArray();
        if (cached && cached.length > 0) {
          const ranked = rankFacilities(cached as Facility[], coords.lat, coords.lng, {
            riskTier,
            maxRadiusKm: searchRadiusKm,
          });
          if (ranked.length > 0) {
            displayedFacilitiesRef.current = cached as Facility[];
            setFacilities(ranked);
            setLastCacheUpdate(cached[0].updatedAt || Date.now());
            setIsOutOfCacheArea(false);
            return ranked;
          }
        }
        return [];
      } catch (err) {
        console.warn('Error reading from local facility Dexie cache:', err);
        return [];
      }
    },
    [riskTier, searchRadiusKm],
  );

  /**
   * Progressive Multi-Provider Fetch:
   * 1. Instantly renders local Dexie cache if present (< 10ms).
   * 2. Fires independent requests for Geoapify, MongoDB, and Overpass.
   * 3. As Geoapify responds, immediately renders and places markers on the map!
   * 4. As MongoDB responds, merges newly available facilities without waiting for Overpass.
   * 5. As Overpass responds, merges unique facilities. If Overpass times out (e.g. 504),
   *    preserves all Geoapify and MongoDB facilities already displayed!
   */
  const fetchNearby = useCallback(
    async (coords: { lat: number; lng: number }, forceRefresh = false) => {
      const requestKey = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)},${searchRadiusKm}`;

      if (!forceRefresh && inFlightKeyRef.current === requestKey) {
        return;
      }
      inFlightKeyRef.current = requestKey;

      const requestId = ++activeRequestIdRef.current;

      // Abort previous in-flight HTTP requests to prevent race conditions
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Initialize provider progress
      setProviderProgress({
        geoapify: { status: 'searching', count: 0 },
        mongodb: { status: 'searching', count: 0 },
        overpass: { status: 'searching', count: 0 },
      });
      setDiscoveryMetadata(null);

      // Step 1: Immediately render local offline cache (< 15ms)
      const cachedResults = !forceRefresh ? await rankFromLocalCache(coords) : [];
      if (requestId !== activeRequestIdRef.current) return;

      if (cachedResults.length > 0) {
        setFacilities(cachedResults);
        setIsRefreshing(true);
        setLoading(false);
        setIsOutOfCacheArea(false);
      } else {
        displayedFacilitiesRef.current = [];
        setFacilities([]);
        setLoading(true);
        setIsRefreshing(false);
        setIsOutOfCacheArea(false);
      }

      // Step 2: If offline, terminate safely
      if (!isOnline()) {
        setLoading(false);
        setIsRefreshing(false);
        setIsOfflineMode(true);
        if (cachedResults.length === 0) {
          setIsOutOfCacheArea(true);
        }
        setProviderProgress({
          geoapify: { status: 'failed', count: 0, error: 'Offline' },
          mongodb: { status: 'failed', count: 0, error: 'Offline' },
          overpass: { status: 'failed', count: 0, error: 'Offline' },
        });
        inFlightKeyRef.current = null;
        return;
      }

      // Step 3: Progressive Merge Handler
      const mergeIncomingFacilities = (
        _provider: 'geoapify' | 'mongodb' | 'overpass',
        incomingRanked: RankedFacility[],
      ) => {
        if (requestId !== activeRequestIdRef.current) return;

        const incomingRaw = incomingRanked.map((r) => r.facility as Facility);
        const mergedRaw = mergeAndDeduplicateFacilities(displayedFacilitiesRef.current, incomingRaw);
        displayedFacilitiesRef.current = mergedRaw;

        const reranked = rankFacilities(mergedRaw, coords.lat, coords.lng, {
          riskTier,
          maxRadiusKm: searchRadiusKm,
        });

        setFacilities(reranked);
        setLoading(false);
        setIsOutOfCacheArea(false);

        // Background cache update
        if (mergedRaw.length > 0) {
          db.facilities.bulkPut(mergedRaw).catch(() => {});
          setLastCacheUpdate(Date.now());
        }
      };

      // Provider 1: Geoapify Places (External Discovery - Priority First Display)
      const fetchGeoapify = async () => {
        const startTime = Date.now();
        try {
          const res = await fetch(
            `/api/v1/facilities/nearby?lat=${coords.lat}&lng=${coords.lng}&riskTier=${riskTier}&maxRadiusKm=${searchRadiusKm}&strategy=geoapify`,
            { signal: controller.signal },
          );
          if (requestId !== activeRequestIdRef.current) return;

          if (res.ok) {
            const data = await res.json();
            const incoming: RankedFacility[] = data.facilities || [];
            const durationMs = Date.now() - startTime;
            setProviderProgress((prev) => ({
              ...prev,
              geoapify: { status: 'done', count: incoming.length, durationMs },
            }));
            if (incoming.length > 0) {
              mergeIncomingFacilities('geoapify', incoming);
            }
          } else {
            setProviderProgress((prev) => ({
              ...prev,
              geoapify: { status: 'failed', count: 0, error: `HTTP ${res.status}` },
            }));
          }
        } catch (err: any) {
          if (requestId !== activeRequestIdRef.current) return;
          if (err?.name !== 'AbortError') {
            setProviderProgress((prev) => ({
              ...prev,
              geoapify: { status: 'failed', count: 0, error: err?.message || 'Network error' },
            }));
          }
        }
      };

      // Provider 2: MongoDB (Local HealthSetu Database)
      const fetchMongoDB = async () => {
        const startTime = Date.now();
        try {
          const res = await fetch(
            `/api/v1/facilities/nearby?lat=${coords.lat}&lng=${coords.lng}&riskTier=${riskTier}&maxRadiusKm=${searchRadiusKm}&strategy=mongodb`,
            { signal: controller.signal },
          );
          if (requestId !== activeRequestIdRef.current) return;

          if (res.ok) {
            const data = await res.json();
            const incoming: RankedFacility[] = data.facilities || [];
            const durationMs = Date.now() - startTime;
            setProviderProgress((prev) => ({
              ...prev,
              mongodb: { status: 'done', count: incoming.length, durationMs },
            }));
            if (incoming.length > 0) {
              mergeIncomingFacilities('mongodb', incoming);
            }
          } else {
            setProviderProgress((prev) => ({
              ...prev,
              mongodb: { status: 'failed', count: 0, error: `HTTP ${res.status}` },
            }));
          }
        } catch (err: any) {
          if (requestId !== activeRequestIdRef.current) return;
          if (err?.name !== 'AbortError') {
            setProviderProgress((prev) => ({
              ...prev,
              mongodb: { status: 'failed', count: 0, error: err?.message || 'Network error' },
            }));
          }
        }
      };

      // Provider 3: OpenStreetMap Overpass (Secondary External Discovery)
      const fetchOverpass = async () => {
        const startTime = Date.now();
        try {
          const res = await fetch(
            `/api/v1/facilities/nearby?lat=${coords.lat}&lng=${coords.lng}&riskTier=${riskTier}&maxRadiusKm=${searchRadiusKm}&strategy=overpass`,
            { signal: controller.signal },
          );
          if (requestId !== activeRequestIdRef.current) return;

          if (res.ok) {
            const data = await res.json();
            const incoming: RankedFacility[] = data.facilities || [];
            const durationMs = Date.now() - startTime;
            setProviderProgress((prev) => ({
              ...prev,
              overpass: { status: 'done', count: incoming.length, durationMs },
            }));
            if (incoming.length > 0) {
              mergeIncomingFacilities('overpass', incoming);
            }
          } else {
            const isTimeout = res.status === 504 || res.status === 408;
            setProviderProgress((prev) => ({
              ...prev,
              overpass: {
                status: isTimeout ? 'timeout' : 'failed',
                count: 0,
                error: isTimeout ? 'Overpass query timed out' : `HTTP ${res.status}`,
              },
            }));
          }
        } catch (err: any) {
          if (requestId !== activeRequestIdRef.current) return;
          if (err?.name !== 'AbortError') {
            setProviderProgress((prev) => ({
              ...prev,
              overpass: { status: 'timeout', count: 0, error: 'Overpass query timed out' },
            }));
          }
        }
      };

      // Execute all 3 providers independently without blocking on the slowest
      try {
        await Promise.allSettled([fetchGeoapify(), fetchMongoDB(), fetchOverpass()]);
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setLoading(false);
          setIsRefreshing(false);
          inFlightKeyRef.current = null;
          if (displayedFacilitiesRef.current.length === 0 && isOfflineMode) {
            setIsOutOfCacheArea(true);
          }
        }
      }
    },
    [rankFromLocalCache, riskTier, searchRadiusKm, isOfflineMode],
  );

  // Request browser GPS (Non-blocking, explicit validation)
  const requestLocation = useCallback(() => {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      setIsLocating(true);
      setLocationError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (
            typeof lat === 'number' &&
            typeof lng === 'number' &&
            !isNaN(lat) &&
            !isNaN(lng) &&
            lat >= -90 &&
            lat <= 90 &&
            lng >= -180 &&
            lng <= 180
          ) {
            const newCoords = { lat, lng };
            setUserCoords(newCoords);
            setLocationLabel(`Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
            setCoordsAccuracyM(Math.round(pos.coords.accuracy));
            setIsGpsActive(true);
            setIsApproximateLocation(false);
            setLocationError(null);
            setPermissionState('granted');
            try {
              localStorage.setItem('healthsetu_last_coords', JSON.stringify(newCoords));
            } catch {}
            fetchNearby(newCoords);
          } else {
            setIsGpsActive(false);
            setLocationError('Invalid coordinates received from GPS sensor.');
            fetchNearby(userCoords);
          }
        },
        (err) => {
          setIsLocating(false);
          setIsGpsActive(false);
          setCoordsAccuracyM(null);
          if (err.code === err.PERMISSION_DENIED) {
            setPermissionState('denied');
            setLocationError('Location permission was denied. Using current region.');
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setLocationError('Location signal unavailable. Using current region.');
          } else if (err.code === err.TIMEOUT) {
            setLocationError('Location request timed out. Using current region.');
          } else {
            setLocationError('Could not determine current location. Using current region.');
          }
          // Do not fail or substitute unrelated coordinates: continue with current active coordinates
          fetchNearby(userCoords);
        },
        {
          timeout: 10000,
          enableHighAccuracy: true,
          maximumAge: 30000,
        },
      );
    } else {
      setPermissionState('unsupported');
      setLocationError('Geolocation is not supported by your browser.');
      fetchNearby(userCoords);
    }
  }, [fetchNearby, userCoords]);

  // Select location preset (Explicit fallback region)
  const selectLocation = useCallback(
    (preset: LocationPreset) => {
      const coords = { lat: preset.lat, lng: preset.lng };
      setUserCoords(coords);
      setLocationLabel(`${preset.name} (Selected Region)`);
      setIsGpsActive(false);
      setIsApproximateLocation(true);
      setLocationError(null);
      setCoordsAccuracyM(null);
      try {
        localStorage.setItem('healthsetu_last_coords', JSON.stringify(coords));
      } catch {}
      fetchNearby(coords);
    },
    [fetchNearby],
  );

  // Custom coordinates input (Manual location)
  const setCustomCoordinates = useCallback(
    (lat: number, lng: number, label?: string) => {
      if (
        typeof lat !== 'number' ||
        typeof lng !== 'number' ||
        isNaN(lat) ||
        isNaN(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return;
      }
      const coords = { lat, lng };
      setUserCoords(coords);
      setLocationLabel(label || `Manual Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
      setIsGpsActive(false);
      setIsApproximateLocation(false);
      setLocationError(null);
      setCoordsAccuracyM(null);
      try {
        localStorage.setItem('healthsetu_last_coords', JSON.stringify(coords));
      } catch {}
      fetchNearby(coords);
    },
    [fetchNearby],
  );

  // Initial load
  useEffect(() => {
    fetchNearby(userCoords);
    // Request GPS non-blockingly on initial load
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when search radius changes
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    fetchNearby(userCoords);
  }, [searchRadiusKm, fetchNearby, userCoords]);

  // Filter facilities based on UI filter selections
  const filteredFacilities = facilities.filter((item) => {
    if (emergencyOnly && !item.facility.emergencyCapable) {
      return false;
    }
    if (filterType === 'ALL') return true;
    if (filterType === 'EMERGENCY') return item.facility.emergencyCapable;
    if (filterType === 'PHC') return ['PHC', 'SC'].includes(item.facility.type);
    if (filterType === 'HOSPITAL') return ['HOSPITAL', 'CHC', 'SDH', 'DH'].includes(item.facility.type);
    if (filterType === 'CLINIC') return ['CLINIC', 'PRIVATE'].includes(item.facility.type);
    if (filterType === 'PHARMACY') return item.facility.type === 'PHARMACY';
    return item.facility.type === filterType;
  });

  const isPoorAccuracy = coordsAccuracyM !== null && coordsAccuracyM > 1000;
  const cacheAgeMinutes = lastCacheUpdate ? Math.round((Date.now() - lastCacheUpdate) / 60000) : null;

  // Compute progressive human-readable status message
  const isSearching =
    providerProgress.geoapify.status === 'searching' ||
    providerProgress.mongodb.status === 'searching' ||
    providerProgress.overpass.status === 'searching';

  let statusMessage = 'Loading nearby facilities…';
  if (isOfflineMode) {
    statusMessage =
      facilities.length > 0
        ? `Offline mode • Showing ${facilities.length} saved facilities`
        : 'No saved facilities are available offline for this location';
  } else if (!isSearching) {
    if (facilities.length === 0) {
      statusMessage =
        providerProgress.overpass.status === 'timeout' && providerProgress.geoapify.count === 0 && providerProgress.mongodb.count === 0
          ? `No facilities found within ${searchRadiusKm} km (OpenStreetMap timed out)`
          : `No facilities found within ${searchRadiusKm} km`;
    } else if (providerProgress.overpass.status === 'timeout') {
      statusMessage = `OpenStreetMap timed out; showing ${facilities.length} facilities from Geoapify & local database`;
    } else {
      statusMessage = `All sources checked • ${facilities.length} unique facilities found`;
    }
  } else {
    // When actively searching
    if (providerProgress.geoapify.status === 'done' && providerProgress.geoapify.count > 0) {
      statusMessage = `Showing ${facilities.length} facilities from Geoapify; checking other sources…`;
    } else if (providerProgress.mongodb.status === 'done' && providerProgress.mongodb.count > 0) {
      statusMessage = `Showing ${facilities.length} facilities from HealthSetu database; searching Geoapify…`;
    } else if (facilities.length > 0) {
      statusMessage = `Showing ${facilities.length} available facilities; checking other sources…`;
    } else {
      statusMessage = 'Searching nearby facilities across sources…';
    }
  }

  return {
    facilities: filteredFacilities,
    allCount: facilities.length,
    userCoords,
    locationLabel,
    coordsAccuracyM,
    isPoorAccuracy,
    isGpsActive,
    permissionState,
    filterType,
    setFilterType,
    emergencyOnly,
    setEmergencyOnly,
    loading,
    isRefreshing,
    isOfflineMode,
    isOutOfCacheArea,
    cacheAgeMinutes,
    lastCacheUpdate,
    selectedFacilityId,
    setSelectedFacilityId,
    searchRadiusKm,
    setSearchRadiusKm,
    isLocating,
    isApproximateLocation,
    locationError,
    discoveryStrategy,
    setDiscoveryStrategy,
    discoveryMetadata,
    providerProgress,
    statusMessage,
    isSearching,
    locationPresets: INDIA_LOCATION_PRESETS,
    selectLocation,
    setCustomCoordinates,
    requestLocation,
    refresh: () => fetchNearby(userCoords, true),
  };
};
