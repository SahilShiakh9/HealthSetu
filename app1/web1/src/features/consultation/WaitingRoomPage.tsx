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
import { API_BASE_URL } from '../../services/apiClient.js';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS } from '@healthsetu/contracts';

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
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch(`${API_BASE_URL}/consultations/queue/${consultationId}`, { headers });
        if (res.ok) {
          const data = await res.json();
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
        } else {
          // If 404/error, fallback demo values
          if (isMounted) {
            setLoading(false);
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
      const socketUrl =
        (import.meta as any).env?.VITE_SOCKET_URL ||
        API_BASE_URL.replace(/\/api\/v1\/?$/, '');
      if (socketUrl) {
        socket = io(socketUrl, { transports: ['websocket', 'polling'] });
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Top Banner */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping inline-block" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('consult.waitingRoom', 'Teleconsultation Queue')}
            </h1>
          </div>
          <div className="flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                <span>Offline Cached</span>
              </>
            )}
          </div>
        </div>

        {/* Live Queue Ticket Card */}
        <div className="bg-white dark:bg-slate-900 border-2 border-emerald-500/30 rounded-3xl p-6 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

          <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            {t('consult.ticketHeader', 'Your Live Token Status')}
          </p>

          <div className="my-4 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border-4 border-emerald-500/20 flex flex-col items-center justify-center">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Position</span>
              <span className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
                #{loading ? '...' : position}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-slate-600 dark:text-slate-300 font-medium text-sm">
            <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {t('consult.estWaitPrefix', 'Estimated wait')}:{' '}
              <strong className="text-slate-900 dark:text-white">
                {estWait < 0 ? 'Estimating (Doctor check-in pending)' : `~${estWait} mins`}
              </strong>
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-2">
            Status:{' '}
            <span
              className={`font-semibold uppercase ${
                status === 'IN_PROGRESS'
                  ? 'text-emerald-500 font-extrabold animate-pulse'
                  : 'text-amber-500'
              }`}
            >
              {status === 'IN_PROGRESS' ? 'ADMITTED BY DOCTOR' : status}
            </span>
          </p>
        </div>

        {/* Audio Mode Preference for 2G / weak networks */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Low Bandwidth Mode</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Audio only for 2G / poor signal</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAudioOnlyPreference(!audioOnlyPreference)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              audioOnlyPreference
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {audioOnlyPreference ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Reassuring Rural Guidance */}
        <div className="bg-slate-100/70 dark:bg-slate-900/60 rounded-2xl p-4 space-y-2 border border-slate-200/50 dark:border-slate-800/50">
          <div className="flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>Stay on this screen.</strong> The phone will ring or alert you as soon as the Medical Officer admits your token.
            </p>
          </div>
          <div className="flex items-start space-x-2.5">
            <Users className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Keep your medicine bottles or previous slips ready next to you for the doctor to review.
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Section */}
      <div className="pt-4 space-y-3">
        {/* Statutory Clinical Disclaimer */}
        <div className="text-[10px] text-slate-400 dark:text-slate-500 text-center flex items-center justify-center space-x-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Teleconsultation is provided under Telemedicine Practice Guidelines (MoHFW India).</span>
        </div>

        {/* Waiting notice when not admitted yet */}
        {!isAdmitted && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold text-center flex items-center justify-center space-x-1">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>Waiting for Doctor to Admit You...</span>
          </p>
        )}

        {isAdmitted && (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold text-center flex items-center justify-center space-x-1 animate-pulse">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Doctor has admitted you! Entering consultation...</span>
          </p>
        )}

        {/* Admitted button: clickable when doctor admits patient */}
        <button
          onClick={handleEnterCallDirectly}
          disabled={!isAdmitted}
          className={`w-full min-h-[52px] font-bold rounded-2xl shadow-lg flex items-center justify-center space-x-2 transition-all ${
            isAdmitted
              ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-emerald-600/20 cursor-pointer animate-pulse'
              : 'bg-slate-200 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          {audioOnlyPreference ? <PhoneCall className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          <span>
            {isAdmitted ? 'Doctor Ready — Connect Now' : t('consult.enterCall', 'Connect to Doctor Now')}
          </span>
          <ArrowRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
};
