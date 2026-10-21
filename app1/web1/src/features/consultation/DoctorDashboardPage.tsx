import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Stethoscope,
  Users,
  CheckCircle2,
  Play,
  ArrowRight,
  ChevronRight,
  RefreshCw,
  Building2,
  Plus,
  AlertTriangle,
  X,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Clock,
  FileText,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';
import type { DoctorAvailability } from '@healthsetu/contracts';

interface QueuedPatientItem {
  _id: string;
  patientId?: {
    name?: string;
    phone?: string;
    language?: string;
  };
  screeningId?: {
    riskTier?: 'LOW' | 'MEDIUM' | 'HIGH';
    isEmergency?: boolean;
    primarySymptoms?: string[];
  };
  effectivePriority: number;
  positionInQueue: number;
  estimatedWaitMinutes: number;
  status: string;
  preferredLanguage: string;
  createdAt: string;
}

interface DoctorAffiliationInfo {
  _id: string;
  facilityId: {
    _id: string;
    facilityId: string;
    name: string;
    type: string;
    districtCode: string;
    organizationStatus: string;
  };
  roleInFacility: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED';
  notes?: string;
}

interface DoctorProfileInfo {
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  registrationNumber?: string;
  specialties?: string[];
  qualification?: string;
}

interface ReportSummaryItem {
  _id: string;
  reportNumber?: string;
  patientName?: string;
  diagnosis?: string;
  issuedAt?: string;
}

export const DoctorDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken, user, logout } = useAuthStore();

  const [availability, setAvailability] = useState<DoctorAvailability>('AVAILABLE');
  const [queue, setQueue] = useState<QueuedPatientItem[]>([]);
  const [affiliations, setAffiliations] = useState<DoctorAffiliationInfo[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileInfo | null>(null);
  const [recentReports, setRecentReports] = useState<ReportSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Request affiliation modal state
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestFacilityId, setRequestFacilityId] = useState('fac-phc-001');
  const [customFacilityId, setCustomFacilityId] = useState('');
  const [useCustomFacility, setUseCustomFacility] = useState(false);
  const [availableFacilities, setAvailableFacilities] = useState<
    Array<{ _id?: string; id?: string; facilityId?: string; name: string; type?: string; district?: string }>
  >([]);
  const [requestRole, setRequestRole] = useState<'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER'>('CONSULTANT');
  const [requestNotes, setRequestNotes] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const fetchAvailableFacilities = async () => {
    try {
      const res = await apiClient<{
        facilities: Array<{ _id?: string; id?: string; facilityId?: string; name: string; type?: string; district?: string; districtCode?: string }>;
      }>('/facilities?registeredOnly=true');
      if (res.facilities && res.facilities.length > 0) {
        setAvailableFacilities(res.facilities);
        const first = res.facilities[0];
        setRequestFacilityId(first.facilityId || first._id || first.id || 'fac-phc-001');
      }
    } catch {
      // Keep existing default options
    }
  };

  const fetchDoctorQueue = async () => {
    setLoading(true);
    try {
      const data = await apiClient<{ queue: QueuedPatientItem[] }>('/consultations/doctor/queue');
      setQueue(data.queue || []);
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAffiliations = async () => {
    if (!accessToken) return;
    try {
      const data = await apiClient<{ affiliations: DoctorAffiliationInfo[]; doctorProfile?: DoctorProfileInfo }>(
        '/affiliations/doctor',
      );
      setAffiliations(data.affiliations || []);
      if (data.doctorProfile) {
        setDoctorProfile(data.doctorProfile);
      }
    } catch {
      // ignore
    }
  };

  const fetchRecentReports = async () => {
    if (!accessToken) return;
    try {
      const res = await apiClient<{ reports: ReportSummaryItem[] }>('/reports');
      setRecentReports(res.reports || []);
    } catch {
      setRecentReports([]);
    }
  };

  useEffect(() => {
    fetchDoctorQueue();
    fetchAffiliations();
    fetchRecentReports();
    fetchAvailableFacilities();
    const queueInterval = setInterval(fetchDoctorQueue, 8000);

    // Heartbeat every 20 seconds when doctor is available
    const heartbeatInterval = setInterval(async () => {
      if (availability === 'AVAILABLE' && accessToken) {
        try {
          await apiClient('/consultations/doctor/heartbeat', {
            method: 'POST',
          });
        } catch {
          // Heartbeat failed silently; next cycle retries
        }
      }
    }, 20000);

    return () => {
      clearInterval(queueInterval);
      clearInterval(heartbeatInterval);
    };
  }, [accessToken, availability]);

  const handleUpdateAvailability = async (nextStatus: DoctorAvailability) => {
    setAvailability(nextStatus);
    try {
      await apiClient('/consultations/doctor/availability', {
        method: 'PATCH',
        body: JSON.stringify({ availability: nextStatus }),
      });
    } catch {
      // Local fallback state
    }
  };

  const handleRequestAffiliation = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetFacilityId = useCustomFacility ? customFacilityId.trim() : requestFacilityId;
    if (!accessToken || !targetFacilityId) {
      setErrorMessage('Please select a healthcare facility or enter a valid Facility ID');
      return;
    }

    try {
      setSubmittingRequest(true);
      setErrorMessage(null);
      await apiClient('/affiliations/request', {
        method: 'POST',
        body: JSON.stringify({
          facilityId: targetFacilityId,
          roleInFacility: requestRole,
          notes: requestNotes,
        }),
      });

      setShowRequestModal(false);
      setRequestNotes('');
      setCustomFacilityId('');
      setUseCustomFacility(false);
      fetchAffiliations();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to submit affiliation request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const activeAffiliations = affiliations.filter((a) => a.status === 'ACTIVE');
  const pendingAffiliations = affiliations.filter((a) => a.status === 'PENDING');
  const hasActiveAffiliation = activeAffiliations.length > 0;
  const isDoctorApproved = !doctorProfile || doctorProfile.verificationStatus === 'APPROVED';

  // Derived metrics from real state
  const todayStr = new Date().toDateString();
  const todayReports = recentReports.filter(
    (r) => r.issuedAt && new Date(r.issuedAt).toDateString() === todayStr,
  );
  const highRiskCount = queue.filter(
    (item) => item.screeningId?.riskTier === 'HIGH' || item.screeningId?.isEmergency,
  ).length;

  const handleAcceptPatient = async (consultationId: string = 'next') => {
    if (doctorProfile && doctorProfile.verificationStatus !== 'APPROVED') {
      setErrorMessage(
        `Professional verification status is ${doctorProfile.verificationStatus}. You must be verified and approved by medical council/reviewer before accepting clinical consultations.`,
      );
      return;
    }

    if (affiliations.length > 0 && !hasActiveAffiliation) {
      setErrorMessage(
        'You have no approved hospital affiliations. An approved hospital affiliation is required before taking patient consultations.',
      );
      return;
    }

    setAcceptingId(consultationId);
    setErrorMessage(null);
    try {
      const data: any = await apiClient(`/consultations/${consultationId}/accept`, {
        method: 'POST',
      });

      const cid = data.consultation?._id || consultationId;
      navigate(`/consult/room/${cid}?role=doctor`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'No patients currently available to admit in your specialty pool.');
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] px-4 sm:px-6 py-2.5 sm:py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Identity & Portal Title */}
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-[#FFF0E6] text-[#D95D24] rounded-xl shadow-xs shrink-0">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold text-[#242424] truncate">
                  Doctor Portal
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B7280] bg-[#FFF0E6] px-2 py-0.5 rounded-md border border-[#F0E2D8]">
                  {user?.name ? `Dr. ${user.name}` : 'Clinical Officer'}
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280] truncate">
                Clinical Tele-Triage & Consultations Workstation
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setShowRequestModal(true)}
              className="px-2.5 py-1.5 rounded-xl text-[#D95D24] hover:bg-[#FFF0E6] transition-colors flex items-center gap-1 text-xs font-bold min-h-[36px] cursor-pointer"
              title="Add Facility Affiliation"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden xs:inline">Affiliate</span>
            </button>
            <button
              onClick={() => {
                fetchDoctorQueue();
                fetchAffiliations();
                fetchRecentReports();
              }}
              className="p-2 rounded-xl text-[#6B7280] hover:bg-[#FFF0E6] hover:text-[#D95D24] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/staff/login', { replace: true });
              }}
              className="p-2 rounded-xl text-[#6B7280] hover:text-rose-600 hover:bg-[#FFF0E6] transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">
        {/* Summary KPI Metrics Bar (Organized into compact cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Metric 1: Patients Waiting */}
          <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Waiting Patients
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#242424]">
                {queue.length}
              </p>
              <p className="text-[11px] font-medium text-[#6B7280]">
                {highRiskCount > 0 ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                    {highRiskCount} High Priority
                  </span>
                ) : (
                  'Auto-triaged by risk tier'
                )}
              </p>
            </div>
            <div className="p-3 bg-[#FFF0E6] text-[#F47738] rounded-2xl shrink-0">
              <Users className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Metric 2: Estimated Wait / Queue Latency */}
          <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Queue Latency
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#242424]">
                {queue.length > 0 ? `~${queue[0].estimatedWaitMinutes}m` : '0m'}
              </p>
              <p className="text-[11px] font-medium text-[#6B7280] truncate max-w-[120px] sm:max-w-none">
                {queue.length > 0 ? `Token #${queue[0].positionInQueue} is next` : 'No backlog waiting'}
              </p>
            </div>
            <div className="p-3 bg-[#FFF0E6] text-[#F47738] rounded-2xl shrink-0">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Metric 3: Today's Consultations */}
          <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Consultations
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#242424]">
                {recentReports.length}
              </p>
              <p className="text-[11px] font-medium text-[#6B7280]">
                {todayReports.length > 0 ? `${todayReports.length} completed today` : 'Prescriptions issued'}
              </p>
            </div>
            <div className="p-3 bg-[#FFF0E6] text-[#F47738] rounded-2xl shrink-0">
              <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Metric 4: Duty Availability Status */}
          <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Clinician Status
              </p>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    availability === 'AVAILABLE'
                      ? 'bg-emerald-500 animate-pulse'
                      : availability === 'BREAK'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="text-lg sm:text-xl font-black text-[#242424]">
                  {availability === 'AVAILABLE' ? 'Ready' : availability === 'BREAK' ? 'On Break' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] font-medium text-[#6B7280]">
                {activeAffiliations.length} active affiliation{activeAffiliations.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-3 bg-[#FFF0E6] text-[#F47738] rounded-2xl shrink-0">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>
        </div>

        {/* Main Clinical Workspace: Balanced Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Primary Column (8 cols): Patient Triage Queue */}
          <div className="lg:col-span-8 space-y-4">
            {/* Priority "Accept Next" Action Banner */}
            <div className="bg-white border-2 border-[#F47738]/40 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center space-x-3">
                  <div className="p-2.5 bg-[#F47738] text-white rounded-xl shadow-xs shrink-0">
                    <Play className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-[#242424]">
                      Next Patient in Triage
                    </h2>
                    <p className="text-xs text-[#6B7280]">
                      {queue.length > 0
                        ? `Token #${queue[0].positionInQueue} • ${queue[0].patientId?.name || 'Patient'} • ${queue[0].screeningId?.riskTier || 'MEDIUM'} Risk (${queue[0].preferredLanguage.toUpperCase()})`
                        : 'No pending consultations in queue. Ready to accept incoming rural triage referrals.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleAcceptPatient('next')}
                  disabled={
                    acceptingId !== null ||
                    availability !== 'AVAILABLE' ||
                    !isDoctorApproved ||
                    (affiliations.length > 0 && !hasActiveAffiliation)
                  }
                  className="px-5 py-2.5 bg-[#F47738] hover:bg-[#D95D24] text-white text-xs sm:text-sm font-bold rounded-xl shadow-md shadow-[#F47738]/20 flex items-center justify-center space-x-2 transition-all disabled:opacity-50 min-h-[42px] cursor-pointer shrink-0"
                >
                  <span>{acceptingId === 'next' ? 'Connecting...' : 'Accept Next Patient'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Status Alert Notice if Doctor Cannot Accept */}
              {(!isDoctorApproved || (affiliations.length > 0 && !hasActiveAffiliation) || availability !== 'AVAILABLE') && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {!isDoctorApproved
                      ? 'Doctor verification is pending approval by the health council. Consultations are currently locked.'
                      : (affiliations.length > 0 && !hasActiveAffiliation)
                      ? 'An approved hospital affiliation is required before accepting patient calls.'
                      : 'Availability is set to Break or Offline. Set status to "Ready" above to admit patients.'}
                  </span>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3.5 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Queue Section Header */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold text-[#242424]">
                <Users className="w-4 h-4 text-[#F47738]" />
                <span>Waiting Patients ({queue.length})</span>
              </div>
              <span className="text-[11px] text-[#6B7280] font-medium">
                Auto-prioritized by Clinical Risk Tier
              </span>
            </div>

            {/* Patient Queue List */}
            <div className="space-y-3">
              {queue.length === 0 ? (
                <div className="bg-white border border-[#F0E2D8] rounded-2xl p-8 text-center space-y-2 shadow-xs">
                  <div className="w-12 h-12 bg-[#FFF0E6] text-[#F47738] rounded-2xl mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-[#242424]">
                    All Caught Up!
                  </h3>
                  <p className="text-xs text-[#6B7280] max-w-md mx-auto">
                    No patients currently waiting in queue for your specialty pool. When citizens complete AI symptom screening, urgent triage consultations will immediately appear here.
                  </p>
                </div>
              ) : (
                queue.map((item) => {
                  const risk = item.screeningId?.riskTier || 'LOW';
                  const riskBadgeClass =
                    risk === 'HIGH'
                      ? 'bg-red-500 text-white ring-2 ring-red-400/30'
                      : risk === 'MEDIUM'
                      ? 'bg-amber-500 text-white'
                      : 'bg-emerald-600 text-white';

                  return (
                    <div
                      key={item._id}
                      className="bg-white border border-[#F0E2D8] rounded-2xl p-4 sm:p-5 shadow-xs hover:border-[#F47738]/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-sm sm:text-base font-bold text-[#242424] truncate">
                              {item.patientId?.name || 'Patient'}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${riskBadgeClass}`}
                            >
                              {risk} RISK
                            </span>
                            {item.screeningId?.isEmergency && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                                EMERGENCY
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {item.patientId?.phone || 'Mobile not provided'} • Lang:{' '}
                            {item.preferredLanguage.toUpperCase()}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-[#D95D24] block">
                            Token #{item.positionInQueue}
                          </span>
                          <p className="text-[10px] text-[#6B7280]">
                            ~{item.estimatedWaitMinutes}m wait
                          </p>
                        </div>
                      </div>

                      {/* Primary Symptoms */}
                      {item.screeningId?.primarySymptoms &&
                        item.screeningId.primarySymptoms.length > 0 && (
                          <div className="bg-[#FFF9F5] p-3 rounded-xl border border-[#F0E2D8]">
                            <p className="text-[10px] text-[#6B7280] font-semibold mb-1 uppercase tracking-wider">
                              Reported Symptoms
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.screeningId.primarySymptoms.map((sym, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="text-[11px] bg-white border border-[#F0E2D8] px-2.5 py-0.5 rounded-lg text-[#242424] font-medium"
                                >
                                  {sym}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                      {/* Action Button */}
                      <div className="pt-1 flex items-center justify-end">
                        <button
                          onClick={() => handleAcceptPatient(item._id)}
                          disabled={
                            acceptingId !== null ||
                            availability !== 'AVAILABLE' ||
                            !isDoctorApproved ||
                            (affiliations.length > 0 && !hasActiveAffiliation)
                          }
                          className="px-4 py-2 bg-[#F47738] hover:bg-[#D95D24] active:scale-95 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-sm disabled:opacity-50 min-h-[38px] cursor-pointer"
                        >
                          <span>{acceptingId === item._id ? 'Admitting...' : 'Admit Patient'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Secondary Column (4 cols): Clinician Workstation Tools & Info */}
          <div className="lg:col-span-4 space-y-4">
            {/* Availability Toggle Bar */}
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    availability === 'AVAILABLE'
                      ? 'bg-emerald-500'
                      : availability === 'BREAK'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-[#242424]">
                  {availability}
                </span>
              </div>

              <div className="flex items-center space-x-1 text-xs">
                <button
                  onClick={() => handleUpdateAvailability('AVAILABLE')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold transition-all min-h-[34px] cursor-pointer ${
                    availability === 'AVAILABLE'
                      ? 'bg-[#F47738] text-white shadow-xs'
                      : 'bg-slate-100 text-[#6B7280] hover:bg-[#FFF0E6]'
                  }`}
                >
                  Ready
                </button>
                <button
                  onClick={() => handleUpdateAvailability('BREAK')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold transition-all min-h-[34px] cursor-pointer ${
                    availability === 'BREAK'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-[#6B7280] hover:bg-[#FFF0E6]'
                  }`}
                >
                  Break
                </button>
                <button
                  onClick={() => handleUpdateAvailability('OFFLINE')}
                  className={`px-2.5 py-1.5 rounded-xl font-bold transition-all min-h-[34px] cursor-pointer ${
                    availability === 'OFFLINE'
                      ? 'bg-slate-700 text-white shadow-xs'
                      : 'bg-slate-100 text-[#6B7280] hover:bg-[#FFF0E6]'
                  }`}
                >
                  Offline
                </button>
              </div>
            </div>

            {/* Professional Registration & Verification Status Card */}
            {doctorProfile && (
              <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-[#242424]">
                    {doctorProfile.verificationStatus === 'APPROVED' ? (
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                    )}
                    <span>Professional Verification</span>
                  </div>
                  <span
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      doctorProfile.verificationStatus === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : doctorProfile.verificationStatus === 'PENDING'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {doctorProfile.verificationStatus}
                  </span>
                </div>

                <div className="text-xs text-[#6B7280] space-y-1">
                  <p>
                    <span className="font-semibold text-[#242424]">Reg No:</span>{' '}
                    <span className="font-mono">{doctorProfile.registrationNumber || 'Not submitted'}</span>
                  </p>
                  {doctorProfile.qualification && (
                    <p>
                      <span className="font-semibold text-[#242424]">Qualification:</span>{' '}
                      {doctorProfile.qualification}
                    </p>
                  )}
                  {doctorProfile.specialties && doctorProfile.specialties.length > 0 && (
                    <p className="flex items-center gap-1 flex-wrap pt-0.5">
                      <span className="font-semibold text-[#242424]">Specialties:</span>{' '}
                      {doctorProfile.specialties.map((s, idx) => (
                        <span
                          key={idx}
                          className="bg-[#FFF0E6] text-[#D95D24] text-[10px] font-bold px-1.5 py-0.5 rounded border border-[#F0E2D8]"
                        >
                          {s}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                {doctorProfile.verificationStatus === 'PENDING' && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 flex items-start gap-1.5 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Your medical council credentials are under review. Consultations will unlock once approved.
                    </span>
                  </div>
                )}

                <div className="pt-1 flex justify-end">
                  <Link
                    to="/doctor/registration-status"
                    className="text-[11px] font-bold text-[#D95D24] hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Credentials Status</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* Hospital Affiliations Panel */}
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#242424]">
                  <Building2 className="w-4 h-4 text-[#F47738]" />
                  <span>Hospital Affiliations</span>
                </div>
                <span className="text-[11px] text-[#6B7280]">
                  {activeAffiliations.length} Approved
                </span>
              </div>

              {activeAffiliations.length > 0 ? (
                <div className="space-y-1.5">
                  {activeAffiliations.map((aff) => (
                    <div
                      key={aff._id}
                      className="flex items-center justify-between p-2 rounded-xl text-xs bg-[#FFF9F5] border border-[#F0E2D8]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="font-bold text-[#242424] truncate">
                          {aff.facilityId?.name || aff.facilityId?.facilityId || 'PHC'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#D95D24] font-semibold bg-[#FFF0E6] px-2 py-0.5 rounded border border-[#F0E2D8] shrink-0">
                        {aff.roleInFacility}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">No Active Facility Affiliations</p>
                    <p className="text-[11px] text-amber-700">
                      {pendingAffiliations.length > 0
                        ? 'Your affiliation request is pending hospital approval.'
                        : 'Request an affiliation to accept consultations.'}
                    </p>
                    <button
                      onClick={() => setShowRequestModal(true)}
                      className="text-xs font-bold text-[#D95D24] underline cursor-pointer"
                    >
                      Request Affiliation Now
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="w-full py-2 bg-[#FFF0E6] hover:bg-[#F0E2D8] text-[#D95D24] text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Request Facility Affiliation</span>
              </button>
            </div>

            {/* Recent Completed Consultations Panel (from /reports) */}
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-[#242424]">
                  <FileText className="w-4 h-4 text-[#F47738]" />
                  <span>Recent Prescriptions</span>
                </div>
                <span className="text-[11px] text-[#6B7280]">
                  {recentReports.length} Total
                </span>
              </div>

              {recentReports.length > 0 ? (
                <div className="space-y-2">
                  {recentReports.slice(0, 3).map((rep) => (
                    <Link
                      key={rep._id}
                      to={`/reports/${rep._id}`}
                      className="block p-2.5 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8] hover:border-[#F47738]/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#242424] truncate">
                          {rep.patientName || 'Patient Consultation'}
                        </span>
                        <span className="text-[10px] text-[#6B7280] shrink-0">
                          {rep.issuedAt ? new Date(rep.issuedAt).toLocaleDateString() : 'Recent'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6B7280] truncate mt-0.5">
                        Rx: {rep.diagnosis || 'Clinical evaluation finalized'}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#6B7280] bg-[#FFF9F5] p-3 rounded-xl border border-[#F0E2D8] text-center">
                  Completed consultation prescriptions will appear here.
                </p>
              )}

              <div className="pt-0.5 flex justify-end">
                <Link
                  to="/reports"
                  className="text-[11px] font-bold text-[#D95D24] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>View All Reports</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Quick Clinical Links */}
            <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 shadow-xs space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                Quick Clinical Tools
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-semibold">
                <Link
                  to="/reports"
                  className="p-2.5 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8] hover:bg-[#FFF0E6] text-[#242424] flex items-center justify-between transition-colors"
                >
                  <span>Reports Archive</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#D95D24]" />
                </Link>
                <Link
                  to="/guidance"
                  className="p-2.5 rounded-xl bg-[#FFF9F5] border border-[#F0E2D8] hover:bg-[#FFF0E6] text-[#242424] flex items-center justify-between transition-colors"
                >
                  <span>First-Aid Guide</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#D95D24]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Request Affiliation Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-[#F0E2D8] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#242424]">
                Request Facility Affiliation
              </h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1 text-[#6B7280] hover:text-[#242424] rounded-lg hover:bg-[#FFF0E6] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestAffiliation} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#242424] block">
                    Healthcare Facility
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseCustomFacility(!useCustomFacility)}
                    className="text-[11px] font-bold text-[#D95D24] hover:underline cursor-pointer"
                  >
                    {useCustomFacility ? 'Select from list' : '+ Enter Facility ID directly'}
                  </button>
                </div>

                {useCustomFacility ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      value={customFacilityId}
                      onChange={(e) => setCustomFacilityId(e.target.value)}
                      placeholder="Paste Facility ID (e.g. 6acf1ad23b4c88bd6bd74b69 or fac-phc-001)"
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#F0E2D8] bg-[#FFF9F5] text-[#242424] focus:ring-2 focus:ring-[#F47738] focus:border-[#F47738]"
                      required
                    />
                    <p className="text-[10px] text-[#6B7280]">
                      Copy the Facility ID from your Hospital Admin dashboard
                    </p>
                  </div>
                ) : (
                  <select
                    value={requestFacilityId}
                    onChange={(e) => setRequestFacilityId(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#F0E2D8] bg-[#FFF9F5] text-[#242424] focus:ring-2 focus:ring-[#F47738] focus:border-[#F47738]"
                  >
                    {availableFacilities.length > 0 ? (
                      availableFacilities.map((fac) => {
                        const id = fac.facilityId || fac._id || fac.id || '';
                        return (
                          <option key={id} value={id}>
                            {fac.name} ({fac.type || 'HOSPITAL'} • {fac.district || (fac as any).districtCode || 'MH'})
                          </option>
                        );
                      })
                    ) : (
                      <>
                        <option value="fac-phc-001">PHC Pabal (fac-phc-001)</option>
                        <option value="fac-chc-001">CHC Shikrapur (fac-chc-001)</option>
                        <option value="fac-dh-001">District Hospital Pune (fac-dh-001)</option>
                      </>
                    )}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#242424] block">
                  Proposed Role
                </label>
                <select
                  value={requestRole}
                  onChange={(e) =>
                    setRequestRole(e.target.value as 'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER')
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-[#F0E2D8] bg-[#FFF9F5] text-[#242424] focus:ring-2 focus:ring-[#F47738] focus:border-[#F47738]"
                >
                  <option value="CONSULTANT">Consultant Doctor</option>
                  <option value="RESIDENT">Resident Medical Officer</option>
                  <option value="MEDICAL_OFFICER">Medical Officer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#242424] block">
                  Notes / Specialization
                </label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g. Telemedicine consultation slots available mornings 9am-1pm"
                  className="w-full min-h-[56px] px-3 py-1.5 rounded-xl border border-[#F0E2D8] bg-[#FFF9F5] text-[#242424] focus:ring-2 focus:ring-[#F47738] focus:border-[#F47738]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3 py-1.5 font-bold text-[#6B7280] hover:bg-[#FFF0E6] rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-3.5 py-1.5 bg-[#F47738] hover:bg-[#D95D24] text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {submittingRequest ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
