import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Stethoscope,
  MapPin,
  Video,
  FileText,
  PhoneCall,
  ChevronRight,
  ShieldAlert,
  BookOpen,
  ArrowRight,
} from 'lucide-react';
import { Header } from '../../components/Header.js';
import { OfflineBanner } from '../../components/OfflineBanner.js';
import { HealthcareImage } from '../../components/HealthcareImage.js';
import { useAuthStore } from '../auth/useAuthStore.js';
import { ROLE_HOME_MAP } from '../../components/RequireAuth.js';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  // If logged in as Doctor, Hospital Admin, Govt Officer, NGO Observer, PHC Officer,
  // redirect immediately to the authorized workspace
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && user.role !== 'PATIENT' && user.role !== 'ASHA') {
      const target = ROLE_HOME_MAP[user.role];
      if (target && target !== '/home') {
        navigate(target, { replace: true });
      }
    }
  }, [isAuthenticated, user, isLoading, navigate]);

  if (isLoading || (isAuthenticated && user && user.role !== 'PATIENT' && user.role !== 'ASHA')) {
    return (
      <div className="min-h-screen bg-[#FFF9F5] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-[#F47738] border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-[#6B7280]">Redirecting to workspace...</span>
        </div>
      </div>
    );
  }

  const actions = [
    {
      id: 'screening',
      title: t('home.action_screening'),
      subtitle: t('home.action_screening_sub'),
      icon: Stethoscope,
      iconBg: 'bg-[#FFF0E6] text-[#F47738]',
      border: 'border-[#F0E2D8] hover:border-[#F47738]',
      path: '/screening',
    },
    {
      id: 'facilities',
      title: t('home.action_facilities'),
      subtitle: t('home.action_facilities_sub'),
      icon: MapPin,
      iconBg: 'bg-blue-50 text-blue-600',
      border: 'border-[#F0E2D8] hover:border-blue-400',
      path: '/facilities',
    },
    {
      id: 'consult',
      title: t('home.action_consult'),
      subtitle: t('home.action_consult_sub'),
      icon: Video,
      iconBg: 'bg-[#FFF0E6] text-[#D95D24]',
      border: 'border-[#F0E2D8] hover:border-[#F47738]',
      path: '/consult/choose',
    },
    {
      id: 'reports',
      title: t('home.action_reports'),
      subtitle: t('home.action_reports_sub'),
      icon: FileText,
      iconBg: 'bg-amber-50 text-amber-700',
      border: 'border-[#F0E2D8] hover:border-amber-400',
      path: '/reports',
    },
    {
      id: 'guidance',
      title: 'Guidance & First Aid',
      subtitle: 'ORS, snakebite, burns & immunization protocols',
      icon: BookOpen,
      iconBg: 'bg-[#FFF0E6] text-[#F47738]',
      border: 'border-[#F0E2D8] hover:border-[#F47738]',
      path: '/guidance',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FFF9F5] flex flex-col font-sans">
      <Header />
      <OfflineBanner />

      <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-6 lg:p-8 space-y-6">
        {/* Welcome Hero Card with Healthcare Visual */}
        <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-xs border border-[#F0E2D8] overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Left Content */}
            <div className="md:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF0E6] text-[#D95D24] border border-[#F0E2D8]">
                  SwasthSetu Platform
                </span>
                <span className="text-[11px] font-semibold text-[#6B7280]">
                  • Rural AI Medical Helpline
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-[#242424] leading-tight">
                {t('home.welcome')}
              </h1>

              <p className="text-xs sm:text-sm text-[#6B7280] font-normal leading-relaxed max-w-xl">
                {t('home.welcome_sub')}
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/screening')}
                  className="min-h-[44px] px-5 py-2.5 bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.98] text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <Stethoscope className="w-4 h-4" />
                  <span>Start AI Symptom Screening</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/guidance')}
                  className="min-h-[44px] px-4 py-2.5 bg-[#FFF0E6] hover:bg-[#F0E2D8] active:scale-[0.98] text-[#D95D24] rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>First Aid Protocols</span>
                </button>
              </div>
            </div>

            {/* Right Healthcare Visual */}
            <div className="md:col-span-5 flex justify-center">
              <HealthcareImage
                src="/images/citizen_hero_healthcare.jpg"
                alt="Welcoming Indian healthcare doctor consulting rural citizens"
                aspectRatio="16/9"
                className="w-full max-w-md rounded-2xl shadow-xs border border-[#F0E2D8]"
                placeholderLabel="Welcoming rural healthcare consultation"
              />
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#6B7280]">
              Healthcare Services
            </h2>
            <span className="text-[11px] text-[#6B7280] font-medium">Offline-capable</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {actions.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  onClick={() => navigate(act.path)}
                  className={`w-full min-h-[76px] p-4 bg-white rounded-2xl border-2 ${act.border} shadow-xs hover:shadow-sm flex items-center gap-3.5 transition-all active:scale-[0.99] text-left group cursor-pointer`}
                >
                  <div className={`p-3 rounded-xl ${act.iconBg} shrink-0 shadow-xs group-hover:scale-105 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[#242424] text-sm sm:text-base leading-tight group-hover:text-[#D95D24] transition-colors truncate">
                      {act.title}
                    </h3>
                    <p className="text-xs text-[#6B7280] line-clamp-1 mt-0.5">{act.subtitle}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#6B7280] shrink-0 group-hover:translate-x-1 group-hover:text-[#F47738] transition-all" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Emergency 108 Call Banner */}
        <div className="pt-1">
          <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="p-2.5 bg-rose-600 text-white rounded-xl shrink-0 shadow-xs">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-rose-900 leading-tight">Emergency Assistance Needed?</h4>
                <p className="text-xs text-rose-700 mt-0.5 leading-snug">
                  For acute chest pain, unconsciousness, severe burns, trauma, or snakebite, call immediately.
                </p>
              </div>
            </div>
            <a
              href="tel:108"
              className="min-h-[46px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all shrink-0 cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              <span>{t('home.emergency_call')}</span>
            </a>
          </div>
        </div>
      </main>

      <footer className="text-center py-4 px-4 text-xs text-[#6B7280] bg-white border-t border-[#F0E2D8] mt-auto">
        SwasthSetu &bull; Offline-First Rural Health Screening &amp; AI Helpline
      </footer>
    </div>
  );
};
