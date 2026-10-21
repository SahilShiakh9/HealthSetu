import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Phone,
  Navigation,
  Clock,
  ShieldAlert,
  List,
  Map as MapIcon,
  Crosshair,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  CheckCircle2,
  Info,
  RefreshCw,
  SlidersHorizontal,
  X,
  Search,
  Layers,
} from 'lucide-react';
import { useFacilities, type LocationPreset } from './useFacilities.js';
import { FacilityMap } from './FacilityMap.js';
import { HealthcareImage } from '../../components/HealthcareImage.js';
import type { RankedFacility } from '@healthsetu/contracts';

export const FacilityListPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    facilities,
    allCount,
    userCoords,
    locationLabel,
    coordsAccuracyM,
    isPoorAccuracy,
    isGpsActive,
    isLocating,
    locationError,
    filterType,
    setFilterType,
    loading,
    isRefreshing,
    isOfflineMode,
    cacheAgeMinutes,
    selectedFacilityId,
    setSelectedFacilityId,
    searchRadiusKm,
    setSearchRadiusKm,
    discoveryMetadata,
    providerProgress,
    statusMessage,
    isSearching,
    locationPresets,
    selectLocation,
    setCustomCoordinates,
    requestLocation,
    refresh,
  } = useFacilities();

  // Mobile navigation tab: 'list' (default on mobile) vs 'map'
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  // Desktop view mode: 'split' (Map + List side-by-side, default), 'map' (Full map), 'list' (List only)
  const [desktopView, setDesktopView] = useState<'split' | 'map' | 'list'>('split');

  // Drawers and Modals
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);
  const [showSourcesSheet, setShowSourcesSheet] = useState<boolean>(false);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Location search and custom coordinates
  const [presetSearch, setPresetSearch] = useState<string>('');
  const [customLat, setCustomLat] = useState<string>('');
  const [customLng, setCustomLng] = useState<string>('');
  const [customCoordError, setCustomCoordError] = useState<string | null>(null);

  // Sync card scroll when selectedFacilityId changes from map marker click
  useEffect(() => {
    if (selectedFacilityId && mobileTab === 'list') {
      const el = document.getElementById(`facility-card-${selectedFacilityId}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedFacilityId, mobileTab]);

  const selectedFacilityItem = facilities.find((item) => item.facility.id === selectedFacilityId);

  const getTierColor = (type: string) => {
    switch (type) {
      case 'DH':
      case 'SDH':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'CHC':
      case 'HOSPITAL':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'PHC':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'SC':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'CLINIC':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'PHARMACY':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      default:
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const renderVerificationBadge = (facility: RankedFacility['facility']) => {
    const sources = (facility as any).sources || [facility.dataSource || 'MOCK_DEMO'];
    const isMultiSource = sources.length > 1;

    if (isMultiSource) {
      return (
        <span
          title={`Verified across multiple sources: ${sources.join(', ')}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 dark:bg-violet-950/70 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 shrink-0"
        >
          <CheckCircle2 className="w-3 h-3 text-violet-500" />
          Multi-Source ({sources.map((s: string) => (s === 'GEOAPIFY' ? 'Geoapify' : s === 'OPEN_STREET_MAP' ? 'OSM' : 'DB')).join(' + ')})
        </span>
      );
    }

    if (facility.dataSource === 'GEOAPIFY' || sources.includes('GEOAPIFY')) {
      return (
        <span
          title="Geoapify Places API Discovery (Priority live provider)"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 shrink-0"
        >
          <CheckCircle2 className="w-3 h-3 text-indigo-500" />
          Geoapify Places
        </span>
      );
    }
    if (facility.dataSource === 'OPEN_STREET_MAP' || sources.includes('OPEN_STREET_MAP')) {
      return (
        <span
          title="OpenStreetMap Community Health Registry"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0"
        >
          <CheckCircle2 className="w-3 h-3 text-teal-500" />
          OSM Mapped
        </span>
      );
    }
    if (facility.dataSource === 'ABDM_HFR' || sources.includes('ABDM_HFR')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          ABDM HFR Verified
        </span>
      );
    }
    if (facility.dataSource === 'MANUAL_VERIFIED' || sources.includes('MANUAL_VERIFIED')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
          <CheckCircle2 className="w-3 h-3 text-blue-500" />
          Govt Verified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
        SwasthSetu DB
      </span>
    );
  };

  const handleCustomCoordinatesSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomCoordError(null);
    const lat = parseFloat(customLat);
    const lng = parseFloat(customLng);
    if (isNaN(lat) || isNaN(lng)) {
      setCustomCoordError('Please enter valid numerical latitude and longitude.');
      return;
    }
    if (lat < -90 || lat > 90) {
      setCustomCoordError('Latitude must be between -90 and 90.');
      return;
    }
    if (lng < -180 || lng > 180) {
      setCustomCoordError('Longitude must be between -180 and 180.');
      return;
    }

    setCustomCoordinates(lat, lng, `Manual Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    setShowLocationModal(false);
    setCustomLat('');
    setCustomLng('');
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] flex flex-col font-sans antialiased">
      {/* Mobile-First Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] px-3 sm:px-4 py-2.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Back Arrow + HealthSetu Brand + Title */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="p-2 -ml-1 rounded-2xl text-[#6B7280] hover:bg-[#FFF0E6] hover:text-[#D95D24] transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-[#F47738] text-white tracking-wider uppercase shrink-0">
                  SwasthSetu
                </span>
                <h1 className="text-sm sm:text-base font-bold text-[#242424] flex items-center gap-1.5 truncate">
                  {t('facilities.title', 'Nearby Facilities')}
                  {isRefreshing && (
                    <RefreshCw className="w-3.5 h-3.5 text-[#F47738] animate-spin shrink-0" />
                  )}
                </h1>
              </div>
              <p className="text-[11px] text-[#6B7280] truncate hidden sm:block">
                Rural Healthcare Discovery &bull; Geoapify &bull; DB &bull; OpenStreetMap
              </p>
            </div>
          </div>

          {/* Right Header Navigation: Mobile List/Map Segmented Switch + Refresh + Desktop View */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mobile Segmented Toggle [ List | Map ] */}
            <div className="lg:hidden flex bg-[#FFF0E6] p-0.5 rounded-xl border border-[#F0E2D8]">
              <button
                type="button"
                onClick={() => setMobileTab('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer min-h-[38px] ${
                  mobileTab === 'list'
                    ? 'bg-white text-[#D95D24] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#242424]'
                }`}
                aria-label="Show Facility List"
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
                {facilities.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-[#FFF0E6] text-[#D95D24] rounded-full font-bold">
                    {facilities.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('map')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer min-h-[38px] ${
                  mobileTab === 'map'
                    ? 'bg-white text-[#D95D24] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#242424]'
                }`}
                aria-label="Show Interactive Map"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
            </div>

            {/* Desktop View Selector (Split / Map / List) */}
            <div className="hidden lg:flex bg-[#FFF0E6] p-0.5 rounded-xl border border-[#F0E2D8]">
              <button
                type="button"
                onClick={() => setDesktopView('split')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  desktopView === 'split'
                    ? 'bg-white text-[#D95D24] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#242424]'
                }`}
                title="Split Map & List View"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Split View</span>
              </button>
              <button
                type="button"
                onClick={() => setDesktopView('map')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  desktopView === 'map'
                    ? 'bg-white text-[#D95D24] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#242424]'
                }`}
                title="Full Screen Map"
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
              <button
                type="button"
                onClick={() => setDesktopView('list')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  desktopView === 'list'
                    ? 'bg-white text-[#D95D24] shadow-xs'
                    : 'text-[#6B7280] hover:text-[#242424]'
                }`}
                title="Full Width List"
              >
                <List className="w-3.5 h-3.5" />
                <span>List</span>
              </button>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing || loading}
              className="p-2 rounded-xl text-[#6B7280] hover:bg-[#FFF0E6] hover:text-[#D95D24] disabled:opacity-50 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Refresh Discovery Data"
              aria-label="Refresh Discovery Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#F47738]' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Healthcare Discovery Experience */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2.5 sm:p-4 md:p-6 space-y-3">
        {/* Offline Banner */}
        {isOfflineMode && (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs shadow-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Offline Mode:</strong> Displaying local Dexie cache{' '}
                {cacheAgeMinutes !== null ? `(saved ${cacheAgeMinutes} min ago)` : ''}.
              </span>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="font-bold underline text-amber-900 hover:opacity-80 shrink-0 ml-2 cursor-pointer min-h-[44px] flex items-center"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Emergency Medical Guidance (Accessible 24/7 Dials) */}
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium hidden sm:inline">
              National Emergency Medical Services (24/7):
            </span>
            <span className="font-medium sm:hidden">Emergency 24x7:</span>
          </div>
          <div className="flex items-center gap-2 font-bold">
            <a
              href="tel:108"
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-700 flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              108 Ambulance
            </a>
            <a
              href="tel:112"
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-xs flex items-center gap-1 transition-colors"
            >
              112 Emergency
            </a>
          </div>
        </div>

        {/* Restrained Healthcare Discovery Status Strip */}
        <div className="bg-white border border-[#F0E2D8] rounded-2xl px-3.5 py-2 flex items-center justify-between text-xs text-[#6B7280] shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            {isSearching ? (
              <RefreshCw className="w-3.5 h-3.5 text-[#F47738] animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            )}
            <span className="font-medium text-[#242424] truncate">
              {statusMessage}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowSourcesSheet(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] border border-[#F0E2D8] text-[11px] font-semibold shrink-0 cursor-pointer transition-colors min-h-[36px]"
          >
            <Layers className="w-3 h-3 text-[#F47738]" />
            <span className="hidden sm:inline">Discovery Sources:</span>
            <span className="font-bold text-[#D95D24]">
              {providerProgress.geoapify.count + providerProgress.mongodb.count + providerProgress.overpass.count} found
            </span>
          </button>
        </div>

        {/* Location & Radius Control Card */}
        <div className="bg-white border border-[#F0E2D8] rounded-3xl p-3 sm:p-4 shadow-xs space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* Primary Action: Use My Current Location */}
            <button
              type="button"
              onClick={requestLocation}
              disabled={isLocating}
              className={`min-h-[46px] px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
                isGpsActive
                  ? 'bg-[#F47738] hover:bg-[#D95D24] text-white ring-2 ring-[#FFF0E6]'
                  : 'bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white'
              }`}
            >
              <Crosshair className={`w-4 h-4 shrink-0 ${isLocating ? 'animate-spin' : ''}`} />
              <span>
                {isLocating
                  ? 'Acquiring GPS Signal...'
                  : isGpsActive
                  ? 'Live GPS Active'
                  : 'Use My Current Location'}
              </span>
              {isGpsActive && (
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              )}
            </button>

            {/* Current Region Display & Modal Trigger */}
            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs">
              <div className="text-left sm:text-right min-w-0 flex-1 sm:flex-initial">
                <div className="flex items-center sm:justify-end gap-1.5 font-bold text-[#242424]">
                  <MapPin className={`w-3.5 h-3.5 shrink-0 ${isGpsActive ? 'text-emerald-500' : 'text-[#F47738]'}`} />
                  <span className="truncate max-w-[190px] sm:max-w-[260px]">
                    {locationLabel}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0 ${
                    isGpsActive
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-[#FFF0E6] text-[#D95D24] border border-[#F0E2D8]'
                  }`}>
                    {isGpsActive ? 'GPS' : 'Manual'}
                  </span>
                </div>
                <p className="text-[11px] text-[#6B7280] font-mono">
                  {userCoords.lat.toFixed(4)}° N, {userCoords.lng.toFixed(4)}° E
                  {isGpsActive && coordsAccuracyM ? ` (±${coordsAccuracyM}m)` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowLocationModal(true)}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-semibold text-xs flex items-center gap-1 border border-[#F0E2D8] transition-colors cursor-pointer shrink-0"
              >
                <span>Change Area</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#6B7280]" />
              </button>
            </div>
          </div>

          {/* Location Alerts */}
          {locationError && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs">
              <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>{locationError}</span>
            </div>
          )}

          {isPoorAccuracy && !locationError && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>GPS accuracy is approximate (±{coordsAccuracyM}m). Move outdoors for clearer satellite lock.</span>
            </div>
          )}

          {/* Search Controls: Category Quick Chips & Radius Button */}
          <div className="pt-2.5 border-t border-[#F0E2D8] flex items-center justify-between gap-2">
            {/* Horizontal Scrollable Category Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0">
              {[
                { id: 'ALL', label: 'All Facilities' },
                { id: 'EMERGENCY', label: '🚨 24x7 Emergency' },
                { id: 'HOSPITAL', label: 'Hospitals / CHC' },
                { id: 'PHC', label: 'PHC / Sub-Centres' },
                { id: 'CLINIC', label: 'Clinics' },
                { id: 'PHARMACY', label: 'Pharmacies' },
              ].map((chip) => {
                const isSelected = filterType === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilterType(chip.id)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                      isSelected
                        ? 'bg-[#F47738] text-white border-[#F47738] shadow-xs'
                        : 'bg-white text-[#242424] border-[#F0E2D8] hover:bg-[#FFF0E6] hover:border-[#F47738]/40'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Mobile Filter & Radius Drawer Button */}
            <button
              type="button"
              onClick={() => setShowFilterSheet(true)}
              className="lg:hidden min-h-[38px] px-3 py-1.5 rounded-xl bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] text-xs font-bold flex items-center gap-1.5 shrink-0 border border-[#F0E2D8]"
              aria-label="Filter Options and Radius"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F47738]" />
              <span>{searchRadiusKm} km</span>
            </button>

            {/* Desktop / Tablet Inline Radius Selector */}
            <div className="hidden lg:flex items-center gap-1 bg-[#FFF9F5] border border-[#F0E2D8] p-1 rounded-xl text-xs shrink-0">
              <span className="text-[11px] font-medium text-[#6B7280] px-1">Radius:</span>
              {[5, 10, 25, 50].map((radius) => (
                <button
                  key={radius}
                  type="button"
                  onClick={() => setSearchRadiusKm(radius)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    searchRadiusKm === radius
                      ? 'bg-[#F47738] text-white shadow-xs'
                      : 'text-[#6B7280] hover:text-[#242424]'
                  }`}
                >
                  {radius} km
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Discovery Summary Header */}
        <div className="flex items-center justify-between text-xs text-[#6B7280] px-1">
          <div>
            Showing <strong className="text-[#242424]">{facilities.length}</strong> matching facilities within{' '}
            <strong className="text-[#242424]">{searchRadiusKm} km</strong>
            {allCount > facilities.length && ` (filtered from ${allCount})`}
          </div>

          {discoveryMetadata && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  discoveryMetadata.liveSuccess ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{discoveryMetadata.provider.toUpperCase()} provider</span>
            </div>
          )}
        </div>

        {/* Initial Loading Spinner */}
        {loading && facilities.length === 0 && (
          <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F47738]" />
            <p className="text-sm font-semibold text-[#242424]">
              Discovering healthcare facilities nearby...
            </p>
            <p className="text-xs text-[#6B7280]">
              Querying Geoapify Places, SwasthSetu database & OpenStreetMap...
            </p>
          </div>
        )}

        {/* Responsive Layout: Mobile Views vs Desktop Side-by-Side Split */}
        {(!loading || facilities.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start relative">
            {/* Interactive Leaflet Map View */}
            <div
              className={`${
                mobileTab === 'list' ? 'hidden lg:block' : 'block'
              } ${
                desktopView === 'list' ? 'lg:hidden' : 'lg:block'
              } ${
                desktopView === 'map' ? 'lg:col-span-12' : 'lg:col-span-8'
              } h-[calc(100vh-220px)] lg:h-[calc(100vh-270px)] min-h-[420px] sticky top-20 rounded-3xl overflow-hidden relative shadow-xs`}
            >
              <FacilityMap
                userCoords={userCoords}
                facilities={facilities}
                selectedFacilityId={selectedFacilityId}
                onSelectFacility={(id) => setSelectedFacilityId(id)}
                onRequestLocation={requestLocation}
                isGpsActive={isGpsActive}
                searchRadiusKm={searchRadiusKm}
              />

              {/* Mobile Selected Facility Bottom Sheet (Over Map View) */}
              {selectedFacilityItem && (
                <div className="lg:hidden absolute bottom-3 left-2.5 right-2.5 z-40 bg-white/95 backdrop-blur-md p-4 rounded-3xl border border-[#F0E2D8] shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getTierColor(
                            selectedFacilityItem.facility.type,
                          )}`}
                        >
                          {selectedFacilityItem.facility.type}
                        </span>
                        {selectedFacilityItem.facility.open24x7 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            24x7 Open
                          </span>
                        )}
                        {selectedFacilityItem.facility.emergencyCapable && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" />
                            Emergency Ready
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-[#242424] truncate">
                        {selectedFacilityItem.facility.name}
                      </h3>
                      {selectedFacilityItem.facility.address && (
                        <p className="text-xs text-[#6B7280] line-clamp-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 shrink-0 text-[#6B7280]" />
                          <span className="truncate">{selectedFacilityItem.facility.address}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedFacilityId(null)}
                        className="p-1 rounded-full text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                        aria-label="Close bottom sheet"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <div className="text-right bg-[#FFF0E6] px-2 py-0.5 rounded-lg border border-[#F0E2D8]">
                        <p className="text-xs font-black text-[#D95D24]">
                          {selectedFacilityItem.distanceKm} km
                        </p>
                        <p className="text-[9px] text-[#D95D24]/80">
                          ~{selectedFacilityItem.approxTravelTimeMinutes} mins
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions for Mobile Bottom Sheet (min-h-[44px] touch target) */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#F0E2D8]">
                    {selectedFacilityItem.facility.phone ? (
                      <a
                        href={`tel:${selectedFacilityItem.facility.phone}`}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-[#F47738] hover:bg-[#D95D24] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>
                    ) : (
                      <button
                        disabled
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF9F5] text-[#6B7280] font-medium text-xs flex items-center justify-center gap-1.5 border border-[#F0E2D8] cursor-not-allowed"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Unlisted</span>
                      </button>
                    )}

                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${selectedFacilityItem.facility.location.coordinates[1]},${selectedFacilityItem.facility.location.coordinates[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#F0E2D8] transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5 text-[#F47738]" />
                      <span>Directions</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setMobileTab('list');
                        setTimeout(() => {
                          const el = document.getElementById(`facility-card-${selectedFacilityItem.facility.id}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                      }}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-[#FFF9F5] hover:bg-[#FFF0E6] text-[#242424] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#F0E2D8] cursor-pointer transition-colors"
                    >
                      <List className="w-3.5 h-3.5 text-[#6B7280]" />
                      <span>In List</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Facility Cards List View */}
            <div
              className={`${
                mobileTab === 'map' ? 'hidden lg:block' : 'block'
              } ${
                desktopView === 'map' ? 'lg:hidden' : 'lg:block'
              } ${
                desktopView === 'list' ? 'lg:col-span-12' : 'lg:col-span-4'
              } space-y-3 max-h-[calc(100vh-270px)] overflow-y-auto pr-1 pb-16 lg:pb-0`}
            >
              {/* Empty Results State */}
              {facilities.length === 0 && !isSearching ? (
                <div className="py-8 px-5 text-center rounded-3xl bg-white border border-[#F0E2D8] space-y-3 shadow-xs">
                  <HealthcareImage
                    src="/images/rural_health_facility.jpg"
                    alt="Rural Primary Health Centre"
                    aspectRatio="16/9"
                    className="max-w-[220px] mx-auto rounded-2xl mb-1 shadow-xs border border-[#F0E2D8]"
                  />
                  <h3 className="text-sm font-bold text-[#242424]">
                    No facilities found within {searchRadiusKm} km
                  </h3>
                  <p className="text-xs text-[#6B7280] max-w-xs mx-auto">
                    No healthcare facilities matched your category filter within {searchRadiusKm} km of this location.
                  </p>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterType('ALL');
                        setSearchRadiusKm(50);
                      }}
                      className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-[#F47738] hover:bg-[#D95D24] text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Expand Search (50 km, All Tiers)
                    </button>
                    <a
                      href="tel:108"
                      className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      Call 108 Emergency
                    </a>
                  </div>
                </div>
              ) : (
                /* Facility Cards List */
                facilities.map((item) => {
                  const { facility, distanceKm, approxTravelTimeMinutes, notes, breakdown } = item;
                  const isExpanded = expandedCardId === facility.id;
                  const isSelected = selectedFacilityId === facility.id;

                  return (
                    <div
                      key={facility.id}
                      id={`facility-card-${facility.id}`}
                      onClick={() => setSelectedFacilityId(facility.id)}
                      className={`bg-white border rounded-3xl p-3.5 sm:p-4 shadow-xs space-y-3 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#F47738] ring-2 ring-[#FFF0E6]'
                          : 'border-[#F0E2D8] hover:border-[#F47738]/50'
                      }`}
                    >
                      {/* Card Header: Type Badge, Verification, Name & Distance */}
                      <div className="flex items-start justify-between gap-2.5">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getTierColor(
                                facility.type,
                              )}`}
                            >
                              {facility.type}
                            </span>
                            {facility.open24x7 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                24x7 Open
                              </span>
                            )}
                            {facility.emergencyCapable ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3" />
                                Emergency Ready
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] text-[#6B7280] bg-[#FFF9F5] border border-[#F0E2D8]">
                                Outpatient
                              </span>
                            )}
                            {renderVerificationBadge(facility)}
                          </div>

                          <h3 className="text-sm sm:text-base font-bold text-[#242424] leading-snug">
                            {facility.name}
                          </h3>

                          {facility.address && (
                            <p className="text-xs text-[#6B7280] line-clamp-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3 shrink-0 text-[#6B7280]" />
                              <span className="truncate">{facility.address}</span>
                            </p>
                          )}
                        </div>

                        {/* Distance Badge */}
                        <div className="text-right shrink-0 bg-[#FFF9F5] px-2.5 py-1.5 rounded-2xl border border-[#F0E2D8]">
                          <p className="text-sm font-black text-[#D95D24]">
                            {distanceKm} km
                          </p>
                          <p className="text-[10px] text-[#6B7280]">
                            ~{approxTravelTimeMinutes} mins
                          </p>
                        </div>
                      </div>

                      {/* Services Tags */}
                      {facility.services && facility.services.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {facility.services.slice(0, 3).map((svc, sIdx) => (
                            <span
                              key={sIdx}
                              className="px-2 py-0.5 bg-[#FFF0E6] text-[#D95D24] text-[10px] rounded-md font-medium"
                            >
                              {svc}
                            </span>
                          ))}
                          {facility.services.length > 3 && (
                            <span className="px-1.5 py-0.5 text-[#6B7280] text-[10px] self-center">
                              +{facility.services.length - 3} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Operating Hours & Clinical Suitability */}
                      <div className="flex items-center justify-between text-xs text-[#6B7280] pt-1 border-t border-[#F0E2D8]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
                          <span className="truncate max-w-[140px]">{facility.openHours || 'Regular hours'}</span>
                        </div>
                        {notes && (
                          <span className="text-[11px] text-[#D95D24] font-medium truncate max-w-[150px]">
                            {notes}
                          </span>
                        )}
                      </div>

                      {/* Explainable Rank Score Breakdown Accordion */}
                      <div className="pt-1 border-t border-[#F0E2D8]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCardId(isExpanded ? null : facility.id);
                          }}
                          className="w-full flex items-center justify-between text-[11px] font-semibold text-[#6B7280] hover:text-[#242424] transition-colors py-0.5 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <span>
                              Match Score: <strong className="text-[#D95D24]">{item.score}/100</strong>
                            </span>
                          </span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {isExpanded && breakdown && (
                          <div className="mt-2 p-2.5 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8] text-[11px] space-y-1.5 text-[#242424] animate-in fade-in duration-150">
                            <p className="font-semibold text-[#242424]">
                              Weights: 0.40 Proximity + 0.25 Tier + 0.20 Load + 0.15 Services
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-[10px] text-[#6B7280]">
                              <div>
                                Proximity: <span className="font-bold text-[#242424]">{breakdown.proximity}%</span>
                              </div>
                              <div>
                                Tier Fit: <span className="font-bold text-[#242424]">{breakdown.tierFit}%</span>
                              </div>
                              <div>
                                Load Factor: <span className="font-bold text-[#242424]">{breakdown.load}%</span>
                              </div>
                              <div>
                                Service Match: <span className="font-bold text-[#242424]">{breakdown.serviceFit}%</span>
                              </div>
                            </div>
                            {facility.sourceAttribution && (
                              <p className="text-[10px] text-[#6B7280] pt-1 border-t border-[#F0E2D8]">
                                Source: {facility.sourceAttribution}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons: Call, Directions, View on Map (min-h-[44px] touch target) */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                        {facility.phone && facility.phone.trim().length > 0 ? (
                          <a
                            href={`tel:${facility.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Call Facility</span>
                          </a>
                        ) : (
                          <button
                            disabled
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#FFF9F5] text-[#6B7280] font-medium text-xs flex items-center justify-center gap-1.5 cursor-not-allowed border border-[#F0E2D8]"
                          >
                            <Phone className="w-3.5 h-3.5 text-[#6B7280]" />
                            <span>Phone unlisted</span>
                          </button>
                        )}

                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${facility.location.coordinates[1]},${facility.location.coordinates[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#FFF9F5] hover:bg-[#FFF0E6] active:scale-[0.98] text-[#242424] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#F0E2D8] transition-all"
                        >
                          <Navigation className="w-3.5 h-3.5 text-[#F47738]" />
                          <span>Directions</span>
                        </a>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFacilityId(facility.id);
                            setMobileTab('map');
                          }}
                          className="col-span-2 sm:col-span-1 min-h-[44px] px-3.5 py-2 rounded-2xl bg-[#FFF0E6] hover:bg-[#FFE4D3] active:scale-[0.98] text-[#D95D24] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#F0E2D8] transition-all cursor-pointer"
                        >
                          <MapIcon className="w-3.5 h-3.5 text-[#F47738]" />
                          <span>View on Map</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Floating Action Switch Button (Bottom Center) */}
      <div className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
        {mobileTab === 'list' ? (
          <button
            type="button"
            onClick={() => setMobileTab('map')}
            className="pointer-events-auto min-h-[44px] px-5 py-2.5 rounded-full bg-[#242424] text-white font-bold text-xs shadow-xl flex items-center gap-2 border border-[#F0E2D8]/40 active:scale-95 transition-all cursor-pointer"
          >
            <MapIcon className="w-4 h-4 text-[#F47738]" />
            <span>View Map ({facilities.length})</span>
          </button>
        ) : !selectedFacilityItem ? (
          <button
            type="button"
            onClick={() => setMobileTab('list')}
            className="pointer-events-auto min-h-[44px] px-5 py-2.5 rounded-full bg-[#242424] text-white font-bold text-xs shadow-xl flex items-center gap-2 border border-[#F0E2D8]/40 active:scale-95 transition-all cursor-pointer"
          >
            <List className="w-4 h-4 text-[#F47738]" />
            <span>View List ({facilities.length})</span>
          </button>
        ) : null}
      </div>

      {/* Expandable Filter & Radius Bottom Sheet */}
      {showFilterSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#F0E2D8] rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#242424]">
                  Filters & Search Radius
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Refine healthcare search distance and category
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFilterSheet(false)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Radius Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#242424]">
                Search Radius (Kilometers):
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 25, 50].map((radius) => (
                  <button
                    key={radius}
                    type="button"
                    onClick={() => setSearchRadiusKm(radius)}
                    className={`min-h-[44px] py-2 px-3 rounded-2xl text-xs font-bold transition-all cursor-pointer border ${
                      searchRadiusKm === radius
                        ? 'bg-[#F47738] text-white border-[#F47738] shadow-xs'
                        : 'bg-[#FFF9F5] text-[#242424] border-[#F0E2D8] hover:bg-[#FFF0E6]'
                    }`}
                  >
                    {radius} km
                  </button>
                ))}
              </div>
            </div>

            {/* Facility Category Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#242424]">
                Facility Tier / Category:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ALL', label: 'All Facilities' },
                  { id: 'EMERGENCY', label: '🚨 24x7 Emergency' },
                  { id: 'HOSPITAL', label: 'Hospitals / CHC' },
                  { id: 'PHC', label: 'PHC / Sub-Centres' },
                  { id: 'CLINIC', label: 'Clinics' },
                  { id: 'PHARMACY', label: 'Pharmacies' },
                ].map((chip) => {
                  const isSelected = filterType === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => setFilterType(chip.id)}
                      className={`min-h-[44px] px-3.5 py-2 rounded-2xl text-xs font-semibold text-left transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-[#F47738] text-white border-[#F47738] shadow-xs'
                          : 'bg-[#FFF9F5] text-[#242424] border-[#F0E2D8] hover:bg-[#FFF0E6]'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Apply & Close Button */}
            <button
              type="button"
              onClick={() => setShowFilterSheet(false)}
              className="w-full min-h-[46px] rounded-2xl bg-[#F47738] hover:bg-[#D95D24] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Apply Filters ({facilities.length} matching)
            </button>
          </div>
        </div>
      )}

      {/* Discovery Sources & Provenance Sheet */}
      {showSourcesSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#F0E2D8] rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#242424]">
                  Healthcare Discovery Providers
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Multi-provider live aggregation & offline caching
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSourcesSheet(false)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                aria-label="Close sources sheet"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provider Cards */}
            <div className="space-y-2.5 text-xs">
              {/* Geoapify */}
              <div className="p-3 rounded-2xl bg-[#FFF0E6] border border-[#F0E2D8] flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#D95D24]">
                    Geoapify Places API (Live Priority)
                  </p>
                  <p className="text-[11px] text-[#6B7280]">
                    Fast live geospatial discovery within {searchRadiusKm} km
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#F47738] text-white font-bold">
                  {providerProgress.geoapify.count} found
                </span>
              </div>

              {/* HealthSetu DB */}
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <p className="font-bold text-emerald-900">
                    SwasthSetu Verified Database
                  </p>
                  <p className="text-[11px] text-emerald-700">
                    ABDM HFR and official government verified facilities
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold">
                  {providerProgress.mongodb.count} found
                </span>
              </div>

              {/* OpenStreetMap */}
              <div className="p-3 rounded-2xl bg-[#FFF9F5] border border-[#F0E2D8] flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#242424]">
                    OpenStreetMap Healthcare
                  </p>
                  <p className="text-[11px] text-[#6B7280]">
                    Community mapped clinics and primary health centres
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-[#D95D24] text-white font-bold">
                  {providerProgress.overpass.status === 'timeout'
                    ? 'Timed out'
                    : `${providerProgress.overpass.count} found`}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSourcesSheet(false)}
              className="w-full min-h-[46px] rounded-2xl bg-[#F47738] hover:bg-[#D95D24] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Location Picker Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-[#F0E2D8] rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#242424]">
                  Change Discovery Location
                </h3>
                <p className="text-xs text-[#6B7280]">
                  Select an Indian district or enter custom coordinates
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Region Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#6B7280] absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder="Search city, district, e.g. Shikrapur, Pune, Nashik..."
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#F0E2D8] bg-[#FFF9F5] text-xs text-[#242424] placeholder-[#6B7280] focus:outline-hidden focus:ring-1 focus:ring-[#F47738] min-h-[44px]"
              />
            </div>

            {/* Presets List */}
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {locationPresets
                .filter(
                  (p) =>
                    !presetSearch ||
                    p.name.toLowerCase().includes(presetSearch.toLowerCase()) ||
                    p.state.toLowerCase().includes(presetSearch.toLowerCase()) ||
                    p.district.toLowerCase().includes(presetSearch.toLowerCase()),
                )
                .map((preset: LocationPreset) => {
                  const isSelected = locationLabel.includes(preset.name);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        selectLocation(preset);
                        setShowLocationModal(false);
                        setPresetSearch('');
                      }}
                      className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer min-h-[44px] ${
                        isSelected
                          ? 'bg-[#FFF0E6] text-[#D95D24] border border-[#F47738]'
                          : 'bg-[#FFF9F5] text-[#242424] hover:bg-[#FFF0E6] border border-transparent'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-[#242424]">{preset.name}</p>
                        <p className="text-[10px] text-[#6B7280]">
                          {preset.district}, {preset.state}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-[#6B7280]">
                        {preset.lat.toFixed(2)}°, {preset.lng.toFixed(2)}°
                      </span>
                    </button>
                  );
                })}
            </div>

            {/* Manual Coordinates Form */}
            <form
              onSubmit={handleCustomCoordinatesSubmit}
              className="p-3.5 rounded-2xl bg-[#FFF9F5] border border-[#F0E2D8] space-y-2.5 text-xs"
            >
              <p className="font-bold text-[#242424]">
                Or Enter Custom India Coordinates:
              </p>
              {customCoordError && (
                <p className="text-[11px] text-rose-600 font-semibold">{customCoordError}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude (e.g. 18.7842)"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#F0E2D8] bg-white text-xs text-[#242424] focus:ring-1 focus:ring-[#F47738] min-h-[44px]"
                  required
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude (e.g. 74.1205)"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#F0E2D8] bg-white text-xs text-[#242424] focus:ring-1 focus:ring-[#F47738] min-h-[44px]"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#F47738] hover:bg-[#D95D24] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                Set Location Coordinates
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
