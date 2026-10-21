import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Printer,
  Download,
  Stethoscope,
  AlertCircle,
  Pill,
  Sun,
  CloudSun,
  Moon,
} from 'lucide-react';
import { db } from '../../offline/db.js';
import { useAuthStore } from '../auth/useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';
import { generateMedicalReportPdf } from '../../utils/pdfGenerator.js';
import type { PrescriptionMedication } from '../consultation/ConsultationRoomPage.js';

interface EncounterDetail {
  id: string;
  doctorName: string;
  doctorQualification: string;
  facilityName: string;
  patientName: string;
  patientPhone: string;
  date: string;
  rawDate?: string;
  diagnosis: string;
  assessment: string;
  outcomeType: string;
  medications: PrescriptionMedication[];
  tests: string[];
  notes: string;
  followUpDate: string;
  isMock?: boolean;
}

export const ReportDetailPage: React.FC = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, accessToken } = useAuthStore();

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReport = async () => {
      if (!consultationId) {
        setLoading(false);
        return;
      }

      // Explicit Demo fallback with visible isMock: true badge
      if (consultationId.startsWith('demo')) {
        setEncounter({
          id: consultationId,
          doctorName: 'Demo Medical Officer',
          doctorQualification: 'Reg. No: MMC/DEMO/2026 • Medical Officer',
          facilityName: 'Shirur Rural Primary Health Centre (PHC)',
          patientName: user?.name || (user?.phone ? `Patient (${user.phone})` : 'Demo Patient'),
          patientPhone: user?.phone || '9876543210',
          date: new Date().toLocaleDateString(),
          rawDate: new Date().toISOString(),
          diagnosis: 'Acute Upper Respiratory Tract Infection (Demo Sample)',
          assessment: 'Mild throat congestion. Vitals stable.',
          outcomeType: 'PRESCRIPTION',
          medications: [
            {
              name: 'Paracetamol 500mg',
              dosage: '1 tablet',
              frequency: 'Thrice daily after food',
              durationDays: 3,
              instructions: 'Take when fever or body ache occurs',
              timing: { morning: true, afternoon: true, night: true, beforeFood: false },
            },
          ],
          tests: ['CBC if symptoms persist > 3 days'],
          notes: 'Steam inhalation twice daily. Drink warm water.',
          followUpDate: 'In 5 days if required',
          isMock: true,
        });
        setLoading(false);
        return;
      }

      // 1. Try official Report endpoint first (/reports/:id)
      try {
        const data = await apiClient<{ report?: any }>(`/reports/${consultationId}`);
        const r = data?.report;
        if (r) {
          setEncounter({
            id: r._id || r.reportNumber,
            doctorName: r.doctorName || 'Assigned Clinician',
            doctorQualification: r.doctorRegistration || 'MMC Registered Medical Officer',
            facilityName: r.facilityName || 'Primary Health Telemedicine Network',
            patientName: r.patientName || (user?.name || (user?.phone ? `Patient (${user.phone})` : 'Patient')),
            patientPhone: r.patientPhone || user?.phone || '',
            date: new Date(r.issuedAt).toLocaleDateString(),
            rawDate: r.issuedAt,
            diagnosis: r.diagnosis || 'Clinical Assessment',
            assessment: r.assessment || 'Consultation concluded.',
            outcomeType: 'PRESCRIPTION',
            medications: r.medications || [],
            tests: r.tests || [],
            notes: r.notes || '',
            followUpDate: r.followUpDate || '',
            isMock: r.isMock ?? false,
          });
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to consultation check
      }

      // 2. Try consultation endpoint (/consultations/:id)
      try {
        const data = await apiClient<{ consultation?: any }>(`/consultations/${consultationId}`);
        const consult = data?.consultation;
        const outcome = consult?.outcome;

        if (outcome) {
          setEncounter({
            id: consult._id,
            doctorName: consult.doctorId?.name || 'Assigned Clinician',
            doctorQualification: 'Reg. No: MMC Registered Medical Officer',
            facilityName: 'Primary Health Telemedicine Network',
            patientName: consult.patientId?.name || (user?.name || (user?.phone ? `Patient (${user.phone})` : 'Patient')),
            patientPhone: consult.patientId?.phone || user?.phone || '',
            date: new Date(consult.createdAt).toLocaleDateString(),
            rawDate: outcome.issuedAt || consult.createdAt,
            diagnosis: outcome.diagnosisLabel || 'Clinical Assessment',
            assessment: outcome.assessment || 'Consultation completed.',
            outcomeType: outcome.outcomeType || 'COMPLETED',
            medications: outcome.medications || [],
            tests: outcome.tests || [],
            notes: outcome.notes || '',
            followUpDate: outcome.followUpDate || '',
            isMock: consult.doctorId?.isMock ?? false,
          });
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to cache
      }

      // 3. Fallback to Dexie local cache
      const cached = await db.encountersCache.get(consultationId);
      if (cached && (cached.data as any)?.outcome) {
        const outcome = (cached.data as any).outcome;
        setEncounter({
          id: consultationId,
          doctorName: (cached.data as any).doctorName || 'Assigned Clinician',
          doctorQualification: 'Reg. No: MMC Registered Medical Officer',
          facilityName: 'Primary Health Telemedicine Network',
          patientName: user?.name || (user?.phone ? `Patient (${user.phone})` : 'Patient'),
          patientPhone: user?.phone || '',
          date: new Date(cached.updatedAt).toLocaleDateString(),
          rawDate: (cached.data as any)?.outcome?.issuedAt || (cached.data as any)?.completedAt || new Date(cached.updatedAt).toISOString(),
          diagnosis: outcome.diagnosisLabel || 'Clinical Assessment',
          assessment: outcome.assessment || '',
          outcomeType: outcome.outcomeType || 'COMPLETED',
          medications: outcome.medications || [],
          tests: outcome.tests || [],
          notes: outcome.notes || '',
          followUpDate: outcome.followUpDate || '',
          isMock: false,
        });
      } else {
        setEncounter(null);
      }

      setLoading(false);
    };

    loadReport();
  }, [consultationId, accessToken, user]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    if (!encounter) return;
    try {
      const doc = generateMedicalReportPdf({
        reportNumber: encounter.id,
        facilityName: encounter.facilityName,
        doctorName: encounter.doctorName,
        doctorRegistration: encounter.doctorQualification,
        patientName: encounter.patientName,
        patientPhone: encounter.patientPhone,
        issuedAt: encounter.rawDate || encounter.date || new Date().toISOString(),
        diagnosis: encounter.diagnosis,
        assessment: encounter.assessment,
        medications: encounter.medications,
        tests: encounter.tests,
        notes: encounter.notes,
        followUpDate: encounter.followUpDate,
        screeningSummary: 'AI-assisted screening, not a diagnosis',
        isMock: encounter.isMock,
      });

      const fileName = `Prescription_${encounter.id || 'Report'}.pdf`;

      try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch {
        doc.save(fileName);
      }
    } catch (err) {
      console.error('Error generating PDF download:', err);
      try {
        window.print();
      } catch {
        // ignore
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F47738]" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="min-h-screen bg-[#FFF9F5] text-[#242424] flex items-center justify-center p-4">
        <div className="bg-white border border-[#F0E2D8] rounded-3xl p-8 max-w-sm w-full text-center space-y-3 shadow-xs">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-[#242424]">{t('reports.record_not_found', 'Record Not Found')}</h2>
          <p className="text-xs text-[#6B7280]">
            {t('reports.record_not_found_desc', 'This medical report is unavailable or you do not have permission to view it.')}
          </p>
          <button
            onClick={() => navigate('/reports')}
            className="w-full py-2.5 px-4 bg-[#F47738] hover:bg-[#D95D24] text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            {t('reports.back_to_reports', 'Back to Medical Records')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] px-4 py-3 shadow-xs print:hidden">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/reports')}
            className="p-2 -ml-2 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
            aria-label="Back to Medical Records"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm sm:text-base font-bold text-[#242424]">
            {t('reports.slip_title', 'Medical Prescription Slip')}
          </h1>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleDownloadPdf}
              className="p-2 rounded-xl text-[#D95D24] hover:bg-[#FFF0E6] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              title={t('reports.download_pdf', 'Download Official PDF')}
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
              title={t('reports.print', 'Print Prescription Slip')}
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Printable Prescription Card */}
      <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="bg-white border-2 border-[#F0E2D8] rounded-3xl p-5 sm:p-8 shadow-xs space-y-5 print:shadow-none print:border-black">
          {/* Header with Emblems & PHC Banner */}
          <div className="border-b border-[#F0E2D8] pb-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#D95D24] uppercase tracking-wider block">
                  {t('reports.mohfw_banner', 'MoHFW Telemedicine Record')}
                </span>
                <h2 className="text-base font-extrabold text-[#242424]">
                  {encounter.facilityName}
                </h2>
                <p className="text-xs text-[#6B7280]">{encounter.doctorName}</p>
                <p className="text-[11px] text-[#6B7280]">{encounter.doctorQualification}</p>
                {encounter.isMock && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFF0E6] text-[#D95D24] border border-[#F0E2D8]">
                    Demo Record / Synthetic Data
                  </span>
                )}
              </div>

              <div className="p-2.5 bg-[#FFF0E6] rounded-2xl text-[#D95D24] shrink-0">
                <Stethoscope className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-[#FFF9F5] p-2.5 rounded-xl text-[#242424] border border-[#F0E2D8]">
              <div>
                <span className="text-[#6B7280] block text-[10px]">{t('reports.patient_name', 'Patient Name')}</span>
                <strong className="text-[#242424]">{encounter.patientName}</strong>
              </div>
              <div className="text-right">
                <span className="text-[#6B7280] block text-[10px]">{t('reports.date', 'Date Issued')}</span>
                <strong>{encounter.date}</strong>
              </div>
            </div>
          </div>

          {/* Clinical Diagnosis Section */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              {t('reports.diagnosis', 'Primary Diagnosis')}
            </span>
            <div className="p-3 bg-[#FFF0E6]/50 border border-[#F47738]/20 rounded-2xl">
              <h3 className="font-bold text-sm text-[#D95D24]">
                {encounter.diagnosis}
              </h3>
              <p className="text-xs text-[#242424] mt-1">
                {encounter.assessment}
              </p>
            </div>
          </div>

          {/* Prescriptions with Visual Dosage Indicators */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-1.5 text-[#242424]">
              <Pill className="w-4 h-4 text-[#F47738]" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                {t('reports.medications', 'Prescription (औषधे)')}
              </h4>
            </div>

            {encounter.medications.length === 0 ? (
              <p className="text-xs text-[#6B7280] italic p-3 bg-[#FFF9F5] rounded-xl border border-[#F0E2D8]">
                No medications prescribed. General clinical advice given.
              </p>
            ) : (
              <div className="space-y-2">
                {encounter.medications.map((med, idx) => (
                <div
                  key={idx}
                  className="bg-[#FFF9F5] p-3 rounded-2xl border border-[#F0E2D8] space-y-1.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-[#242424]">
                        {idx + 1}. {med.name}
                      </h5>
                      <p className="text-[11px] text-[#6B7280]">
                        {med.dosage} • {med.frequency} • {med.durationDays} {t('reports.days', 'Days')}
                      </p>
                    </div>
                  </div>

                  {/* Visual Timing Badges for Rural Literacy */}
                  <div className="flex items-center space-x-2 pt-1 border-t border-[#F0E2D8]">
                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.morning
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-400 line-through'
                      }`}
                    >
                      <Sun className="w-3 h-3" />
                      <span>{t('reports.morning', 'Morning')}</span>
                    </span>

                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.afternoon
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-400 line-through'
                      }`}
                    >
                      <CloudSun className="w-3 h-3" />
                      <span>{t('reports.noon', 'Noon')}</span>
                    </span>

                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.night
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-100 text-slate-400 line-through'
                      }`}
                    >
                      <Moon className="w-3 h-3" />
                      <span>{t('reports.night', 'Night')}</span>
                    </span>
                  </div>

                  {med.instructions && (
                    <p className="text-[10px] text-[#6B7280] italic pt-0.5">
                      Note: {med.instructions}
                    </p>
                  )}
                </div>
              ))}
              </div>
            )}
          </div>

          {/* Advice & Follow-Up */}
          <div className="border-t border-[#F0E2D8] pt-3 space-y-2 text-xs">
            {encounter.notes && (
              <div>
                <span className="text-[10px] font-bold text-[#6B7280] uppercase">{t('reports.clinical_notes', 'Advice:')}</span>
                <p className="text-[#242424] mt-0.5">{encounter.notes}</p>
              </div>
            )}

            <div className="flex items-center justify-between bg-[#FFF0E6] p-2.5 rounded-xl border border-[#F0E2D8]">
              <span className="text-[11px] font-medium text-[#D95D24]">
                {t('reports.follow_up', 'Recommended Follow-up:')}
              </span>
              <strong className="text-xs text-[#D95D24]">
                {encounter.followUpDate}
              </strong>
            </div>
          </div>

          {/* Section 11.6 Statutory Clinical Disclaimer */}
          <div className="border-t-2 border-dashed border-[#F0E2D8] pt-3 space-y-1.5">
            <div className="flex items-start space-x-2 text-[10px] text-[#6B7280] leading-tight">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p>
                <strong>Statutory Notice:</strong> This digital record is issued under MoHFW Telemedicine Practice Guidelines (2020). For sudden chest pain, severe breathlessness or loss of consciousness, seek immediate emergency care at the nearest hospital or call <strong>108</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
          <button
            onClick={handleDownloadPdf}
            className="w-full min-h-[48px] bg-[#F47738] hover:bg-[#D95D24] text-white font-bold rounded-2xl shadow-md shadow-[#F47738]/20 flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{t('reports.download_pdf', 'Download PDF')}</span>
          </button>
          <button
            onClick={handlePrint}
            className="w-full min-h-[48px] bg-white hover:bg-[#FFF0E6] text-[#242424] border border-[#F0E2D8] font-bold rounded-2xl flex items-center justify-center space-x-2 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-[#6B7280]" />
            <span>{t('reports.print', 'Print Prescription')}</span>
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full min-h-[48px] bg-white border border-[#F0E2D8] text-[#242424] font-bold rounded-2xl flex items-center justify-center transition-all cursor-pointer hover:bg-[#FFF0E6]"
          >
            {t('common.returnHome', 'Return to Home')}
          </button>
        </div>
      </main>
    </div>
  );
};
