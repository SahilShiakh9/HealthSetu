import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Calendar,
  ChevronRight,
  ArrowLeft,
  Pill,
} from 'lucide-react';
import { db } from '../../offline/db.js';
import { useAuthStore } from '../auth/useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';

interface ReportListItem {
  id: string;
  doctorName?: string;
  diagnosis?: string;
  outcomeType?: string;
  date: string;
  isOfflineCached?: boolean;
}

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { accessToken } = useAuthStore();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      // 1. First load from Dexie cache
      const cached = await db.encountersCache.toArray();
      const localList: ReportListItem[] = cached.map((c) => ({
        id: c.encounterId,
        doctorName: (c.data as any)?.doctorName || 'Assigned Clinician',
        diagnosis: (c.data as any)?.outcome?.diagnosisLabel || 'Clinical Assessment',
        outcomeType: (c.data as any)?.outcome?.outcomeType || 'COMPLETED',
        date: new Date(c.updatedAt).toLocaleDateString(),
        isOfflineCached: true,
      }));

      if (localList.length > 0) {
        setReports(localList);
      }

      // 2. Fetch from backend API: try /api/v1/reports first, fallback to user history
      try {
        const data = await apiClient<{ reports?: any[] }>('/reports');
        if (data.reports && data.reports.length > 0) {
          const apiList: ReportListItem[] = data.reports.map((r: any) => ({
            id: r._id,
            doctorName: r.doctorName || 'Assigned Clinician',
            diagnosis: r.diagnosis || 'Clinical Assessment',
            outcomeType: 'PRESCRIPTION',
            date: new Date(r.issuedAt).toLocaleDateString(),
            isOfflineCached: false,
          }));
          setReports(apiList);
          setLoading(false);
          return;
        }

        // Fallback: check consultation history
        const history = await apiClient<{ consultations?: any[] }>('/consultations/user/history');
        if (history.consultations && history.consultations.length > 0) {
          const apiList: ReportListItem[] = history.consultations.map((c: any) => ({
            id: c._id,
            doctorName: c.doctorId?.name || 'Assigned Clinician',
            diagnosis: c.outcome?.diagnosisLabel || 'General Consultation',
            outcomeType: c.outcome?.outcomeType || 'COMPLETED',
            date: new Date(c.createdAt).toLocaleDateString(),
            isOfflineCached: false,
          }));
          setReports(apiList);
        } else if (localList.length === 0) {
          setReports([]);
        }
      } catch {
        if (localList.length === 0) {
          setReports([]);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [accessToken]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3.5">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            {t('reports.title', 'Prescriptions & Medical Records')}
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Consultation History ({reports.length})</span>
          </div>
          <span className="text-[11px] text-slate-400">Available Offline</span>
        </div>

        {loading && reports.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-2">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-600 mx-auto" />
            <p className="text-xs text-slate-500">Loading records...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-2">
            <FileText className="w-10 h-10 text-slate-400 mx-auto" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">No Medical Records Yet</h3>
            <p className="text-xs text-slate-500">
              Prescriptions and doctor summaries will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/reports/${r.id}`)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:border-emerald-500/50 cursor-pointer transition-all space-y-2.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 rounded-xl">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">{r.diagnosis}</h3>
                      <p className="text-xs text-slate-500">{r.doctorName}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    {r.outcomeType}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{r.date}</span>
                  </div>

                  <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>View Slip</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
