import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WifiOff, CheckCircle2, AlertCircle, ArrowLeft, PhoneCall } from 'lucide-react';
import { Header } from '../../components/Header.js';

export const OfflinePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-center space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800 text-center space-y-5">
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <WifiOff className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{t('offline_page.title')}</h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">{t('offline_page.desc')}</p>
          </div>

          {/* Operational features */}
          <div className="text-left space-y-2.5 pt-2">
            <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {t('offline_page.can_do')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_1')}</span>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_2')}</span>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_3')}</span>
              </div>
            </div>
          </div>

          {/* Non-operational notes */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 text-xs border border-amber-200/70 dark:border-amber-800 text-left">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{t('offline_page.cannot_do')}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => navigate('/home')}
              className="flex-1 min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('offline_page.return_home')}</span>
            </button>
            <a
              href="tel:108"
              className="flex-1 min-h-[48px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm cursor-pointer"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Emergency 108</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
