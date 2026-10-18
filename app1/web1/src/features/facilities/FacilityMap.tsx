import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Crosshair,
  Maximize2,
} from 'lucide-react';
import type { RankedFacility } from '@healthsetu/contracts';

interface FacilityMapProps {
  userCoords: { lat: number; lng: number };
  facilities: RankedFacility[];
  selectedFacilityId: string | null;
  onSelectFacility: (facilityId: string) => void;
  onRequestLocation: () => void;
  isGpsActive?: boolean;
  searchRadiusKm: number;
}

// Category color tokens for Leaflet DivIcons
const getCategoryColor = (type: string, isEmergency = false): string => {
  if (isEmergency) return '#e11d48'; // Rose-600 for emergency
  switch (type) {
    case 'DH':
    case 'SDH':
      return '#7c3aed'; // Violet-600
    case 'CHC':
    case 'HOSPITAL':
      return '#2563eb'; // Blue-600
    case 'PHC':
      return '#059669'; // Emerald-600
    case 'SC':
      return '#d97706'; // Amber-600
    case 'PHARMACY':
      return '#0284c7'; // Sky-600
    case 'CLINIC':
    default:
      return '#0d9488'; // Teal-600
  }
};

const createPatientIcon = (): L.DivIcon => {
  return L.divIcon({
    className: 'patient-location-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <span style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background: rgba(16, 185, 129, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
        <span style="position: relative; width: 18px; height: 18px; border-radius: 9999px; background: #059669; border: 3px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);"></span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const createFacilityIcon = (
  type: string,
  isSelected: boolean,
  isEmergency = false,
): L.DivIcon => {
  const color = getCategoryColor(type, isEmergency);
  const size = isSelected ? 42 : 32;
  const border = isSelected ? '3px solid #ffffff' : '2px solid #ffffff';
  const shadow = isSelected
    ? '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 0 0 4px rgba(16, 185, 129, 0.4)'
    : '0 4px 6px -1px rgba(0, 0, 0, 0.25)';
  const zIndex = isSelected ? 1000 : isEmergency ? 500 : 100;

  return L.divIcon({
    className: `facility-pin-${type.toLowerCase()}`,
    html: `
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border-radius: 9999px 9999px 9999px 4px;
        transform: rotate(-45deg);
        border: ${border};
        box-shadow: ${shadow};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: ${zIndex};
      ">
        <span style="
          transform: rotate(45deg);
          color: #ffffff;
          font-size: ${isSelected ? '12px' : '10px'};
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1;
        ">
          ${isEmergency ? '✚' : type.slice(0, 2)}
        </span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
};

export const FacilityMap: React.FC<FacilityMapProps> = ({
  userCoords,
  facilities,
  selectedFacilityId,
  onSelectFacility,
  onRequestLocation,
  isGpsActive = false,
  searchRadiusKm,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const facilityMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());

  const [mapReady, setMapReady] = useState(false);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [userCoords.lat, userCoords.lng],
      zoom: 12,
      zoomControl: false, // We'll render custom accessible buttons
      attributionControl: true,
      maxBoundsViscosity: 0.8,
    });

    // Clean OpenStreetMap TileLayer with high-resolution Retina support
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);

    const markersGroup = L.featureGroup().addTo(map);
    markersLayerRef.current = markersGroup;
    mapInstanceRef.current = map;
    setMapReady(true);

    // Resize observer to ensure map renders smoothly in fluid containers
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      try {
        map.remove();
      } catch {
        // Safe remove in jsdom / test environment
      }
      mapInstanceRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update User Marker & Radius Circle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // 1. Patient Pin
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userCoords.lat, userCoords.lng]);
    } else {
      const userMarker = L.marker([userCoords.lat, userCoords.lng], {
        icon: createPatientIcon(),
        title: 'Your Location',
        zIndexOffset: 2000,
      }).addTo(map);

      userMarker.bindPopup(
        `<div style="font-family: system-ui, sans-serif; padding: 4px 6px;">
          <strong style="color: #065f46; font-size: 13px;">📍 Selected Patient Location</strong>
          <p style="margin: 4px 0 0; font-size: 11px; color: #64748b;">
            (${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)})
          </p>
        </div>`,
      );

      userMarkerRef.current = userMarker;
    }

    // 2. Search Radius Circle (with fallback if vector SVG renderer is unavailable in jsdom)
    try {
      if (radiusCircleRef.current) {
        radiusCircleRef.current.setLatLng([userCoords.lat, userCoords.lng]);
        radiusCircleRef.current.setRadius(searchRadiusKm * 1000);
      } else {
        const circle = L.circle([userCoords.lat, userCoords.lng], {
          radius: searchRadiusKm * 1000,
          color: '#10b981',
          weight: 1.5,
          opacity: 0.5,
          fillColor: '#10b981',
          fillOpacity: 0.05,
          dashArray: '4, 6',
        }).addTo(map);
        radiusCircleRef.current = circle;
      }
    } catch {
      // Vector rendering unsupported in headless/jsdom environment
    }
  }, [userCoords, searchRadiusKm, mapReady]);

  // Update Facility Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersLayerRef.current;
    if (!map || !group || !mapReady) return;

    // Clear previous facility markers
    facilityMarkersMapRef.current.forEach((marker) => {
      group.removeLayer(marker);
    });
    facilityMarkersMapRef.current.clear();

    // Add each facility marker
    facilities.forEach((item) => {
      const { facility, distanceKm, approxTravelTimeMinutes } = item;
      const coords = facility.location?.coordinates;
      if (!coords || coords.length !== 2) return;

      const [lon, lat] = coords;
      if (typeof lon !== 'number' || typeof lat !== 'number') return;

      const isSelected = selectedFacilityId === facility.id;
      const isEmergency = Boolean(facility.emergencyCapable);

      const marker = L.marker([lat, lon], {
        icon: createFacilityIcon(facility.type, isSelected, isEmergency),
        title: facility.name,
      });

      // Build Accessible, Responsive HTML Popup
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      const phoneHtml = facility.phone
        ? `<a href="tel:${facility.phone}" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; background:#059669; color:#fff; border-radius:8px; font-size:11px; font-weight:700; text-decoration:none;">
            📞 Call
          </a>`
        : `<span style="font-size:11px; color:#94a3b8; padding:6px 8px;">Phone unlisted</span>`;

      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 220px; max-width: 280px; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="display:inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; background: #f1f5f9; color: #334155;">
              ${facility.type}
            </span>
            <span style="font-size: 12px; font-weight: 800; color: #059669;">
              ${distanceKm} km
            </span>
          </div>
          <h4 style="margin: 0 0 4px; font-size: 13px; font-weight: 800; color: #0f172a; line-height: 1.25;">
            ${facility.name}
          </h4>
          ${
            facility.address
              ? `<p style="margin: 0 0 6px; font-size: 11px; color: #64748b; line-height: 1.3;">
                  ${facility.address}
                </p>`
              : ''
          }
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-size:10px; color:#64748b;">
            <span>⏱ ~${approxTravelTimeMinutes} mins (est.)</span>
            ${
              facility.open24x7
                ? '<span style="color:#059669; font-weight:700;">• 24x7</span>'
                : ''
            }
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; pt: 4px; border-top: 1px solid #f1f5f9;">
            ${phoneHtml}
            <a href="${directionsUrl}" target="_blank" rel="noopener" style="display:inline-flex; align-items:center; gap:4px; padding:6px 10px; background:#f1f5f9; color:#0f172a; border-radius:8px; font-size:11px; font-weight:700; text-decoration:none; border:1px solid #e2e8f0;">
              🧭 Directions
            </a>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        offset: [0, -10],
        maxWidth: 300,
      });

      marker.on('click', () => {
        onSelectFacility(facility.id);
      });

      marker.addTo(group);
      facilityMarkersMapRef.current.set(facility.id, marker);
    });

    // If there's an active selected facility, open its popup
    if (selectedFacilityId && facilityMarkersMapRef.current.has(selectedFacilityId)) {
      const marker = facilityMarkersMapRef.current.get(selectedFacilityId);
      if (marker && !marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [facilities, selectedFacilityId, onSelectFacility, mapReady]);

  // Center on Selected Facility when changed
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedFacilityId || !mapReady) return;

    const marker = facilityMarkersMapRef.current.get(selectedFacilityId);
    if (marker) {
      const latLng = marker.getLatLng();
      map.setView(latLng, Math.max(map.getZoom(), 14), { animate: true });
      if (!marker.isPopupOpen()) {
        marker.openPopup();
      }
    }
  }, [selectedFacilityId, mapReady]);

  // Controls: Fit All Markers
  const handleFitBounds = useCallback(() => {
    const map = mapInstanceRef.current;
    const group = markersLayerRef.current;
    if (!map || !group || facilities.length === 0) return;

    const bounds = group.getBounds();
    if (userMarkerRef.current) {
      bounds.extend(userMarkerRef.current.getLatLng());
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [facilities]);

  // Controls: Zoom In / Out
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  // Trigger map resize invalidation when dimensions or facilities update
  useEffect(() => {
    if (mapInstanceRef.current && mapReady) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [facilities.length, selectedFacilityId, mapReady]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-950">
      {/* Map DOM Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" tabIndex={0} aria-label="Interactive Healthcare Facilities Map" />

      {/* Floating Map Action Controls Bar (Accessible 44px Touch Targets) */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2">
        {/* Zoom Controls */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 font-bold text-xl cursor-pointer transition-colors"
            title="Zoom In"
            aria-label="Zoom In"
          >
            +
          </button>
          <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-11 h-11 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 font-bold text-xl cursor-pointer transition-colors"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            −
          </button>
        </div>

        {/* Locate Me (GPS) */}
        <button
          type="button"
          onClick={onRequestLocation}
          className={`w-11 h-11 rounded-2xl shadow-md backdrop-blur-md flex items-center justify-center transition-all cursor-pointer border ${
            isGpsActive
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/30'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 border-slate-200 dark:border-slate-800'
          }`}
          title="Locate Me (Current GPS)"
          aria-label="Locate Me"
        >
          <Crosshair className={`w-5 h-5 ${isGpsActive ? 'animate-spin' : ''}`} />
        </button>

        {/* Fit Bounds */}
        <button
          type="button"
          onClick={handleFitBounds}
          disabled={facilities.length === 0}
          className="w-11 h-11 rounded-2xl bg-white/95 dark:bg-slate-900/95 shadow-md backdrop-blur-md border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          title="Fit All Results in View"
          aria-label="Fit All Results in View"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Live Facilities Count Badge */}
      <div className="absolute top-3 left-3 z-30 pointer-events-none">
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-slate-200/90 dark:border-slate-800/90 flex items-center gap-2 pointer-events-auto">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {facilities.length} {facilities.length === 1 ? 'Facility' : 'Facilities'} Nearby
          </span>
          <span className="text-[10px] text-slate-500 font-medium">({searchRadiusKm} km)</span>
        </div>
      </div>

      {/* Floating Map Legend (Bottom Left) */}
      <div className="hidden sm:flex absolute bottom-3 left-3 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 text-[10px] items-center gap-3 text-slate-600 dark:text-slate-300 pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
          <span>Patient</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
          <span>Emergency</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
          <span>Hospital/CHC</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
          <span>PHC/Clinic</span>
        </div>
      </div>
    </div>
  );
};
