import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Users,
  UserCheck,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Activity,
  Phone,
  RefreshCw,
  LogOut,
  Stethoscope,
  Check,
  X,
} from 'lucide-react';
import { Header } from '../../components/Header.js';
import { useAuthStore } from '../auth/useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';
import { DoctorVerificationPanel } from './DoctorVerificationPanel.js';

interface AffiliationItem {
  _id: string;
  doctorUserId: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
  };
  roleInFacility: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVOKED';
  notes?: string;
  createdAt: string;
  doctorProfile?: {
    specialties: string[];
    registrationNumber: string;
    qualification: string;
    experienceYears: number;
    availability: string;
  } | null;
}

export const HospitalAdminDashboardPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'roster' | 'requests' | 'queue' | 'profile' | 'verification'>('roster');
  const [affiliations, setAffiliations] = useState<AffiliationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER'>('CONSULTANT');
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviting, setInviting] = useState(false);

  const facilityId = user?.facilityId || 'fac-phc-001';

  const fetchAffiliations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient<{ affiliations: AffiliationItem[] }>(
        `/affiliations/facility/${facilityId}`,
      );
      setAffiliations(res.affiliations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch facility affiliations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAffiliations();
  }, [facilityId]);

  const handleUpdateStatus = async (
    affiliationId: string,
    status: 'ACTIVE' | 'REJECTED' | 'REVOKED',
    doctorUserId?: string,
  ) => {
    try {
      setError(null);
      await apiClient(`/affiliations/${affiliationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes: `Status updated to ${status} by admin` }),
      });
      if (status === 'ACTIVE' && doctorUserId) {
        await apiClient(`/doctors/${doctorUserId}/verification`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'APPROVED', reviewerNotes: 'Verified by Hospital Administrator' }),
        }).catch(() => {});
      }
      setActionSuccess(`Affiliation successfully marked as ${status}`);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchAffiliations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update affiliation');
    }
  };

  const handleInviteDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    try {
      setInviting(true);
      setError(null);
      await apiClient('/affiliations/invite', {
        method: 'POST',
        body: JSON.stringify({
          facilityId,
          doctorEmail: inviteEmail,
          roleInFacility: inviteRole,
          notes: inviteNotes,
        }),
      });
      setActionSuccess(`Doctor invited successfully!`);
      setTimeout(() => setActionSuccess(null), 4000);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteNotes('');
      fetchAffiliations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite doctor');
    } finally {
      setInviting(false);
    }
  };

  const activeRoster = affiliations.filter((a) => a.status === 'ACTIVE');
  const pendingRequests = affiliations.filter((a) => a.status === 'PENDING');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-md border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                Healthcare Organization Portal
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                VERIFIED FACILITY
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
              <Building2 className="w-7 h-7 text-indigo-400" />
              Rural Community Hospital & PHC
            </h1>
            <p className="text-xs sm:text-sm text-slate-300">
              Facility ID: <span className="font-mono text-indigo-300 font-bold">{facilityId}</span> •
              Administered by {user?.name || 'Hospital Admin'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm flex items-center gap-2 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              Invite Doctor
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate('/staff/login', { replace: true });
              }}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {actionSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2.5 shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2.5 shadow-xs">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Operational KPI Tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold">Active Roster</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">{activeRoster.length}</div>
            <div className="text-[11px] text-emerald-700 font-semibold mt-1">
              {activeRoster.filter((r) => r.doctorProfile?.availability === 'AVAILABLE').length} currently on duty
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold">Pending Approvals</span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">{pendingRequests.length}</div>
            <div className="text-[11px] text-amber-700 font-semibold mt-1">Requires admin review</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold">Emergency Coverage</span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <Phone className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">24 / 7</div>
            <div className="text-[11px] text-slate-500 font-semibold mt-1">Linked to 108 Network</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-bold">Facility Load</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900">Optimal</div>
            <div className="text-[11px] text-slate-500 font-semibold mt-1">Queue latency ~ 5 min</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none flex-nowrap">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 font-bold text-xs rounded-xl transition-all whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Staff & Doctor Roster ({activeRoster.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 font-bold text-xs rounded-xl transition-all relative whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Affiliation Requests
            {pendingRequests.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px]">
                {pendingRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 font-bold text-xs rounded-xl transition-all whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Operational Queues
          </button>
          <button
            onClick={() => setActiveTab('verification')}
            className={`px-4 py-2 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              activeTab === 'verification'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Medical Council Verification</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2 font-bold text-xs rounded-xl transition-all whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Facility Info
          </button>
        </div>

        {/* Tab Content: Roster */}
        {activeTab === 'roster' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">Approved Medical Staff</h2>
                <p className="text-xs text-slate-500">
                  Doctors actively authorized to accept consultations and tele-triages for this facility
                </p>
              </div>
              <button
                onClick={fetchAffiliations}
                disabled={loading}
                className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {activeRoster.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">No active doctors affiliated yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Invite registered doctors using their email or review pending affiliation requests.
                </p>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
                >
                  Invite First Doctor
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeRoster.map((aff) => (
                  <div
                    key={aff._id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shrink-0">
                        <Stethoscope className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm">
                            {aff.doctorUserId?.name || 'Doctor'}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {aff.roleInFacility}
                          </span>
                          {aff.doctorProfile?.availability === 'AVAILABLE' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              On Duty
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              {aff.doctorProfile?.availability || 'OFFLINE'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {aff.doctorProfile?.qualification || 'MBBS'} • Reg:{' '}
                          <span className="font-mono">{aff.doctorProfile?.registrationNumber || 'N/A'}</span> •{' '}
                          {aff.doctorUserId?.email}
                        </p>
                        {aff.doctorProfile?.specialties && (
                          <div className="flex items-center gap-1.5 pt-1">
                            {aff.doctorProfile.specialties.map((s, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-slate-50 text-slate-600 text-[10px] rounded border border-slate-200"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <button
                        onClick={() => handleUpdateStatus(aff._id, 'REVOKED')}
                        className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg border border-rose-200 transition-colors"
                      >
                        Revoke Affiliation
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Affiliation Requests */}
        {activeTab === 'requests' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Pending Affiliation Requests</h2>
              <p className="text-xs text-slate-500">
                Doctors who have requested to practice or accept queue cases at this facility
              </p>
            </div>

            {pendingRequests.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-2xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">All requests are reviewed</p>
                <p className="text-xs text-slate-400 mt-1">No doctor requests are currently waiting.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingRequests.map((req) => (
                  <div
                    key={req._id}
                    className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">
                          {req.doctorUserId?.name || 'Dr. Candidate'}
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          {req.roleInFacility}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {req.doctorUserId?.email} • Applied on{' '}
                        {new Date(req.createdAt).toLocaleDateString()}
                      </p>
                      {req.notes && (
                        <p className="text-xs italic text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          "{req.notes}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:self-center">
                      <button
                        onClick={() => {
                          const docUserId = typeof req.doctorUserId === 'object'
                            ? (req.doctorUserId?._id || (req.doctorUserId as any)?.id)
                            : req.doctorUserId;
                          handleUpdateStatus(req._id, 'ACTIVE', docUserId);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-xs transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(req._id, 'REJECTED')}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold rounded-xl border border-slate-200 hover:border-rose-200 flex items-center gap-1 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Operational Queues */}
        {activeTab === 'queue' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">Facility Operational Queue</h2>
              <p className="text-xs text-slate-500">
                Real-time queue monitoring. Patient privacy is strictly protected: only operational metrics and token sequences are displayed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Current Queue Status
                </span>
                <div className="text-xl font-black text-slate-900">Active & Balanced</div>
                <p className="text-xs text-slate-500">
                  Late-binding atomic matching ensures zero double assignments across doctors.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Priority Distribution
                </span>
                <div className="flex items-center gap-2 pt-1">
                  <span className="px-2 py-1 rounded bg-rose-100 text-rose-800 text-xs font-bold">
                    Emergency: Direct Bypass
                  </span>
                  <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 text-xs font-bold">
                    High: Priority 1
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Starvation Age Policy
                </span>
                <div className="text-sm font-bold text-slate-800">10-Minute Age Bump</div>
                <p className="text-xs text-slate-500">
                  Low priority queue entries age up every 10 minutes to prevent starvation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Facility Profile */}
        {activeTab === 'profile' && (
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-lg font-black text-slate-900">Healthcare Facility Profile</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="font-bold text-slate-500">Official Facility Name</span>
                <div className="font-bold text-slate-900 text-sm">Primary Health Centre (PHC Pabal)</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="font-bold text-slate-500">HFR / ABDM Registration Code</span>
                <div className="font-mono font-bold text-slate-900 text-sm">{facilityId}</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="font-bold text-slate-500">Assigned District</span>
                <div className="font-bold text-slate-900 text-sm">DIST-PUNE-RURAL (Maharashtra)</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <span className="font-bold text-slate-500">Services Provided</span>
                <div className="font-bold text-slate-900 text-sm">
                  OPD, Teleconsultation, Emergency 108, Maternity, Diagnostics
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Medical Council Verification */}
        {activeTab === 'verification' && (
          <DoctorVerificationPanel
            reviewerRole="HOSPITAL_ADMIN"
            hospitalFacilityId={facilityId}
            hospitalFacilityName={facilityId}
          />
        )}
      </main>

      {/* Invite Doctor Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Invite Doctor to Facility</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteDoctor} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Doctor's Registered Email
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="doctor@healthsetu.org"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Role in Facility</label>
                <select
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value as 'CONSULTANT' | 'RESIDENT' | 'MEDICAL_OFFICER')
                  }
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="CONSULTANT">Consultant Doctor</option>
                  <option value="RESIDENT">Resident Medical Officer</option>
                  <option value="MEDICAL_OFFICER">Chief Medical Officer</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 block">Internal Notes (Optional)</label>
                <textarea
                  value={inviteNotes}
                  onChange={(e) => setInviteNotes(e.target.value)}
                  placeholder="e.g. Teleconsultation duty slots on Mondays and Wednesdays"
                  className="w-full min-h-[64px] px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs"
                >
                  <span>{inviting ? 'Inviting...' : 'Send Affiliation Invitation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
