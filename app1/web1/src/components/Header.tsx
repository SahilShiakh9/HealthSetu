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
    <header className="bg-white/95 backdrop-blur-md border-b border-[#F0E2D8] sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 shadow-xs">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleBrandClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleBrandClick();
          }}
          className="flex items-center gap-2 sm:gap-2.5 cursor-pointer select-none group min-w-0"
          title="Go to Workspace"
        >
          <div className="p-2 sm:p-2.5 bg-[#FFF0E6] text-[#F47738] rounded-xl shadow-xs group-hover:scale-105 group-active:scale-95 transition-transform shrink-0">
            <HeartPulse className="w-5 h-5 text-[#F47738]" />
          </div>
          <div className="min-w-0">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#242424] block leading-tight group-hover:text-[#D95D24] transition-colors truncate">
              {t('app.name')}
            </span>
            <span className="text-[10px] sm:text-[11px] text-[#6B7280] font-medium block truncate max-w-[120px] xs:max-w-[160px] sm:max-w-xs md:max-w-md">
              {t('app.subtitle')}
            </span>
          </div>
        </div>

        {/* Status Indicators & Language */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Sync status pill */}
          <button
            onClick={() => syncWorker.syncPending()}
            title={t('app.sync_now')}
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full border transition-all min-h-[34px] active:scale-95 cursor-pointer ${
              syncStatus === 'syncing'
                ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-blue-100'
                : syncStatus === 'saved_on_phone'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 ring-2 ring-amber-100'
                  : syncStatus === 'needs_attention'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-[#FFF9F5] text-[#6B7280] border-[#F0E2D8] hover:bg-[#FFF0E6]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">
              {syncStatus === 'syncing'
                ? t('app.syncing')
                : syncStatus === 'saved_on_phone'
                  ? `${t('app.saved_on_phone')} (${pendingCount})`
                  : syncStatus === 'needs_attention'
                    ? t('app.needs_attention')
                    : t('app.synced')}
            </span>
            {pendingCount > 0 && <span className="md:hidden font-bold">({pendingCount})</span>}
          </button>

          {/* Online/Offline status */}
          <div
            className={`flex items-center gap-1 text-[11px] font-semibold px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full border min-h-[34px] ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
            <span className="hidden sm:inline">{isOnline ? t('app.offline_ready') : 'Offline'}</span>
          </div>

          {/* Language selector (labelled by script) */}
          <div className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 sm:py-1.5 rounded-full bg-[#FFF9F5] text-[#242424] hover:bg-[#FFF0E6] border border-[#F0E2D8] transition-colors min-h-[34px] active:scale-95 cursor-pointer"
              aria-label="Select Language"
            >
              <Globe className="w-3.5 h-3.5 text-[#F47738] shrink-0" />
              <span className="max-w-[70px] truncate">{SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.scriptLabel || 'English'}</span>
            </button>

            {langMenuOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white rounded-2xl shadow-xl border border-[#F0E2D8] py-1.5 z-50 animate-in fade-in zoom-in-95">
                {SUPPORTED_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => handleLanguageChange(l.code)}
                    className={`w-full text-left px-3.5 py-2 text-xs font-semibold hover:bg-[#FFF0E6] transition-colors cursor-pointer flex items-center justify-between ${
                      i18n.language === l.code ? 'text-[#D95D24] bg-[#FFF0E6] font-bold' : 'text-[#242424]'
                    }`}
                  >
                    <span>{l.scriptLabel}</span>
                    <span className="text-[10px] text-[#6B7280] uppercase font-normal">{l.code}</span>
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
