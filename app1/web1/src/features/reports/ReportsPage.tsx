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

      // 2. Fetch from backend API: try /reports first, fallback to user history
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
        const consultData = await apiClient<{ consultations?: any[] }>('/consultations/user/history');
        if (consultData.consultations && consultData.consultations.length > 0) {
          const apiList: ReportListItem[] = consultData.consultations.map((c: any) => ({
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
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] px-4 py-3.5 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="p-2 -ml-2 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
            aria-label="Back to Home"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base sm:text-lg font-bold text-[#242424]">
            {t('reports.title', 'Prescriptions & Medical Records')}
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold text-[#242424]">
            <FileText className="w-4 h-4 text-[#F47738]" />
            <span>{t('reports.history', { count: reports.length, defaultValue: `Consultation History (${reports.length})` })}</span>
          </div>
          <span className="text-[11px] sm:text-xs text-[#6B7280]">{t('reports.available_offline', 'Available Offline')}</span>
        </div>

        {loading && reports.length === 0 ? (
          <div className="bg-white border border-[#F0E2D8] rounded-3xl p-8 text-center space-y-3 shadow-xs">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-[#F47738] mx-auto" />
            <p className="text-xs text-[#6B7280]">{t('reports.loading', 'Loading records...')}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white border border-[#F0E2D8] rounded-3xl p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="w-16 h-16 rounded-2xl bg-[#FFF0E6] text-[#D95D24] flex items-center justify-center mx-auto">
              <FileText className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-[#242424]">{t('reports.no_records', 'No Medical Records Yet')}</h3>
              <p className="text-xs text-[#6B7280] max-w-sm mx-auto">
                {t('reports.no_records_sub', 'Prescriptions and doctor summaries will automatically appear here.')}
              </p>
            </div>
            <button
              onClick={() => navigate('/consult')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#F47738] hover:bg-[#D95D24] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
            >
              Consult a Doctor Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/reports/${r.id}`)}
                className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs hover:border-[#F47738]/60 cursor-pointer transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="p-2 bg-[#FFF0E6] text-[#D95D24] rounded-xl shrink-0">
                      <Pill className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-[#242424] truncate">{r.diagnosis}</h3>
                      <p className="text-xs text-[#6B7280] truncate">{r.doctorName}</p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF0E6] text-[#D95D24] border border-[#F0E2D8] shrink-0">
                    {r.outcomeType}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#6B7280] border-t border-[#F0E2D8] pt-2.5">
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-[#F47738]" />
                    <span>{r.date}</span>
                  </div>

                  <div className="flex items-center space-x-1 text-[#D95D24] font-semibold hover:text-[#F47738]">
                    <span>{t('reports.view_slip', 'View Slip')}</span>
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
