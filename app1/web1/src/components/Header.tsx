import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartPulse, Wifi, WifiOff, RefreshCw, Globe } from 'lucide-react';
import { networkMonitor } from '../offline/network.js';
import { useSyncStore } from '../features/sync/useSyncStore.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import { ROLE_HOME_MAP } from './RequireAuth.js';
import { syncWorker } from '../offline/sync.js';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../i18n/index.js';
import { AccountMenu } from './AccountMenu.js';
import type { Language } from '@healthsetu/contracts';

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isOnline, setIsOnline] = useState(networkMonitor.isOnline);
  const { status: syncStatus, pendingCount } = useSyncStore();
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  useEffect(() => {
    return networkMonitor.subscribe(({ isOnline: online }) => {
      setIsOnline(online);
    });
  }, []);

  const handleLanguageChange = (code: Language) => {
    setAppLanguage(code);
    setLangMenuOpen(false);
  };

  const handleBrandClick = () => {
    if (user && user.role !== 'PATIENT' && user.role !== 'ASHA') {
      navigate(ROLE_HOME_MAP[user.role] || '/home');
    } else {
      navigate('/home');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-3.5 py-2.5 shadow-sm">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
        {/* Brand */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleBrandClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleBrandClick();
          }}
          className="flex items-center gap-2 cursor-pointer select-none group"
          title="Go to Workspace"
        >
          <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl shadow-xs group-hover:scale-105 transition-transform">
            <HeartPulse className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight group-hover:text-emerald-700 transition-colors">
              {t('app.name')}
            </span>
            <span className="text-[11px] text-slate-500 font-medium block truncate max-w-[150px] sm:max-w-xs">
              {t('app.subtitle')}
            </span>
          </div>
        </div>

        {/* Status Indicators & Language */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sync status pill */}
          <button
            onClick={() => syncWorker.syncPending()}
            title={t('app.sync_now')}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border transition-all ${
              syncStatus === 'syncing'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : syncStatus === 'saved_on_phone'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : syncStatus === 'needs_attention'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {syncStatus === 'syncing'
                ? t('app.syncing')
                : syncStatus === 'saved_on_phone'
                  ? `${t('app.saved_on_phone')} (${pendingCount})`
                  : syncStatus === 'needs_attention'
                    ? t('app.needs_attention')
                    : t('app.synced')}
            </span>
            {pendingCount > 0 && <span className="sm:hidden">({pendingCount})</span>}
          </button>

          {/* Online/Offline status */}
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3 text-rose-600" />}
            <span className="hidden sm:inline">{isOnline ? t('app.offline_ready') : 'Offline'}</span>
          </div>

          {/* Language selector (labelled by script) */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              aria-label="Select Language"
            >
              <Globe className="w-3 h-3 text-slate-600" />
              <span>{SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.scriptLabel || 'English'}</span>
            </button>

            {langMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-32 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleLanguageChange(l.code)}
                    className={`w-full text-left px-3 py-1.5 text-xs font-semibold hover:bg-emerald-50 ${
                      i18n.language === l.code ? 'text-emerald-700 bg-emerald-50/60 font-bold' : 'text-slate-700'
                    }`}
                  >
                    {l.scriptLabel}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Account & Logout Menu */}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
};
