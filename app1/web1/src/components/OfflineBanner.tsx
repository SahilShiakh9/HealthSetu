import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff, Info } from 'lucide-react';
import { networkMonitor } from '../offline/network.js';

export const OfflineBanner: React.FC = () => {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(networkMonitor.isOnline);

  useEffect(() => {
    return networkMonitor.subscribe(({ isOnline: online }) => {
      setIsOnline(online);
    });
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-amber-500 text-slate-950 px-3 sm:px-6 py-2 sm:py-2.5 text-xs font-semibold flex items-center justify-between shadow-xs border-b border-amber-600/30">
      <div className="flex items-center gap-2 max-w-7xl mx-auto w-full px-1">
        <WifiOff className="w-4 h-4 shrink-0 text-slate-950" />
        <span className="flex-1 leading-snug">{t('app.offline_mode_banner')}</span>
        <a href="/offline" className="underline shrink-0 flex items-center gap-1 font-bold min-h-[36px] px-2 py-1 rounded-lg hover:bg-amber-600/20 active:scale-95 transition-all">
          <Info className="w-3.5 h-3.5" />
          <span>Details</span>
        </a>
      </div>
    </div>
  );
};
