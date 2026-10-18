import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ShieldCheck,
  Building2,
  FileBadge,
  AlertCircle,
  RefreshCw,
  LogOut,
  Stethoscope,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Header } from '../../components/Header.js';
import { apiClient } from '../../services/apiClient.js';
import { useAuthStore } from './useAuthStore.js';

interface DoctorStatusData {
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  reviewerNotes?: string;
  doctor: {
    id: string;
    name: string;
    email: string;
    qualification: string;
    registrationNumber: string;
    medicalCouncil?: string;
    specialties: string[];
    availability: string;
    facility?: {
      name: string;
      type: string;
      district: string;
    };
  };
  affiliations: Array<{
    id: string;
    facility: {
      name: string;
      type: string;
      district: string;
    };
    status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED';
    roleInFacility: string;
    notes?: string;
    createdAt: string;
  }>;
}

export const DoctorStatusPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const [data, setData] = useState<DoctorStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await apiClient<DoctorStatusData>('/doctor/status');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch doctor status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/staff/login', { replace: true });
  };

  const isApproved = data?.verificationStatus === 'APPROVED';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-center">
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-xs mb-1 ${
                isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isApproved ? (
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              ) : (
                <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              {isApproved
                ? 'Doctor Credentials Verified'
                : 'Medical Registration Under Review'}
            </h1>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {isApproved
                ? 'Your professional license has been approved. You are authorized to accept patient consultations.'
                : 'Your medical credentials have been securely received and queued for statutory council & hospital review.'}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-slate-500 font-semibold">Checking verification status...</span>
            </div>
          ) : data ? (
            <div className="space-y-4">
              {/* Status Badges Card */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FileBadge className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700">Council Verification</span>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      data.verificationStatus === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : data.verificationStatus === 'REJECTED'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {data.verificationStatus}
                  </span>
                </div>

                {/* Registered Doctor Details */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Doctor Name</span>
                    <span className="font-bold text-slate-800">{data.doctor.name}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Registration No</span>
                    <span className="font-mono font-bold text-slate-800">
                      {data.doctor.registrationNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Qualification</span>
                    <span className="font-semibold text-slate-800">{data.doctor.qualification}</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Specialties</span>
                    <span className="font-semibold text-slate-800 truncate block">
                      {data.doctor.specialties.join(', ')}
                    </span>
                  </div>
                </div>

                {data.reviewerNotes && (
                  <div className="pt-2 border-t border-slate-200/60 text-xs">
                    <span className="text-[11px] font-bold text-slate-500 block">Reviewer Notes:</span>
                    <p className="text-slate-700 mt-0.5">{data.reviewerNotes}</p>
                  </div>
                )}
              </div>

              {/* Hospital Affiliation Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold text-slate-700">Hospital Affiliations</span>
                  </div>
                </div>

                {(data.affiliations || []).length > 0 ? (
                  <div className="space-y-2 pt-1">
                    {(data.affiliations || []).map((aff) => (
                      <div
                        key={aff.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900 block">
                            {aff.facility?.name || 'Healthcare Facility'}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            Role: {aff.roleInFacility} • {aff.facility?.district}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                            aff.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {aff.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 pt-1">
                    No hospital affiliation attached. Registered as Independent Teleconsultant.
                  </p>
                )}
              </div>

              {/* Guidance Info */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/60 flex items-start gap-2.5 text-xs text-emerald-950">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold block">Next Steps:</span>
                  Hospital administrators and state medical reviewers verify registrations within 24–48 hours.
                  Once verified, your profile will automatically appear in patient specialty searches.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                {isApproved ? (
                  <button
                    type="button"
                    onClick={() => navigate('/doctor', { replace: true })}
                    className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <Stethoscope className="w-4 h-4" />
                    <span>Enter Doctor Consultation Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={fetchStatus}
                    disabled={refreshing}
                    className="w-full min-h-[48px] bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 text-sm shadow-xs transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? 'Checking Status...' : 'Refresh Status'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full min-h-[44px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};
