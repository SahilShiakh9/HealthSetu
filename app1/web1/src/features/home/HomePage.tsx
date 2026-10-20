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
} from 'lucide-react';
import { Header } from '../../components/Header.js';
import { OfflineBanner } from '../../components/OfflineBanner.js';
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Redirecting to workspace...</span>
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
      color: 'bg-emerald-500 text-white',
      border: 'border-emerald-200 hover:border-emerald-500',
      path: '/screening',
    },
    {
      id: 'facilities',
      title: t('home.action_facilities'),
      subtitle: t('home.action_facilities_sub'),
      icon: MapPin,
      color: 'bg-blue-600 text-white',
      border: 'border-blue-200 hover:border-blue-500',
      path: '/facilities',
    },
    {
      id: 'consult',
      title: t('home.action_consult'),
      subtitle: t('home.action_consult_sub'),
      icon: Video,
      color: 'bg-indigo-600 text-white',
      border: 'border-indigo-200 hover:border-indigo-500',
      path: '/consult/choose',
    },
    {
      id: 'reports',
      title: t('home.action_reports'),
      subtitle: t('home.action_reports_sub'),
      icon: FileText,
      color: 'bg-teal-600 text-white',
      border: 'border-teal-200 hover:border-teal-500',
      path: '/reports',
    },
    {
      id: 'guidance',
      title: 'Guidance & First Aid',
      subtitle: 'ORS, snakebite, burns & immunization protocols',
      icon: BookOpen,
      color: 'bg-indigo-600 text-white',
      border: 'border-indigo-200 hover:border-indigo-500',
      path: '/guidance',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <OfflineBanner />

      <main className="flex-1 max-w-6xl w-full mx-auto p-3.5 sm:p-6 lg:p-8 space-y-5 sm:space-y-6">
        {/* Welcome Hero Card */}
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-800 text-white rounded-3xl p-5 sm:p-7 shadow-sm border border-emerald-600/30 relative overflow-hidden">
          <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-600/60 text-emerald-100 border border-emerald-400/30">
                  HealthSetu Platform
                </span>
                <span className="text-[11px] font-semibold text-emerald-200 hidden sm:inline">
                  • Rural AI Medical Helpline
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">
                {t('home.welcome')}
              </h2>
              <p className="text-xs sm:text-sm text-emerald-100/90 font-medium leading-relaxed max-w-xl">
                {t('home.welcome_sub')}
              </p>
            </div>

            {/* Quick emergency status pill on desktop */}
            <div className="hidden lg:flex flex-col items-end gap-1 shrink-0 bg-emerald-900/40 border border-emerald-500/20 rounded-2xl p-3.5 text-right">
              <span className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">National Rural Support</span>
              <span className="text-sm font-extrabold text-white">Call 108 (Emergency)</span>
              <span className="text-xs text-emerald-200">24/7 AI Triage & Teleconsult</span>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons - 1 col on mobile, 2 cols on tablet, 3 cols on desktop */}
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Healthcare Services
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">Offline-capable</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {actions.map((act) => {
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  onClick={() => navigate(act.path)}
                  className={`w-full min-h-[76px] p-4 bg-white rounded-2xl border-2 ${act.border} shadow-xs hover:shadow-md flex items-center gap-3.5 transition-all active:scale-[0.99] text-left group cursor-pointer`}
                >
                  <div className={`p-3 rounded-xl ${act.color} shrink-0 shadow-xs group-hover:scale-105 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-tight group-hover:text-emerald-700 transition-colors truncate">
                      {act.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{act.subtitle}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all" />
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

      <footer className="text-center py-4 px-4 text-xs text-slate-400 bg-white border-t border-slate-200 mt-auto">
        HealthSetu &bull; Offline-First Rural Health Screening &amp; AI Helpline
      </footer>
    </div>
  );
};
