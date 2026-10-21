import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileBadge,
  Clock,
  Search,
  RefreshCw,
  Building2,
  Stethoscope,
  Phone,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '../../services/apiClient.js';

export interface DoctorRegistryItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  additionalQualification?: string;
  registrationNumber: string;
  medicalCouncil: string;
  registrationYear?: number;
  experienceYears?: number;
  specialties: string[];
  verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  reviewerNotes?: string;
  availability: string;
  facilityName?: string;
  affiliations: Array<{
    id: string;
    facilityId: string;
    facilityName: string;
    facilityType?: string;
    status: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'REVOKED';
    roleInFacility: string;
  }>;
  createdAt: string;
}

interface DoctorVerificationPanelProps {
  reviewerRole: 'HOSPITAL_ADMIN' | 'GOVT_OFFICER' | 'ADMIN';
  hospitalFacilityId?: string;
  hospitalFacilityName?: string;
}

export const DoctorVerificationPanel: React.FC<DoctorVerificationPanelProps> = ({
  reviewerRole,
  hospitalFacilityName,
}) => {
  const [doctors, setDoctors] = useState<DoctorRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notesDrafts, setNotesDrafts] = useState<Record<string, string>>({});

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<{ doctors: DoctorRegistryItem[] }>('/doctors/registry/all');
      if (res && res.doctors) {
        setDoctors(res.doctors);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load doctors registry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleVerifyDoctor = async (
    doctor: DoctorRegistryItem,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    try {
      setActionLoadingId(doctor.id);
      setError(null);

      const defaultNote =
        reviewerRole === 'GOVT_OFFICER'
          ? `Verified by State IDSP Health Officer on ${new Date().toLocaleDateString()}`
          : reviewerRole === 'HOSPITAL_ADMIN'
          ? `Verified by Hospital Medical Superintendent (${hospitalFacilityName || 'Hospital Admin'})`
          : `Verified by District Health Admin on ${new Date().toLocaleDateString()}`;

      const reviewerNotes = notesDrafts[doctor.id]?.trim() || defaultNote;

      await apiClient(`/doctors/${doctor.id}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reviewerNotes,
        }),
      });

      setActionSuccess(
        status === 'APPROVED'
          ? `Dr. ${doctor.name}'s medical credentials approved! The doctor can now accept patient teleconsultations.`
          : `Dr. ${doctor.name}'s verification status marked as REJECTED.`,
      );
      setTimeout(() => setActionSuccess(null), 5000);
      fetchDoctors();
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to update doctor verification status');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter doctors
  const filteredDoctors = doctors.filter((doc) => {
    if (filterStatus !== 'ALL' && doc.verificationStatus !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = doc.name.toLowerCase().includes(q);
      const matchReg = doc.registrationNumber.toLowerCase().includes(q);
      const matchCouncil = doc.medicalCouncil.toLowerCase().includes(q);
      const matchSpec = doc.specialties.some((s) => s.toLowerCase().includes(q));
      if (!matchName && !matchReg && !matchCouncil && !matchSpec) return false;
    }
    return true;
  });

  const pendingCount = doctors.filter((d) => d.verificationStatus === 'PENDING').length;
  const approvedCount = doctors.filter((d) => d.verificationStatus === 'APPROVED').length;

  return (
    <div className="space-y-6">
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-3xl p-6 border border-[#F0E2D8] shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#FFF0E6] text-[#F47738] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-[#242424]">
                  Medical Council Credential Verification
                </h2>
                <p className="text-xs text-[#6B7280]">
                  {reviewerRole === 'GOVT_OFFICER'
                    ? 'State IDSP / Government Medical Reviewer Licensing Desk'
                    : reviewerRole === 'HOSPITAL_ADMIN'
                    ? `Hospital Medical Review Desk • ${hospitalFacilityName || 'Hospital Admin'}`
                    : 'Statutory Medical Council Credential Verification'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDoctors}
              disabled={loading}
              className="p-2.5 text-[#6B7280] hover:text-[#242424] hover:bg-[#FFF0E6] rounded-xl transition-all border border-[#F0E2D8] flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title="Refresh Registry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-[#F0E2D8]">
          <button
            onClick={() => setFilterStatus('PENDING')}
            className={`p-3 rounded-2xl text-left transition-all border cursor-pointer ${
              filterStatus === 'PENDING'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-[#FFF9F5] border-[#F0E2D8] text-[#6B7280] hover:bg-[#FFF0E6]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Pending Review</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black mt-1 text-amber-700">{pendingCount}</div>
          </button>

          <button
            onClick={() => setFilterStatus('APPROVED')}
            className={`p-3 rounded-2xl text-left transition-all border cursor-pointer ${
              filterStatus === 'APPROVED'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-[#FFF9F5] border-[#F0E2D8] text-[#6B7280] hover:bg-[#FFF0E6]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Approved Licenses</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black mt-1 text-emerald-700">{approvedCount}</div>
          </button>

          <button
            onClick={() => setFilterStatus('REJECTED')}
            className={`p-3 rounded-2xl text-left transition-all border cursor-pointer ${
              filterStatus === 'REJECTED'
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-[#FFF9F5] border-[#F0E2D8] text-[#6B7280] hover:bg-[#FFF0E6]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Rejected</span>
              <XCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-2xl font-black mt-1 text-rose-700">
              {doctors.filter((d) => d.verificationStatus === 'REJECTED').length}
            </div>
          </button>

          <button
            onClick={() => setFilterStatus('ALL')}
            className={`p-3 rounded-2xl text-left transition-all border cursor-pointer ${
              filterStatus === 'ALL'
                ? 'bg-[#FFF0E6] border-[#F47738] text-[#242424]'
                : 'bg-[#FFF9F5] border-[#F0E2D8] text-[#6B7280] hover:bg-[#FFF0E6]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">Total Registered</span>
              <FileBadge className="w-4 h-4 text-[#F47738]" />
            </div>
            <div className="text-2xl font-black mt-1 text-[#242424]">{doctors.length}</div>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-bold flex items-center gap-2 animate-in fade-in shadow-xs">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm font-bold flex items-center gap-2 animate-in fade-in shadow-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#6B7280] absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Doctor Name, Reg No (e.g. MCI-464651), Council, Specialty..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-[#F0E2D8] bg-white text-[#242424] text-xs focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2.5 rounded-2xl border border-[#F0E2D8] bg-white text-[#242424] text-xs font-bold focus:outline-none focus:border-[#F47738] focus:ring-2 focus:ring-[#F47738]/20"
          >
            <option value="PENDING">Pending Review ({pendingCount})</option>
            <option value="APPROVED">Approved ({approvedCount})</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All Doctors ({doctors.length})</option>
          </select>
        </div>
      </div>

      {/* Doctors List */}
      {loading ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Loading statutory doctor records...</p>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-60" />
          <p className="text-sm font-bold text-slate-800 dark:text-white">
            {filterStatus === 'PENDING' ? 'No Doctors Pending Verification' : 'No Doctors Match Filter'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {filterStatus === 'PENDING'
              ? 'All registered doctors have been reviewed and verified.'
              : 'Try clearing your search query or selecting a different status filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDoctors.map((doc) => {
            const isApproved = doc.verificationStatus === 'APPROVED';
            const isPending = doc.verificationStatus === 'PENDING';
            const isActionLoading = actionLoadingId === doc.id;

            return (
              <div
                key={doc.id}
                className={`p-6 rounded-3xl border transition-all ${
                  isPending
                    ? 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/50 shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Doctor Info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
                        <Stethoscope className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-900 dark:text-white text-base">
                            {doc.name}
                          </h3>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              isApproved
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : isPending
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            }`}
                          >
                            {isApproved ? 'VERIFIED • APPROVED' : isPending ? 'REVIEW PENDING' : doc.verificationStatus}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {doc.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {doc.email}
                            </span>
                          )}
                          {doc.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {doc.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Statutory Verification Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Medical Registration No
                        </span>
                        <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                          {doc.registrationNumber}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          State Medical Council
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {doc.medicalCouncil}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Qualifications & Experience
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {doc.qualification}
                          {doc.additionalQualification && ` (${doc.additionalQualification})`} • {doc.experienceYears || 1}y exp
                        </span>
                      </div>

                      <div className="sm:col-span-2 md:col-span-3">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Specialties & Capabilities
                        </span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {doc.specialties.map((s) => (
                            <span
                              key={s}
                              className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-bold"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>

                      {doc.affiliations.length > 0 && (
                        <div className="sm:col-span-2 md:col-span-3 border-t border-slate-200/60 dark:border-slate-700/60 pt-2.5">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                            Hospital Affiliations
                          </span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {doc.affiliations.map((aff) => (
                              <span
                                key={aff.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold"
                              >
                                <Building2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                                <span>{aff.facilityName}</span>
                                <span className="opacity-60 font-normal">({aff.roleInFacility} • {aff.status})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {doc.reviewerNotes && (
                        <div className="sm:col-span-2 md:col-span-3 text-[11px] text-slate-600 dark:text-slate-400 italic">
                          <span className="font-bold not-italic">Reviewer Note: </span>
                          "{doc.reviewerNotes}"
                        </div>
                      )}
                    </div>

                    {/* Reviewer Note Input */}
                    {isPending && (
                      <div className="pt-1">
                        <input
                          type="text"
                          value={notesDrafts[doc.id] || ''}
                          onChange={(e) =>
                            setNotesDrafts({ ...notesDrafts, [doc.id]: e.target.value })
                          }
                          placeholder="Optional reviewer notes / verification council docket number..."
                          className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                    )}
                  </div>

                  {/* Action Controls */}
                  <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0 lg:w-48 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleVerifyDoctor(doc, 'APPROVED')}
                          disabled={isActionLoading}
                          className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>{isActionLoading ? 'Approving...' : 'Approve License'}</span>
                        </button>

                        <button
                          onClick={() => handleVerifyDoctor(doc, 'REJECTED')}
                          disabled={isActionLoading}
                          className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 font-bold rounded-xl text-xs border border-slate-200 dark:border-slate-700 hover:border-rose-200 transition-all cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    ) : isApproved ? (
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-center">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                          <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                            License Active
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                            Can admit patients
                          </span>
                        </div>

                        <button
                          onClick={() => handleVerifyDoctor(doc, 'REJECTED')}
                          disabled={isActionLoading}
                          className="w-full px-2 py-1.5 text-slate-500 hover:text-rose-600 text-[11px] font-bold rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all text-center cursor-pointer"
                        >
                          Revoke License
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleVerifyDoctor(doc, 'APPROVED')}
                        disabled={isActionLoading}
                        className="w-full px-3 py-2 bg-emerald-600 text-white font-bold rounded-xl text-xs hover:bg-emerald-700 transition-all cursor-pointer"
                      >
                        Re-Approve License
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
