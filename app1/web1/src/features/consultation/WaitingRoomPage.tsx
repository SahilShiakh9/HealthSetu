import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Users,
  Video,
  PhoneCall,
  Wifi,
  WifiOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Headphones,
  CheckCircle2,
} from 'lucide-react';
import { db } from '../../offline/db.js';
import { useAuthStore } from '../auth/useAuthStore.js';
import { apiClient } from '../../services/apiClient.js';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '@healthsetu/contracts';
import { getBackendSocketUrl } from '../../services/socketHelper.js';

export const WaitingRoomPage: React.FC = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { accessToken } = useAuthStore();

  const [position, setPosition] = useState<number>(1);
  const [estWait, setEstWait] = useState<number>(5);
  const [status, setStatus] = useState<string>('QUEUED');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [loading, setLoading] = useState<boolean>(true);
  const [audioOnlyPreference, setAudioOnlyPreference] = useState<boolean>(false);

  const isAdmitted = status === 'IN_PROGRESS' || status === 'CALLED' || status === 'ACTIVE';

  // Sync and poll queue status
  useEffect(() => {
    let isMounted = true;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial load from Dexie cache if present
    if (consultationId) {
      db.queueSnapshot.get(consultationId).then((cached) => {
        if (cached && isMounted) {
          setPosition(cached.positionInQueue);
          setEstWait(cached.estimatedWaitMinutes);
          setStatus(cached.status);
          setLoading(false);
        }
      });
    }

    const fetchQueueStatus = async () => {
      if (!consultationId) return;

      try {
        const data = await apiClient<{
          positionInQueue: number;
          estimatedWaitMinutes: number;
          status: string;
        }>(`/consultations/queue/${consultationId}`);

        if (isMounted) {
          setPosition(data.positionInQueue);
          setEstWait(data.estimatedWaitMinutes);
          setStatus(data.status);
          setLoading(false);

          // Save to Dexie snapshot
          await db.queueSnapshot.put({
            consultationId,
            doctorId: '',
            positionInQueue: data.positionInQueue,
            estimatedWaitMinutes: data.estimatedWaitMinutes,
            status: data.status,
            fetchedAt: Date.now(),
          });

          // If doctor has accepted (CALLED or IN_PROGRESS or ACTIVE), navigate automatically
          if (data.status === 'IN_PROGRESS' || data.status === 'CALLED' || data.status === 'ACTIVE') {
            setStatus('IN_PROGRESS');
            navigate(`/consult/room/${consultationId}`);
          }
        }
      } catch (err) {
        console.warn('Network issue fetching queue status:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchQueueStatus();
    const interval = setInterval(fetchQueueStatus, 2000);

    // Real-time socket listener for instant admission push
    let socket: any = null;
    try {
      const socketUrl = getBackendSocketUrl();
      if (socketUrl) {
        socket = io(socketUrl, { transports: ['websocket', 'polling'] });
        socket.on('connect', () => {
          socket.emit('join:room', { roomId: `consultation_${consultationId}` });
        });
        socket.emit('join:room', { roomId: `consultation_${consultationId}` });
        socket.on(SOCKET_EVENTS.CONSULTATION_ASSIGNED, (payload: any) => {
          if (isMounted && (!payload || payload.consultationId === consultationId)) {
            setStatus('IN_PROGRESS');
            navigate(`/consult/room/${consultationId}`);
          }
        });
      }
    } catch {
      // Polling handles fallback
    }

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (socket) {
        socket.disconnect();
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [consultationId, accessToken, navigate]);

  const handleEnterCallDirectly = () => {
    if (consultationId) {
      navigate(`/consult/room/${consultationId}?mode=${audioOnlyPreference ? 'AUDIO' : 'VIDEO'}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F5] text-[#242424] flex flex-col justify-between p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto w-full">
      {/* Top Banner */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#F47738] animate-ping inline-block" />
            <h1 className="text-lg font-bold text-[#242424]">
              {t('consult.waitingRoom', 'Teleconsultation Queue')}
            </h1>
          </div>
          <div className="flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full bg-white border border-[#F0E2D8] text-[#6B7280]">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('common.connected', 'Connected')}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>{t('common.offlineCached', 'Offline Cached')}</span>
              </>
            )}
          </div>
        </div>

        {/* Live Queue Ticket Card */}
        <div className="bg-white border-2 border-[#F47738]/40 rounded-3xl p-6 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#F47738] to-[#D95D24]" />

          <p className="text-xs uppercase tracking-wider text-[#6B7280] font-semibold mb-1">
            {t('consult.ticketHeader', 'Your Live Token Status')}
          </p>

          <div className="my-4 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-[#FFF0E6] border-4 border-[#F0E2D8] flex flex-col items-center justify-center">
              <span className="text-xs text-[#D95D24] font-semibold">{t('consult.position', 'Position')}</span>
              <span className="text-3xl font-extrabold text-[#F47738]">
                #{loading ? '...' : position}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-[#6B7280] font-medium text-sm">
            <Clock className="w-4 h-4 text-[#F47738]" />
            <span>
              {t('consult.estWaitPrefix', 'Estimated wait')}:{' '}
              <strong className="text-[#242424]">
                {estWait < 0 ? t('consult.wait_estimating', 'Estimating (Doctor check-in pending)') : `~${estWait} ${t('common.min', 'mins')}`}
              </strong>
            </span>
          </div>

          <p className="text-xs text-[#6B7280] mt-2">
            Status:{' '}
            <span
              className={`font-semibold uppercase ${
                status === 'IN_PROGRESS'
                  ? 'text-emerald-600 font-extrabold animate-pulse'
                  : 'text-[#D95D24]'
              }`}
            >
              {status === 'IN_PROGRESS' ? t('consult.status_admitted', 'ADMITTED BY DOCTOR') : status}
            </span>
          </p>
        </div>

        {/* Audio Mode Preference for 2G / weak networks */}
        <div className="bg-white border border-[#F0E2D8] rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-[#FFF0E6] text-[#D95D24]">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#242424]">{t('consult.low_bandwidth_mode', 'Low Bandwidth Mode')}</p>
              <p className="text-[11px] text-[#6B7280]">{t('consult.low_bandwidth_sub', 'Audio only for 2G / poor signal')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAudioOnlyPreference(!audioOnlyPreference)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              audioOnlyPreference
                ? 'bg-[#F47738] text-white'
                : 'bg-slate-100 text-[#6B7280] hover:bg-[#FFF0E6]'
            }`}
          >
            {audioOnlyPreference ? t('consult.enabled', 'Enabled') : t('consult.disabled', 'Disabled')}
          </button>
        </div>

        {/* Reassuring Rural Guidance */}
        <div className="bg-white rounded-2xl p-4 space-y-2 border border-[#F0E2D8]">
          <div className="flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-[#6B7280] leading-relaxed">
              {t('consult.stay_on_screen', 'Stay on this screen. The phone will ring or alert you as soon as the Medical Officer admits your token.')}
            </p>
          </div>
          <div className="flex items-start space-x-2.5">
            <Users className="w-4 h-4 text-[#F47738] shrink-0 mt-0.5" />
            <p className="text-xs text-[#6B7280] leading-relaxed">
              {t('consult.prepare_medicines', 'Keep your medicine bottles or previous slips ready next to you for the doctor to review.')}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Section */}
      <div className="pt-4 space-y-3">
        {/* Statutory Clinical Disclaimer */}
        <div className="text-[10px] text-[#6B7280] text-center flex items-center justify-center space-x-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#F47738]" />
          <span>{t('consult.guidelines_notice', 'Teleconsultation is provided under Telemedicine Practice Guidelines (MoHFW India).')}</span>
        </div>

        {/* Waiting notice when not admitted yet */}
        {!isAdmitted && (
          <p className="text-[11px] text-[#D95D24] font-semibold text-center flex items-center justify-center space-x-1">
            <Clock className="w-3.5 h-3.5 animate-spin text-[#F47738]" />
            <span>{t('consult.waiting_admission', 'Waiting for Doctor to Admit You...')}</span>
          </p>
        )}

        {isAdmitted && (
          <p className="text-[11px] text-emerald-600 font-semibold text-center flex items-center justify-center space-x-1 animate-pulse">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t('consult.doctor_admitted', 'Doctor has admitted you! Entering consultation...')}</span>
          </p>
        )}

        {/* Admitted button: clickable when doctor admits patient */}
        <button
          onClick={handleEnterCallDirectly}
          disabled={!isAdmitted}
          className={`w-full min-h-[52px] font-bold rounded-2xl shadow-lg flex items-center justify-center space-x-2 transition-all ${
            isAdmitted
              ? 'bg-[#F47738] hover:bg-[#D95D24] active:scale-[0.99] text-white shadow-[#F47738]/20 cursor-pointer animate-pulse'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {audioOnlyPreference ? <PhoneCall className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          <span>
            {isAdmitted ? t('consult.doctor_ready', 'Doctor Ready — Connect Now') : t('consult.enterCall', 'Connect to Doctor Now')}
          </span>
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
};
