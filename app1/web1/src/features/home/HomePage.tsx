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

      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Welcome Card */}
        <div className="bg-gradient-to-br from-emerald-700 to-teal-800 text-white rounded-3xl p-5 shadow-sm space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
            HealthSetu Platform
          </span>
          <h2 className="text-xl font-black tracking-tight">{t('home.welcome')}</h2>
          <p className="text-xs text-emerald-100 font-medium leading-relaxed">
            {t('home.welcome_sub')}
          </p>
        </div>

        {/* Primary Action Buttons - 48px+ touch targets */}
        <div className="space-y-3">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => navigate(act.path)}
                className={`w-full min-h-[72px] p-4 bg-white rounded-2xl border-2 ${act.border} shadow-xs flex items-center gap-3.5 transition-all active:scale-[0.99] text-left group`}
              >
                <div className={`p-3 rounded-xl ${act.color} shrink-0 shadow-xs`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-base leading-tight group-hover:text-emerald-700 transition-colors">
                    {act.title}
                  </h3>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{act.subtitle}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            );
          })}
        </div>

        {/* Emergency 108 Call Button */}
        <div className="pt-2">
          <a
            href="tel:108"
            className="w-full min-h-[56px] px-4 py-3 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-2xl font-bold flex items-center justify-between shadow-sm transition-all"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-sm">{t('home.emergency_call')}</span>
            </div>
            <PhoneCall className="w-5 h-5" />
          </a>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-slate-400 bg-white border-t border-slate-200">
        HealthSetu • Offline-First Rural Health Screening
      </footer>
    </div>
  );
};
