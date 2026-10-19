import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Clock,
  Video,
  Languages,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar,
  MessageSquare,
  MapPin,
  AlertTriangle,
  Building2,
  UserCheck,
} from 'lucide-react';
import { MEDICAL_SPECIALTIES, type RankedDoctorPreview } from '@healthsetu/contracts';
import { useAuthStore } from '../auth/useAuthStore.js';
import { DoctorProfileModal } from './DoctorProfileModal.js';
import { apiClient } from '../../services/apiClient.js';

export const ChooseConsultPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken, user } = useAuthStore();

  const screeningId = searchParams.get('screeningId') || undefined;
  const preferredLang = (i18n.language || 'hi') as 'en' | 'hi' | 'mr';

  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('All');
  const [doctors, setDoctors] = useState<RankedDoctorPreview[]>([]);
  const [recommendedAction, setRecommendedAction] = useState<'CONSULT_NOW' | 'BOOK_LATER'>('CONSULT_NOW');
  const [maxWaitLimitMinutes, setMaxWaitLimitMinutes] = useState<number>(30);
  const [loading, setLoading] = useState<boolean>(true);
  const [joining, setJoining] = useState<boolean>(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | undefined>(undefined);
  const [expandedDoctorId, setExpandedDoctorId] = useState<string | undefined>(undefined);
  const [modalDoctor, setModalDoctor] = useState<RankedDoctorPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadPreview = async (initial = false) => {
      if (initial) setLoading(true);
      try {
        const data = await apiClient<{
          doctors?: RankedDoctorPreview[];
          rankedDoctors?: RankedDoctorPreview[];
          recommendedAction?: 'CONSULT_NOW' | 'BOOK_LATER';
          maxWaitLimitMinutes?: number;
        }>('/consultations/preview', {
          method: 'POST',
          body: JSON.stringify({
            screeningId: screeningId || '000000000000000000000001',
            preferredLanguage: preferredLang,
            requiredSpecialty: selectedSpecialty === 'All' ? 'General Physician' : selectedSpecialty,
          }),
        });
        if (!mounted) return;
        let fetchedDocs: RankedDoctorPreview[] = data.doctors || data.rankedDoctors || [];
        // Strictly only show verified, approved medical doctors to patients
        fetchedDocs = fetchedDocs.filter(
          (d) => !(d as any).verificationStatus || (d as any).verificationStatus === 'APPROVED',
        );
        if (selectedSpecialty !== 'All') {
          fetchedDocs = fetchedDocs.filter((d) =>
            (d.specialties || []).some((s) => s.toLowerCase() === selectedSpecialty.toLowerCase()),
          );
        }
        setDoctors(fetchedDocs);
        if (data.recommendedAction) setRecommendedAction(data.recommendedAction);
        if (data.maxWaitLimitMinutes) setMaxWaitLimitMinutes(data.maxWaitLimitMinutes);
      } catch (err) {
        console.warn('Failed to fetch doctor matching preview:', err);
        if (initial && mounted) setDoctors([]);
      } finally {
        if (initial && mounted) setLoading(false);
      }
    };

    void loadPreview(true);
    const refreshInterval = window.setInterval(() => {
      void loadPreview();
    }, 10000);
    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
    };
  }, [screeningId, preferredLang, accessToken, selectedSpecialty]);

  const handleJoinQueue = async (type: 'NOW' | 'SCHEDULED' = 'NOW') => {
    // Require patient login to link medical consultations to an account
    if (!user) {
      navigate('/login');
      return;
    }

    setJoining(true);
    setErrorMessage(null);
    const idempotencyKey = crypto.randomUUID();

    try {
      const data: any = await apiClient('/consultations/request', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey,
          screeningId: screeningId || '000000000000000000000001',
          doctorId: selectedDoctorId,
          type,
          preferredLanguage: preferredLang,
          requiredSpecialty: selectedSpecialty === 'All' ? 'General Physician' : selectedSpecialty,
        }),
      });

      const consultId = data.consultation?._id || data.consultation?.id || data.id;
      navigate(`/consult/waiting/${consultId}`);
    } catch (err: any) {
      if (err?.code === 'EMERGENCY_QUEUE_BYPASS' || err?.details?.emergencyFlags) {
        setErrorMessage(
          'Emergency red-flag detected. Teleconsultation queue cannot be used for critical emergencies. Please dial 108 or go to the nearest emergency facility immediately.',
        );
      } else {
        setErrorMessage(err?.message || 'Unable to join consultation queue. Please try again or seek local clinic care.');
      }
    } finally {
      setJoining(false);
    }
  };

  const isSurge = recommendedAction === 'BOOK_LATER';
  const selectedDoctorObj = doctors.find((d) => d.doctorId === selectedDoctorId);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/home')}
            className="p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-slate-900 dark:text-white">
            {t('consult.chooseTitle', 'Doctor Consultation')}
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Banner */}
        <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 text-white rounded-3xl p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-white/20 rounded-xl">
              <Video className="w-5 h-5 text-white" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
              {t('consult.telemedicineBadge', 'Govt Verified Telemedicine')}
            </span>
          </div>
          <h2 className="text-lg font-bold">
            {t('consult.bannerTitle', 'Connect with a Medical Officer')}
          </h2>
          <p className="text-xs text-indigo-100 leading-relaxed">
            {t(
              'consult.bannerDesc',
              'Free video or audio consult with registered doctors. Low bandwidth adaptive calling.',
            )}
          </p>
        </div>

        {/* Specialty Category Filter */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Select Medical Specialty
            </h3>
            {selectedSpecialty !== 'All' && (
              <button
                type="button"
                onClick={() => setSelectedSpecialty('All')}
                className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer"
              >
                Reset to All
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedSpecialty('All')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedSpecialty === 'All'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
              }`}
            >
              All Specialties
            </button>
            {MEDICAL_SPECIALTIES.map((spec) => {
              const isSelected = selectedSpecialty === spec.id;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => setSelectedSpecialty(spec.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {spec.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Surge Protection Warning Banner */}
        {isSurge && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 space-y-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2.5">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm">High Queue Volume (Surge)</p>
                <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                  Live wait times exceed {maxWaitLimitMinutes} minutes. To protect your time, we offer these alternatives:
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleJoinQueue('SCHEDULED')}
                className="p-2.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col items-center text-center gap-1 hover:bg-amber-100/50 transition-colors"
              >
                <Calendar className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-[11px]">Book Later</span>
              </button>
              <button
                type="button"
                onClick={() => handleJoinQueue('NOW')}
                className="p-2.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col items-center text-center gap-1 hover:bg-amber-100/50 transition-colors"
              >
                <MessageSquare className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-[11px]">Async Chat</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/facilities')}
                className="p-2.5 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-xl flex flex-col items-center text-center gap-1 hover:bg-amber-100/50 transition-colors"
              >
                <MapPin className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-[11px]">Nearby PHC</span>
              </button>
            </div>
          </div>
        )}

        {/* Join Queue Primary Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 mb-1">
                {selectedDoctorObj ? 'Direct Doctor Queue' : t('consult.liveQueue', 'Live Pooled Queue')}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {selectedDoctorObj
                  ? `Consult with ${selectedDoctorObj.name}`
                  : t('consult.consultNow', 'Consult Now (Next Available Doctor)')}
              </h3>
            </div>
            <div className="flex items-center gap-1 text-slate-500 text-xs shrink-0">
              <Clock className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold">
                {selectedDoctorObj
                  ? `~${selectedDoctorObj.estimatedWaitMinutes} min`
                  : doctors.length > 0
                  ? `~${doctors[0].estimatedWaitMinutes} min (estimate)`
                  : 'Live queue'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            {selectedDoctorObj
              ? `You will join the waiting queue for ${selectedDoctorObj.name}. If the doctor becomes busy, you can switch to the pooled queue.`
              : t(
                  'consult.queueExplanation',
                  'You will enter the live specialty queue. Our system prioritizes patients by clinical urgency with late binding.',
                )}
          </p>

          <button
            type="button"
            disabled={joining}
            onClick={() => handleJoinQueue('NOW')}
            className="w-full min-h-[54px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-semibold text-base rounded-2xl shadow-md shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            {joining ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <>
                <span>
                  {selectedDoctorObj
                    ? `Join ${selectedDoctorObj.name}'s Queue`
                    : t('consult.joinQueueBtn', 'Join Waiting Queue Now')}
                </span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>

        {/* Matched Doctors List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {t('consult.matchedDoctors', 'Matched Medical Officers')}
            </h3>
            <span className="text-xs text-slate-400 font-normal">
              {doctors.length} {t('consult.online', 'available')}
            </span>
          </div>

          {/* Statutory disclaimer */}
          <div className="flex items-start gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-900 text-[10px] text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              All listed doctors are registered practitioners. Match score is a ranking aid based on specialty, availability, and language.
            </span>
          </div>

          {loading ? (
            <div className="py-8 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
            </div>
          ) : doctors.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No Medical Officers currently online in {selectedSpecialty === 'All' ? 'this queue' : selectedSpecialty}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You can join the general pooled queue to be notified as soon as a doctor logs in, or visit your nearest primary health centre.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setSelectedSpecialty('All')}
                  className="px-4 py-2 bg-emerald-600 text-xs font-semibold rounded-xl text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  View All Specialties
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/facilities')}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-xs font-semibold rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Find Nearest Facility
                </button>
              </div>
            </div>
          ) : (
            doctors.map((doc) => {
              const isSelected = selectedDoctorId === doc.doctorId;
              const isExpanded = expandedDoctorId === doc.doctorId;

              return (
                <div
                  key={doc.doctorId}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-xs space-y-3 transition-all ${
                    isSelected
                      ? 'border-emerald-600 ring-2 ring-emerald-600/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-base shrink-0">
                        {doc.name.replace('Dr. ', '').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                            {doc.name}
                          </h4>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              doc.availability === 'AVAILABLE' ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                          />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {doc.qualification || 'MBBS'} • {doc.experienceYears}y exp • {doc.specialties.join(', ')}
                        </p>
                        {doc.facilityName && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" />
                            <span className="truncate">{doc.facilityName}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                        {doc.availability}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        ~{doc.estimatedWaitMinutes}m (estimate)
                      </p>
                    </div>
                  </div>

                  {/* Actions Strip: View Profile & Select Doctor */}
                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setModalDoctor(doc)}
                      className="font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>View Full Profile</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDoctorId(isSelected ? undefined : doc.doctorId)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : 'Select Doctor'}
                    </button>
                  </div>

                  {/* Match Score Breakdown Toggle */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-2">
                    <span className="flex items-center gap-1">
                      <Languages className="w-3.5 h-3.5 text-slate-400" />
                      {doc.languages.join(', ').toUpperCase()}
                    </span>

                    <button
                      type="button"
                      onClick={() => setExpandedDoctorId(isExpanded ? undefined : doc.doctorId)}
                      className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <span>Match score: {doc.score}%</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Expanded Pure Score Breakdown on Tap */}
                  {isExpanded && doc.breakdown && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl space-y-1.5 text-[11px]">
                      <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Match Score Breakdown (0–100%)
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Specialty Match (30%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.specialty}%</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Availability (25%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.availability}%</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Queue Length (20%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.queue}%</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Language Match (15%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.language}%</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Previous Doctor (5%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.previousDoctor}%</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Location Proximity (5%)</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{doc.breakdown.location}%</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Emergency Disclaimer */}
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/50 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-800 dark:text-rose-300">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p>
            {t(
              'consult.emergencyDisclaimer',
              'Teleconsultation is for non-critical conditions. For severe chest pain or unconsciousness, dial 108 immediately.',
            )}
          </p>
        </div>
      </main>

      {/* Doctor Profile Modal */}
      <DoctorProfileModal
        doctor={modalDoctor}
        onClose={() => setModalDoctor(null)}
        onSelectDoctor={(docId) => setSelectedDoctorId(docId)}
      />
    </div>
  );
};
