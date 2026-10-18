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

      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center space-y-5">
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <WifiOff className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">{t('offline_page.title')}</h1>
            <p className="text-xs text-slate-600 mt-1">{t('offline_page.desc')}</p>
          </div>

          {/* Operational features */}
          <div className="text-left space-y-2.5 pt-2">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {t('offline_page.can_do')}
            </h2>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_1')}</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_2')}</span>
              </div>
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100 text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{t('offline_page.can_do_3')}</span>
              </div>
            </div>
          </div>

          {/* Non-operational notes */}
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 text-amber-900 text-xs border border-amber-200/70 text-left">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{t('offline_page.cannot_do')}</span>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => navigate('/home')}
              className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t('offline_page.return_home')}</span>
            </button>
            <a
              href="tel:108"
              className="w-full min-h-[48px] bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all text-sm"
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
