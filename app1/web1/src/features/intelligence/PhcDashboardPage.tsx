import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Flame,
  LineChart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore.js';
import type {
  PhcSummaryResponse,
  HealthAggregateItem,
  EpidemicAlert,
} from '@healthsetu/contracts';

const VILLAGE_NAMES: Record<string, string> = {
  'VIL-412208': 'Kendur Village',
  'VIL-412403': 'Pabal Village',
  'VIL-412404': 'Shikrapur Village',
  'VIL-412218': 'Nimgaon Mhalungi',
};

const INITIAL_SUMMARY: PhcSummaryResponse & { facilityName?: string; isEmpty?: boolean } = {
  totalScreenings: 0,
  highRiskCases: 0,
  feverCases: 0,
  respiratoryCases: 0,
  totalScreeningsChangePct: 0,
  highRiskChangePct: 0,
  feverChangePct: 0,
  respiratoryChangePct: 0,
  isDemoData: false,
  isEmpty: true,
  dataAgeSeconds: 0,
};

export const PhcDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken, user } = useAuthStore();

  const [summary, setSummary] = useState<PhcSummaryResponse & { facilityName?: string; isEmpty?: boolean }>(INITIAL_SUMMARY);
  const [alerts, setAlerts] = useState<EpidemicAlert[]>([]);
  const [aggregates, setAggregates] = useState<HealthAggregateItem[]>([]);
  const [selectedSyndrome, setSelectedSyndrome] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [generating, setGenerating] = useState(false);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);
    setIsOffline(!navigator.onLine);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const isPublicHealthObserver = user?.role === 'GOVT_OFFICER' || user?.role === 'NGO_OBSERVER';
      const summaryEndpoint = isPublicHealthObserver ? '/api/v1/intelligence/summary' : '/api/v1/phc/summary';
      const alertsEndpoint = isPublicHealthObserver ? '/api/v1/intelligence/alerts' : '/api/v1/phc/alerts';
      const aggregatesEndpoint = isPublicHealthObserver ? '/api/v1/intelligence/aggregates' : '/api/v1/phc/aggregates';

      const [summaryRes, alertsRes, aggRes] = await Promise.all([
        fetch(summaryEndpoint, { headers }).then((r) =>
          !r.ok && !isPublicHealthObserver ? fetch('/api/v1/intelligence/summary', { headers }) : r,
        ),
        fetch(alertsEndpoint, { headers }).then((r) =>
          !r.ok && !isPublicHealthObserver ? fetch('/api/v1/intelligence/alerts', { headers }) : r,
        ),
        fetch(aggregatesEndpoint, { headers }).then((r) =>
          !r.ok && !isPublicHealthObserver ? fetch('/api/v1/intelligence/aggregates', { headers }) : r,
        ),
      ]);

      if (summaryRes.status === 403 || summaryRes.status === 401) {
        setUnauthorized(true);
        return;
      }

      if (summaryRes.ok) {
        const sData = await summaryRes.json();
        setSummary(sData.summary || INITIAL_SUMMARY);
      } else {
        setError('Failed to load operational summary');
      }

      if (alertsRes.ok) {
        const aData = await alertsRes.json();
        setAlerts(aData.alerts || []);
      }

      if (aggRes.ok) {
        const agData = await aggRes.json();
        setAggregates(agData.aggregates || []);
      }
    } catch {
      if (!navigator.onLine) {
        setIsOffline(true);
      } else {
        setError('Network error while connecting to PHC surveillance service');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    const handleOnline = () => {
      setIsOffline(false);
      fetchDashboardData();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [accessToken]);

  const handleSimulateOutbreak = async () => {
    setGenerating(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const targetPhcId = (summary as any).facilityId || user?.facilityId || 'phc-pabal';
      await fetch('/api/v1/intelligence/generate-synthetic', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phcId: targetPhcId,
          villageCode: 'VIL-412208',
          syndrome: 'febrile_illness',
        }),
      });

      await fetchDashboardData();
    } catch (err) {
      console.error('Failed to trigger outbreak simulation', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    setAcknowledgingId(alertId);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      await fetch(`/api/v1/intelligence/alerts/${alertId}/acknowledge`, {
        method: 'PATCH',
        headers,
      });

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a)),
      );
    } catch {
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a)),
      );
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Day,AreaCode,VillageName,Syndrome,RiskTier,Count\n' +
      aggregates
        .map(
          (a) =>
            `${a.day},${a.areaCode},"${VILLAGE_NAMES[a.areaCode] || a.areaCode}",${a.syndrome},${a.riskTier},${a.count}`,
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `epidemic_surveillance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAggregates =
    selectedSyndrome === 'ALL'
      ? aggregates
      : aggregates.filter((a) => a.syndrome === selectedSyndrome);

  if (unauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950 text-red-600 mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Unauthorized Facility Access</h2>
          <p className="text-xs text-slate-500">
            Your authenticated role does not have authorization to view operational surveillance data for this PHC.
          </p>
          <button
            onClick={() => navigate('/home')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
          >
            Return to Home Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/home')}
              className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-sm md:text-base font-bold text-slate-900 dark:text-white">
                  PHC Epidemiological Surveillance
                </h1>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>DPDP Act (Zero PHI)</span>
                </span>
                {summary.isDemoData && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
                    Demo Data
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {summary.facilityName || user?.facilityId || 'Assigned Primary Health Centre'} • Scoped Surveillance
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSimulateOutbreak}
              disabled={generating}
              className="hidden sm:flex px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold items-center space-x-1.5 transition-all"
              title="Inject demonstration outbreak cluster"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generating ? 'Simulating...' : 'Simulate Outbreak'}</span>
            </button>

            <button
              onClick={fetchDashboardData}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh Surveillance Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-5">
        {/* Error notification banner */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-800 dark:text-red-200 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={fetchDashboardData} className="underline font-bold">
              Retry
            </button>
          </div>
        )}

        {/* Offline indicator banner */}
        {isOffline && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
            <span>Offline mode: Live surveillance updates paused until connection returns.</span>
            <span className="text-[10px] font-bold uppercase bg-amber-200 dark:bg-amber-900 px-2 py-0.5 rounded">Cached</span>
          </div>
        )}

        {/* Empty state notice */}
        {summary.isEmpty && alerts.length === 0 && !loading && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Surveillance Signals Recorded Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              This facility currently has 0 recorded patient screenings or syndromic signals. Once local health events occur or are synced, live epidemiological curves and alert clusters will appear here.
            </p>
            <button
              onClick={handleSimulateOutbreak}
              disabled={generating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl border border-emerald-500/30 hover:bg-emerald-100 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{generating ? 'Simulating...' : 'Generate Synthetic Demonstration Cluster'}</span>
            </button>
          </div>
        )}
        {/* Epidemic Surge Alert Banner */}
        {alerts.length > 0 && alerts.some((a) => a.status === 'OPEN') && (
          <div className="bg-red-50 dark:bg-red-950/40 border-2 border-red-500/50 rounded-2xl p-4 shadow-sm space-y-3">
            {alerts
              .filter((a) => a.status === 'OPEN')
              .map((alert) => (
                <div key={alert.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-red-500 text-white rounded-xl shrink-0 mt-0.5">
                      <Flame className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                          {alert.severity} EPIDEMIC ALERT (Z-SCORE: {alert.zScore})
                        </span>
                        <span className="text-[10px] bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-200 px-2 py-0.2 rounded-full font-bold">
                          {VILLAGE_NAMES[alert.areaCode] || alert.areaCode}
                        </span>
                      </div>
                      <p className="text-xs text-red-900 dark:text-red-200 font-medium mt-1">
                        {alert.message}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                    disabled={acknowledgingId === alert.id}
                    className="self-end sm:self-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Acknowledge</span>
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* 4 Core Epidemiological Metric Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            {/* 1. Total Screenings */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                Total Screenings
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {summary.totalScreenings}
                </span>
                {summary.totalScreeningsChangePct && (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                    +{summary.totalScreeningsChangePct}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">7-day active coverage</p>
            </div>

            {/* 2. High Risk Cases */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                High-Risk Tier
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-red-600 dark:text-red-400">
                  {summary.highRiskCases}
                </span>
                {summary.highRiskChangePct && (
                  <span className="text-[10px] font-bold text-slate-400 flex items-center">
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                    {summary.highRiskChangePct}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Immediate triage priority</p>
            </div>

            {/* 3. Febrile Illness (Fever Surge) */}
            <div className="bg-white dark:bg-slate-900 border-2 border-amber-500/40 rounded-2xl p-4 shadow-sm space-y-1 relative">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 block uppercase tracking-wider">
                  Febrile Illness
                </span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
                  {summary.feverCases}
                </span>
                {summary.feverChangePct && (
                  <span className="text-[10px] font-bold text-amber-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                    +{summary.feverChangePct}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 font-medium">
                Surge threshold exceeded
              </p>
            </div>

            {/* 4. Acute Respiratory Infections */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
                Respiratory (ARI)
              </span>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-slate-900 dark:text-white">
                  {summary.respiratoryCases}
                </span>
                {summary.respiratoryChangePct && (
                  <span className="text-[10px] font-bold text-slate-500 flex items-center">
                    +{summary.respiratoryChangePct}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">Within seasonal baseline</p>
            </div>
          </div>
        )}

        {/* 7-Day Outbreak Progression Visualizer (SVG Curve) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <LineChart className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Syndromic Outbreak Trajectory (Kendur Village Spike)
              </h3>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">EWMA Baseline vs Observed</span>
          </div>

          <div className="h-32 w-full flex items-end justify-between pt-4 pb-2 px-2 border-b border-slate-100 dark:border-slate-800 relative">
            {/* Visual threshold line */}
            <div className="absolute top-8 left-0 right-0 border-b border-dashed border-red-400/60 flex justify-end pr-2">
              <span className="text-[9px] text-red-500 font-bold bg-white dark:bg-slate-900 px-1 -mt-2">
                Z-Score Threshold (2.0σ)
              </span>
            </div>

            {/* Simulated 7-day bar chart */}
            {[
              { day: 'Day -6', cases: 2, isHigh: false },
              { day: 'Day -5', cases: 1, isHigh: false },
              { day: 'Day -4', cases: 3, isHigh: false },
              { day: 'Day -3', cases: 2, isHigh: false },
              { day: 'Day -2', cases: 5, isHigh: false },
              { day: 'Day -1', cases: 9, isHigh: true },
              { day: 'Today', cases: 14, isHigh: true },
            ].map((bar, bIdx) => {
              const heightPercent = Math.min(100, (bar.cases / 15) * 100);
              return (
                <div key={bIdx} className="flex flex-col items-center space-y-1 w-10">
                  <span className={`text-[10px] font-bold ${bar.isHigh ? 'text-red-600' : 'text-slate-500'}`}>
                    {bar.cases}
                  </span>
                  <div className="w-6 bg-slate-100 dark:bg-slate-800 rounded-t-lg h-24 flex items-end">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className={`w-full rounded-t-lg transition-all ${
                        bar.isHigh
                          ? 'bg-gradient-to-t from-red-600 to-amber-500'
                          : 'bg-emerald-500/70'
                      }`}
                    />
                  </div>
                  <span className="text-[9px] text-slate-400">{bar.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Village Syndromic Aggregates Table with k-anonymity */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Village Syndromic Distribution & Cluster Density
              </h3>
              <p className="text-[11px] text-slate-400">
                k-anonymity enforced (cells &lt; 3 suppressed to protect village privacy)
              </p>
            </div>

            <div className="flex items-center space-x-2">
              {/* Syndrome Filter */}
              <select
                value={selectedSyndrome}
                onChange={(e) => setSelectedSyndrome(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300"
              >
                <option value="ALL">All Syndromes</option>
                <option value="febrile_illness">Febrile Illness</option>
                <option value="respiratory">Respiratory</option>
                <option value="gastrointestinal">Gastrointestinal</option>
              </select>

              {/* Export CSV button */}
              <button
                onClick={handleExportCsv}
                className="p-1.5 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1 transition-all"
                title="Export Epidemiological Data"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="pb-2.5 font-semibold">Village</th>
                  <th className="pb-2.5 font-semibold">Syndrome</th>
                  <th className="pb-2.5 font-semibold">Risk Tier</th>
                  <th className="pb-2.5 font-semibold">Age Group</th>
                  <th className="pb-2.5 font-semibold text-right">Case Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                {filteredAggregates.slice(0, 10).map((row, rIdx) => {
                  const isHighDensity = typeof row.count === 'number' && row.count >= 10;
                  return (
                    <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-850/50 transition-colors">
                      <td className="py-2.5 font-bold text-slate-800 dark:text-slate-200">
                        {VILLAGE_NAMES[row.areaCode] || row.areaCode}
                      </td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-400 capitalize">
                        {row.syndrome.replace('_', ' ')}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.riskTier === 'HIGH'
                              ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                              : row.riskTier === 'MEDIUM'
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          }`}
                        >
                          {row.riskTier}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-500 font-mono text-[11px]">{row.ageBand}</td>
                      <td className="py-2.5 text-right font-mono font-bold">
                        {row.count === '<3' ? (
                          <span className="text-slate-400 italic bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md text-[10px]">
                            &lt;3 (Privacy)
                          </span>
                        ) : (
                          <span className={isHighDensity ? 'text-red-600 text-sm font-extrabold' : 'text-slate-800 dark:text-slate-200'}>
                            {row.count}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
