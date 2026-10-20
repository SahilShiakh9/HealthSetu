import React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  PhoneCall,
  AlertOctagon,
  MapPin,
  ArrowRight,
  Home,
  ShieldAlert,
} from 'lucide-react';
import emergencyRulesData from '../../rules/emergencyRules.json';
import type { Language } from '@healthsetu/contracts';

export const EmergencyPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentLang = (i18n.language || 'en') as Language;

  const rawFlags = searchParams.get('flags') || '';
  const flagIds = rawFlags.split(',').filter(Boolean);

  // Match flags with emergency rules to extract messages
  const matchedRules = emergencyRulesData.rules.filter((r) => flagIds.includes(r.id));

  return (
    <div className="min-h-screen bg-rose-50 dark:bg-rose-950/40 text-slate-900 dark:text-slate-100 pb-16 flex flex-col justify-between">
      {/* Top Banner */}
      <header className="bg-rose-600 text-white px-4 py-4 shadow-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-full animate-pulse shrink-0">
            <AlertOctagon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">
              {t('emergency.title', 'EMERGENCY: Immediate Medical Care Needed')}
            </h1>
            <p className="text-xs text-rose-100">
              {t('emergency.subtitle', 'Critical symptoms detected. Do not delay.')}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content: Responsive 2-Column on Tablet/Desktop */}
      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {/* Left Column: Direct Call 108 & Triggered Red Flags */}
          <div className="space-y-5">
            {/* Big 108 Call Action Button */}
            <div className="bg-white dark:bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 shadow-xl text-center space-y-4">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest">
                {t('emergency.freeCall', 'Toll-Free Emergency Ambulance')}
              </p>

              <a
                href="tel:108"
                className="w-full min-h-[64px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white text-xl font-black rounded-2xl shadow-lg shadow-rose-600/40 flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                <PhoneCall className="w-7 h-7 animate-bounce" />
                <span>{t('emergency.call108', 'CALL 108 NOW')}</span>
              </a>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t(
                  'emergency.callNotice',
                  'Available 24x7 across all rural districts for immediate ambulance dispatch.',
                )}
              </p>
            </div>

            {/* Triggered Red Flags */}
            <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{t('emergency.detectedFlags', 'Critical Warning Signs:')}</span>
              </h2>
              <div className="space-y-2">
                {matchedRules.length > 0 ? (
                  matchedRules.map((rule) => {
                    const msg = rule.message[currentLang] || rule.message.en;
                    return (
                      <div
                        key={rule.id}
                        className="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40 rounded-xl text-xs font-semibold text-rose-900 dark:text-rose-200 leading-relaxed"
                      >
                        {msg}
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 rounded-xl text-xs text-rose-900 dark:text-rose-200">
                    {t(
                      'emergency.genericWarning',
                      'Severe symptoms indicating possible acute cardiac, respiratory, or neurological crisis.',
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: First Aid Instructions & Secondary Routing Actions */}
          <div className="space-y-5">
            {/* First Aid Instructions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t('emergency.actionsTitle', 'While Help is on the Way:')}
              </h2>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2.5 list-disc list-inside leading-relaxed">
                <li>{t('emergency.action1', 'Keep the patient sitting upright or in a comfortable resting position.')}</li>
                <li>{t('emergency.action2', 'Do NOT give solid food or liquids if drowsiness or difficulty swallowing is present.')}</li>
                <li>{t('emergency.action3', 'Loosen tight clothing around the neck and chest for easy breathing.')}</li>
                <li>{t('emergency.action4', 'If unconscious and breathing, turn patient onto their side in recovery position.')}</li>
              </ul>
            </div>

            {/* Secondary Routing Actions */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={() => navigate('/facilities')}
                className="w-full min-h-[52px] bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span>{t('emergency.findHospitals', 'Locate Nearest Hospital / CHC')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/home')}
                className="w-full min-h-[48px] bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-medium text-xs rounded-2xl flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>{t('emergency.returnHome', 'Return to Home')}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
