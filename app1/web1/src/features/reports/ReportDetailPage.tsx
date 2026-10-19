import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { generateMedicalReportPdf } from '../../utils/pdfGenerator.js';
import { apiClient } from '../../services/apiClient.js';
import type { PrescriptionMedication } from '../consultation/ConsultationRoomPage.js';

interface EncounterDetail {
  id: string;
  doctorName: string;
  doctorQualification: string;
  facilityName: string;
  patientName: string;
  patientPhone: string;
  date: string;
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

      // 1. Try official Report endpoint first (/api/v1/reports/:id)
      try {
        const data = await apiClient<{ report?: any }>(`/reports/${consultationId}`);
        const r = data.report;
        if (r) {
          setEncounter({
            id: r._id || r.reportNumber,
            doctorName: r.doctorName || 'Assigned Clinician',
            doctorQualification: r.doctorRegistration || 'MMC Registered Medical Officer',
            facilityName: r.facilityName || 'Primary Health Telemedicine Network',
            patientName: r.patientName || (user?.name || (user?.phone ? `Patient (${user.phone})` : 'Patient')),
            patientPhone: r.patientPhone || user?.phone || '',
            date: new Date(r.issuedAt).toLocaleDateString(),
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

      // 2. Try consultation endpoint (/api/v1/consultations/:id)
      try {
        const data = await apiClient<{ consultation?: any }>(`/consultations/${consultationId}`);
        const consult = data.consultation;
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
        issuedAt: encounter.date || new Date().toISOString(),
        diagnosis: encounter.diagnosis,
        assessment: encounter.assessment,
        medications: encounter.medications,
        tests: encounter.tests,
        notes: encounter.notes,
        followUpDate: encounter.followUpDate,
        screeningSummary: 'AI-assisted screening, not a diagnosis',
        isMock: encounter.isMock,
      });
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Prescription_${encounter.id}.pdf`;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Failed to generate medical report PDF', error);
      window.alert('The report could not be downloaded. Please try again or use Print.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
          <h2 className="font-bold text-base text-slate-900 dark:text-white">Record Not Found</h2>
          <p className="text-xs text-slate-500">
            This medical report is unavailable or you do not have permission to view it.
          </p>
          <button
            onClick={() => navigate('/reports')}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Back to Medical Records
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 print:hidden">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/reports')}
            className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">
            Medical Prescription Slip
          </h1>
          <div className="flex items-center space-x-1">
            <button
              onClick={handleDownloadPdf}
              className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors"
              title="Download Official PDF"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Print Prescription Slip"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Printable Prescription Card */}
      <main className="max-w-md mx-auto p-4 space-y-4">
        <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 print:shadow-none print:border-black">
          {/* Header with Emblems & PHC Banner */}
          <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                  MoHFW Telemedicine Record
                </span>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {encounter.facilityName}
                </h2>
                <p className="text-xs text-slate-500">{encounter.doctorName}</p>
                <p className="text-[11px] text-slate-400">{encounter.doctorQualification}</p>
                {encounter.isMock && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300">
                    Demo Record / Synthetic Data
                  </span>
                )}
              </div>

              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-2xl text-emerald-600 shrink-0">
                <Stethoscope className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-slate-50 dark:bg-slate-850 p-2.5 rounded-xl text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">Patient Name</span>
                <strong className="text-slate-800 dark:text-slate-200">{encounter.patientName}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px]">Date Issued</span>
                <strong>{encounter.date}</strong>
              </div>
            </div>
          </div>

          {/* Clinical Diagnosis Section */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Primary Diagnosis
            </span>
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-500/20 rounded-2xl">
              <h3 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                {encounter.diagnosis}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                {encounter.assessment}
              </p>
            </div>
          </div>

          {/* Prescriptions with Visual Dosage Indicators */}
          <div className="space-y-2.5">
            <div className="flex items-center space-x-1.5 text-slate-800 dark:text-slate-200">
              <Pill className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider">
                Prescription (औषधे)
              </h4>
            </div>

            {encounter.medications.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-850 rounded-xl">
                No medications prescribed. General clinical advice given.
              </p>
            ) : (
              <div className="space-y-2">
                {encounter.medications.map((med, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-1.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-slate-900 dark:text-white">
                        {idx + 1}. {med.name}
                      </h5>
                      <p className="text-[11px] text-slate-500">
                        {med.dosage} • {med.frequency} • {med.durationDays} Days
                      </p>
                    </div>
                  </div>

                  {/* Visual Timing Badges for Rural Literacy */}
                  <div className="flex items-center space-x-2 pt-1 border-t border-slate-200/50 dark:border-slate-800/50">
                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.morning
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-200/60 text-slate-400 line-through'
                      }`}
                    >
                      <Sun className="w-3 h-3" />
                      <span>Morning</span>
                    </span>

                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.afternoon
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300'
                          : 'bg-slate-200/60 text-slate-400 line-through'
                      }`}
                    >
                      <CloudSun className="w-3 h-3" />
                      <span>Noon</span>
                    </span>

                    <span
                      className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                        med.timing?.night
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-slate-200/60 text-slate-400 line-through'
                      }`}
                    >
                      <Moon className="w-3 h-3" />
                      <span>Night</span>
                    </span>
                  </div>

                  {med.instructions && (
                    <p className="text-[10px] text-slate-500 italic pt-0.5">
                      Note: {med.instructions}
                    </p>
                  )}
                </div>
              ))}
              </div>
            )}
          </div>

          {/* Advice & Follow-Up */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2 text-xs">
            {encounter.notes && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Advice:</span>
                <p className="text-slate-700 dark:text-slate-300 mt-0.5">{encounter.notes}</p>
              </div>
            )}

            <div className="flex items-center justify-between bg-emerald-50/50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-500/10">
              <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                Recommended Follow-up:
              </span>
              <strong className="text-xs text-emerald-900 dark:text-emerald-200">
                {encounter.followUpDate}
              </strong>
            </div>
          </div>

          {/* Section 11.6 Statutory Clinical Disclaimer */}
          <div className="border-t-2 border-dashed border-slate-200 dark:border-slate-800 pt-3 space-y-1.5">
            <div className="flex items-start space-x-2 text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p>
                <strong>Statutory Notice:</strong> This digital record is issued under MoHFW Telemedicine Practice Guidelines (2020). For sudden chest pain, severe breathlessness or loss of consciousness, seek immediate emergency care at the nearest hospital or call <strong>108</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 print:hidden">
          <button
            onClick={handleDownloadPdf}
            className="w-full min-h-[50px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Download Official PDF Slip</span>
          </button>
          <button
            onClick={handlePrint}
            className="w-full min-h-[46px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-2xl flex items-center justify-center space-x-2 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Prescription Slip</span>
          </button>
          <button
            onClick={() => navigate('/home')}
            className="w-full min-h-[44px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-2xl flex items-center justify-center transition-all"
          >
            Return to Home
          </button>
        </div>
      </main>
    </div>
  );
};
