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

export const DoctorDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken, logout } = useAuthStore();

  const [availability, setAvailability] = useState<DoctorAvailability>('AVAILABLE');
  const [queue, setQueue] = useState<QueuedPatientItem[]>([]);
  const [affiliations, setAffiliations] = useState<DoctorAffiliationInfo[]>([]);
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileInfo | null>(null);
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

  useEffect(() => {
    fetchDoctorQueue();
    fetchAffiliations();
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-emerald-600 rounded-xl text-white shadow-xs">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Doctor Portal</h1>
              <p className="text-[11px] text-slate-500">Clinical Tele-Triage & Consultations</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowRequestModal(true)}
              className="px-2.5 py-1.5 rounded-xl text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs font-bold min-h-[36px] cursor-pointer"
              title="Add Facility Affiliation"
            >
              <Plus className="w-4 h-4" />
              <span>Affiliate</span>
            </button>
            <button
              onClick={() => {
                fetchDoctorQueue();
                fetchAffiliations();
              }}
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/staff/login', { replace: true });
              }}
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Doctor Profile, Status, Affiliations & Quick Actions */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4">
            {/* Professional Registration & Verification Status Card */}
            {doctorProfile && (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
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
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : doctorProfile.verificationStatus === 'PENDING'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {doctorProfile.verificationStatus}
                  </span>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Reg No:</span>{' '}
                    <span className="font-mono">{doctorProfile.registrationNumber || 'Not submitted'}</span>
                  </p>
                  {doctorProfile.qualification && (
                    <p>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Qualification:</span>{' '}
                      {doctorProfile.qualification}
                    </p>
                  )}
                </div>

                {doctorProfile.verificationStatus === 'PENDING' && (
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-1.5 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Your medical council credentials are under review by the verification team. Clinical consultations cannot be accepted until approved.
                    </span>
                  </div>
                )}
                {doctorProfile.verificationStatus === 'REJECTED' && (
                  <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-[11px] text-rose-800 dark:text-rose-300 flex items-start gap-1.5 leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      Verification was rejected. Please contact support or hospital administrators with valid registration documents.
                    </span>
                  </div>
                )}

                <div className="pt-1 flex justify-end">
                  <Link
                    to="/doctor/registration-status"
                    className="text-[11px] font-bold text-emerald-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Full Verification Status</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* Hospital Affiliations Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Hospital Affiliations</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {activeAffiliations.length} Approved
                </span>
              </div>

              {activeAffiliations.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {activeAffiliations.map((aff) => (
                    <span
                      key={aff._id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {aff.facilityId?.name || aff.facilityId?.facilityId || 'PHC'}
                      <span className="text-[10px] text-indigo-600/70 font-normal">
                        ({aff.roleInFacility})
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">No Active Facility Affiliations</p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      {pendingAffiliations.length > 0
                        ? 'Your affiliation request is pending hospital admin approval.'
                        : 'Request an affiliation to accept consultations for a hospital or PHC.'}
                    </p>
                    <button
                      onClick={() => setShowRequestModal(true)}
                      className="text-xs font-bold text-indigo-700 dark:text-indigo-400 underline cursor-pointer"
                    >
                      Request Affiliation Now
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Availability Toggle Bar */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    availability === 'AVAILABLE'
                      ? 'bg-emerald-500'
                      : availability === 'BREAK'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {availability}
                </span>
              </div>

              <div className="flex items-center space-x-1.5 text-xs">
                <button
                  onClick={() => handleUpdateAvailability('AVAILABLE')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all min-h-[36px] cursor-pointer ${
                    availability === 'AVAILABLE'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Ready
                </button>
                <button
                  onClick={() => handleUpdateAvailability('BREAK')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all min-h-[36px] cursor-pointer ${
                    availability === 'BREAK'
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Break
                </button>
                <button
                  onClick={() => handleUpdateAvailability('OFFLINE')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all min-h-[36px] cursor-pointer ${
                    availability === 'OFFLINE'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  Offline
                </button>
              </div>
            </div>

            {/* Priority "Accept Next" Action Button */}
            <button
              onClick={() => handleAcceptPatient('next')}
              disabled={
                acceptingId !== null ||
                availability !== 'AVAILABLE' ||
                !isDoctorApproved ||
                (affiliations.length > 0 && !hasActiveAffiliation)
              }
              className="w-full min-h-[56px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-between px-5 transition-all disabled:opacity-50 cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <Play className="w-5 h-5 fill-current" />
                <div className="text-left">
                  <p className="text-sm">Accept Next Patient</p>
                  <p className="text-[10px] text-emerald-100 font-normal">
                    {queue.length > 0
                      ? 'Highest priority in triage queue'
                      : 'Check live pooled specialty queue'}
                  </p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5" />
            </button>

            {errorMessage && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl p-3.5 text-xs text-rose-800 dark:text-rose-200">
                {errorMessage}
              </div>
            )}
          </div>

          {/* Right Column: Waiting Patient Queue */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Queue Stats Banner */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-2 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Waiting Patients ({queue.length})</span>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Auto-prioritized by Clinical Risk Tier</span>
            </div>

            {/* Patient Queue List */}
            <div className="space-y-3">
              {queue.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-2 shadow-xs">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">All Caught Up!</h3>
                  <p className="text-xs text-slate-500">No patients currently waiting in queue for your specialty pool.</p>
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
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs hover:border-emerald-500/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                              {item.patientId?.name || 'Patient'}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${riskBadgeClass}`}
                            >
                              {risk} RISK
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {item.patientId?.phone || 'Mobile not provided'} • Lang:{' '}
                            {item.preferredLanguage.toUpperCase()}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                            Token #{item.positionInQueue}
                          </span>
                          <p className="text-[10px] text-slate-400">
                            ~{item.estimatedWaitMinutes}m wait
                          </p>
                        </div>
                      </div>

                      {/* Primary Symptoms */}
                      {item.screeningId?.primarySymptoms &&
                        item.screeningId.primarySymptoms.length > 0 && (
                          <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                            <p className="text-[10px] text-slate-400 font-semibold mb-1 uppercase tracking-wider">
                              Reported Symptoms
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.screeningId.primarySymptoms.map((sym, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="text-[11px] bg-slate-200 dark:bg-slate-750 px-2.5 py-0.5 rounded-lg text-slate-700 dark:text-slate-300 font-medium"
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
                          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all shadow-sm disabled:opacity-50 min-h-[40px] cursor-pointer"
                        >
                          <span>Admit Patient</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Request Affiliation Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Request Facility Affiliation
              </h3>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRequestAffiliation} className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    Healthcare Facility
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseCustomFacility(!useCustomFacility)}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
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
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      required
                    />
                    <p className="text-[10px] text-slate-500">
                      Copy the Facility ID from your Hospital Admin dashboard
                    </p>
                  </div>
                ) : (
                  <select
                    value={requestFacilityId}
                    onChange={(e) => setRequestFacilityId(e.target.value)}
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Proposed Role
                </label>
                <select
                  value={requestRole}
                  onChange={(e) =>
                    setRequestRole(e.target.value as 'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER')
                  }
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="CONSULTANT">Consultant Doctor</option>
                  <option value="RESIDENT">Resident Medical Officer</option>
                  <option value="MEDICAL_OFFICER">Medical Officer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Notes / Specialization
                </label>
                <textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g. Telemedicine consultation slots available mornings 9am-1pm"
                  className="w-full min-h-[56px] px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-3 py-1.5 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
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
