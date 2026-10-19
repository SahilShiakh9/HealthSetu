import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  MessageSquare,
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Info,
  Headphones,
} from 'lucide-react';
import { useAuthStore } from '../auth/useAuthStore.js';
import { db } from '../../offline/db.js';
import { apiClient } from '../../services/apiClient.js';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@healthsetu/contracts';
import {
  RealWebRTCCommunicationService,
  type ICommunicationService,
  type ConnectionState,
} from '../../services/communication/communication.service.js';
import type {
  CallMode,
  OutcomeType,
  MedicationItem,
} from '@healthsetu/contracts';

export interface PrescriptionMedication extends MedicationItem {
  timing?: { morning?: boolean; afternoon?: boolean; night?: boolean; beforeFood?: boolean };
}

interface ChatMessage {
  id: string;
  clientId?: string;
  senderRole: string;
  body: string;
  at: string;
}

export const ConsultationRoomPage: React.FC = () => {
  const { consultationId } = useParams<{ consultationId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, accessToken } = useAuthStore();

  const isDoctor = user?.role === 'DOCTOR' || searchParams.get('role') === 'doctor';
  const initialMode = (searchParams.get('mode') as CallMode) || 'VIDEO';

  // Room & RTC states
  const [callMode, setCallMode] = useState<CallMode>(initialMode);
  const [micMuted, setMicMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<'CALL' | 'CHAT' | 'PRESCRIPTION'>('CALL');
  const [callDuration, setCallDuration] = useState(0);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [callEnded, setCallEnded] = useState<boolean>(false);
  const [consultStatus, setConsultStatus] = useState<string>('IN_PROGRESS');
  const [connectionState, setConnectionState] = useState<ConnectionState>('CONNECTING');
  const [hasRemoteTrack, setHasRemoteTrack] = useState<boolean>(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const commServiceRef = useRef<ICommunicationService | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const zegoRoomIdRef = useRef<string>('');

  // Chat states
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      senderRole: 'DOCTOR',
      body: 'Namaste. Live teleconsultation room active. Can you hear me clearly?',
      at: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Doctor Clinical Outcome state - clinician-entered only
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('PRESCRIPTION');
  const [diagnosisLabel, setDiagnosisLabel] = useState('');
  const [assessment, setAssessment] = useState('');
  const [medications, setMedications] = useState<PrescriptionMedication[]>([]);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [clinicalTests, setClinicalTests] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [doctorDisplayName, setDoctorDisplayName] = useState<string>('Assigned Medical Officer');
  const [patientDisplayName, setPatientDisplayName] = useState<string>('Patient');

  // Join consultation on mount via POST /api/v1/consultations/:id/join
  useEffect(() => {
    if (!consultationId) return;

    let isMounted = true;

    const joinConsultation = async () => {
      try {
        const data: any = await apiClient(`/consultations/${consultationId}/join`, {
          method: 'POST',
        });

        if (!isMounted) return;

        if (data.consultation?.doctorId?.name) setDoctorDisplayName(data.consultation.doctorId.name);
        if (data.consultation?.patientId?.name) setPatientDisplayName(data.consultation.patientId.name);
        if (data.consultation?.status) setConsultStatus(data.consultation.status);
        if (data.zego?.roomId) zegoRoomIdRef.current = data.zego.roomId;

          // Restore persisted chat messages from MongoDB
          if (Array.isArray(data.consultation?.messages) && data.consultation.messages.length > 0) {
            const dbMsgs: ChatMessage[] = data.consultation.messages.map((m: any) => ({
              id: m._id?.toString() || m.clientId || crypto.randomUUID(),
              clientId: m.clientId,
              senderRole: m.senderRole,
              body: m.body,
              at: m.at || new Date().toISOString(),
            }));
            setMessages(dbMsgs);
          }

          const configured = Boolean(data.zego?.isConfigured);
          setIsConfigured(configured);

          // Connect Socket.IO for real-time bidirectional messaging and synchronized lifecycle
          try {
            const socketUrl =
              (import.meta as any).env?.VITE_SOCKET_URL ||
              (typeof window !== 'undefined' && window.location.hostname === 'localhost'
                ? 'http://localhost:4000'
                : typeof window !== 'undefined'
                  ? window.location.origin
                  : '');
            if (socketUrl) {
              const socket = io(socketUrl, { transports: ['websocket', 'polling'] });
              socketRef.current = socket;
              const rId = data.zego?.roomId || `consultation_${consultationId}`;
              socket.emit('join:room', {
                roomId: rId,
                userId: user?.id,
                role: isDoctor ? 'DOCTOR' : 'PATIENT',
              });

              // Listen for new chat messages
              socket.on(SOCKET_EVENTS.MESSAGE_NEW, (payload: any) => {
                if (payload?.consultationId && payload.consultationId !== consultationId) return;
                const msg = payload.message;
                if (!msg) return;
                setMessages((prev) => {
                  const alreadyExists = prev.some(
                    (m) =>
                      m.id === msg.id ||
                      (msg.clientId && (m.id === msg.clientId || m.clientId === msg.clientId)) ||
                      (m.senderRole === msg.senderRole &&
                        m.body === msg.body &&
                        Math.abs(new Date(m.at).getTime() - new Date(msg.at).getTime()) < 10000),
                  );
                  if (alreadyExists) {
                    return prev.map((m) => {
                      if (msg.clientId && (m.id === msg.clientId || m.clientId === msg.clientId)) {
                        return { ...m, id: msg.id, clientId: msg.clientId };
                      }
                      return m;
                    });
                  }
                  return [...prev, msg];
                });
              });

              // Listen for call ended by either party
              socket.on(SOCKET_EVENTS.CALL_ENDED, () => {
                commServiceRef.current?.leaveRoom();
                setCallEnded(true);
                setConsultStatus('DOCUMENTATION_PENDING');
                if (isDoctor) {
                  setActiveTab('PRESCRIPTION');
                }
              });

              // Listen for consultation finalized / completed
              socket.on('consultation:completed', () => {
                commServiceRef.current?.leaveRoom();
                setCallEnded(true);
                setConsultStatus('COMPLETED');
                if (!isDoctor) {
                  navigate(`/reports/${consultationId}`);
                }
              });
            }
          } catch (sockErr) {
            console.warn('Socket connection warning:', sockErr);
          }

          if (configured) {
            // Configured -> initialize real media stream
            try {
              const comm = new RealWebRTCCommunicationService();
              commServiceRef.current = comm;

              comm.onConnectionState((st) => {
                if (isMounted) setConnectionState(st);
              });

              await comm.initialize({
                appId: data.zego.appId,
                token: data.zego.token,
                roomId: data.zego.roomId,
                userId: user?.id || 'anon',
                isConfigured: true,
              });

              const stream = await comm.startLocalStream(callMode === 'AUDIO');
              if (localVideoRef.current && isMounted) {
                localVideoRef.current.srcObject = stream;
              }

              comm.onRemoteStream((remoteStream) => {
                if (remoteVideoRef.current && isMounted) {
                  remoteVideoRef.current.srcObject = remoteStream;
                  setHasRemoteTrack(true);
                  setConnectionState('CONNECTED');
                }
              });
            } catch (err: any) {
              if (isMounted) {
                setMediaError(err.message || 'Camera or microphone access denied');
              }
            }
          }
      } catch (err: any) {
        if (err?.code === 'CONSULTATION_NOT_ADMITTED' || err?.message?.includes('CONSULTATION_NOT_ADMITTED')) {
          if (isMounted) navigate(`/consult/waiting/${consultationId}`);
          return;
        }
        if (isMounted) {
          setIsConfigured(false);
        }
      }
    };

    joinConsultation();

    // Periodic Background Sync (every 2.5s) to guarantee resilience across intermittent connections
    const syncInterval = setInterval(async () => {
      if (!consultationId || !isMounted) return;
      try {
        const syncData = await apiClient<{ consultation?: any }>(`/consultations/${consultationId}`);
        const c = syncData?.consultation;
        if (!c) return;

          // Sync incoming messages
          if (Array.isArray(c.messages) && c.messages.length > 0) {
            setMessages((prev) => {
              let changed = false;
              const updated = [...prev];

              for (const raw of c.messages) {
                const dbId = raw._id?.toString() || raw.clientId;
                const cId = raw.clientId;
                const body = raw.body;
                const senderRole = raw.senderRole;
                const at = raw.at || new Date().toISOString();

                // Check if message is already in updated list
                const existingIdx = updated.findIndex(
                  (m) =>
                    m.id === dbId ||
                    (cId && (m.id === cId || m.clientId === cId)) ||
                    (m.senderRole === senderRole &&
                      m.body === body &&
                      Math.abs(new Date(m.at).getTime() - new Date(at).getTime()) < 10000),
                );

                if (existingIdx !== -1) {
                  // Upgrade existing message with official db id and clientId if needed
                  if (updated[existingIdx].id !== dbId) {
                    updated[existingIdx] = { ...updated[existingIdx], id: dbId, clientId: cId };
                    changed = true;
                  }
                } else {
                  // Truly new message from other participant
                  updated.push({
                    id: dbId,
                    clientId: cId,
                    senderRole,
                    body,
                    at,
                  });
                  changed = true;
                }
              }

              return changed ? updated : prev;
            });
          }

          // Sync authoritative status transitions
          if (c.status === 'DOCUMENTATION_PENDING') {
            setConsultStatus('DOCUMENTATION_PENDING');
            if (!callEnded) {
              commServiceRef.current?.leaveRoom();
              setCallEnded(true);
              if (isDoctor) setActiveTab('PRESCRIPTION');
            }
          } else if (c.status === 'COMPLETED') {
            setConsultStatus('COMPLETED');
            commServiceRef.current?.leaveRoom();
            setCallEnded(true);
            if (!isDoctor) {
              navigate(`/reports/${consultationId}`);
            }
          }
      } catch {
        // Silent catch for background poll
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(syncInterval);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      commServiceRef.current?.leaveRoom();
    };
  }, [consultationId, accessToken, user?.id, navigate, isDoctor]);

  // Call timer (only increments while call is active and configured)
  useEffect(() => {
    if (callEnded || isConfigured === false) return;
    const timer = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callEnded, isConfigured]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Toggle call mode (Video <-> Audio)
  const handleToggleCallMode = async () => {
    const nextMode: CallMode = callMode === 'VIDEO' ? 'AUDIO' : 'VIDEO';
    setCallMode(nextMode);
    const muted = nextMode === 'AUDIO';

    commServiceRef.current?.toggleCamera(!muted);

    if (consultationId) {
      try {
        await apiClient(`/consultations/${consultationId}/mode`, {
          method: 'PATCH',
          body: JSON.stringify({ mode: nextMode, reason: 'Participant toggled mode' }),
        });
      } catch {
        // Mode toggled locally
      }
    }
  };

  // Toggle Microphone
  const handleToggleMic = () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    commServiceRef.current?.toggleMic(nextMuted);
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const clientId = crypto.randomUUID();
    const newMsg: ChatMessage = {
      id: clientId,
      clientId,
      senderRole: isDoctor ? 'DOCTOR' : 'PATIENT',
      body: chatInput.trim(),
      at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    const bodyToSend = chatInput.trim();
    setChatInput('');

    if (consultationId) {
      try {
        await apiClient(`/consultations/${consultationId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            clientId: newMsg.id,
            body: bodyToSend,
            kind: 'TEXT',
          }),
        });
      } catch {
        await db.messageDrafts.put({
          clientId: newMsg.id,
          consultationId,
          body: bodyToSend,
          createdAt: Date.now(),
        });
      }
    }
  };

  // Add medication row
  const handleAddMedication = () => {
    setMedications((prev) => [
      ...prev,
      {
        name: '',
        dosage: '',
        frequency: 'Twice daily',
        durationDays: 3,
        instructions: '',
        timing: { morning: true, afternoon: false, night: true, beforeFood: false },
      },
    ]);
  };

  // Remove medication
  const handleRemoveMedication = (index: number) => {
    setMedications((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Conclude Call (ends media and sets DOCUMENTATION_PENDING without auto-finalizing)
  const handleEndCall = async () => {
    try {
      await apiClient(`/consultations/${consultationId}/end`, {
        method: 'POST',
      });
    } catch {
      // offline / local
    }

    await commServiceRef.current?.leaveRoom();
    setCallEnded(true);
    setConsultStatus('DOCUMENTATION_PENDING');

    if (isDoctor) {
      setActiveTab('PRESCRIPTION');
    }
  };

  // Sign & Complete Consultation (Doctor Explicit Action)
  const handleFinalizeConsultation = async () => {
    if (!diagnosisLabel.trim()) {
      alert('Please enter a clinical diagnosis before finalizing the report.');
      return;
    }

    setConcluding(true);
    const parsedTests = clinicalTests
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean);

    const outcomeData = {
      outcomeType,
      diagnosisLabel: diagnosisLabel.trim(),
      assessment: assessment.trim() || 'Clinical teleconsultation concluded.',
      medications,
      tests: parsedTests,
      notes: clinicalNotes.trim(),
      followUpDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
    };

    try {
      if (consultationId) {
        await apiClient(`/consultations/${consultationId}/complete`, {
          method: 'POST',
          body: JSON.stringify(outcomeData),
        });

        await db.encountersCache.put({
          encounterId: consultationId,
          data: {
            consultationId,
            outcome: outcomeData,
            doctorName: doctorDisplayName || user?.name || 'Assigned Clinician',
            completedAt: new Date().toISOString(),
          },
          updatedAt: Date.now(),
        });
      }
    } catch {
      if (consultationId) {
        await db.encountersCache.put({
          encounterId: consultationId,
          data: {
            consultationId,
            outcome: outcomeData,
            doctorName: doctorDisplayName || user?.name || 'Assigned Clinician',
            completedAt: new Date().toISOString(),
          },
          updatedAt: Date.now(),
        });
      }
    } finally {
      setConcluding(false);
      navigate(`/reports/${consultationId || 'demo'}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto">
      {/* Top Header */}
      <header className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          {!callEnded && isConfigured && (
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          )}
          <span className="text-xs font-mono font-bold tracking-wider text-slate-200">
            {formatDuration(callDuration)}
          </span>
          <span className="text-xs font-medium text-slate-400">|</span>
          <span className="text-xs font-semibold text-emerald-400">
            {callMode === 'VIDEO' ? 'HD Video' : 'Audio Mode (2G)'}
          </span>
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionState === 'CONNECTED'
                  ? 'bg-emerald-500'
                  : connectionState === 'CONNECTING'
                    ? 'bg-amber-400 animate-ping'
                    : connectionState === 'RECONNECTING'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-rose-500'
              }`}
            />
            <span>{connectionState}</span>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex bg-slate-800 p-0.5 rounded-xl text-xs font-medium">
          <button
            onClick={() => setActiveTab('CALL')}
            className={`px-3 py-1 rounded-lg transition-all ${
              activeTab === 'CALL' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('consult.tab_call', 'Call')}
          </button>
          <button
            onClick={() => setActiveTab('CHAT')}
            className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1 ${
              activeTab === 'CHAT' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>{t('consult.tab_chat', 'Chat')}</span>
          </button>
          {isDoctor && (
            <button
              onClick={() => setActiveTab('PRESCRIPTION')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center space-x-1 ${
                activeTab === 'PRESCRIPTION' ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('consult.tab_rx', 'Rx')}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col relative overflow-y-auto">
        {activeTab === 'CALL' && (
          <div className="flex-1 flex flex-col justify-center items-center p-4 relative min-h-[380px]">
            {/* Unconfigured State (Section 0.2 honest diagnostic) */}
            {isConfigured === false ? (
              <div className="w-full flex-1 max-h-[420px] rounded-3xl bg-slate-900 border border-slate-800 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl">
                  <VideoOff className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-white">{t('consult.video_unconfigured_title', 'Video calling is not configured on this server')}</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  {t('consult.video_unconfigured_desc', 'ZEGOCLOUD or WebRTC provider credentials are not configured on this server. Please use in-call secure text chat below.')}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('CHAT')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors"
                >
                  {t('consult.open_secure_chat', 'Open Secure Chat')}
                </button>
              </div>
            ) : callEnded ? (
              <div className="w-full flex-1 max-h-[420px] rounded-3xl bg-slate-900 border border-slate-800 p-6 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-base text-white">{t('consult.call_concluded', 'Consultation Call Concluded')}</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  {isDoctor
                    ? 'Call ended. Status is DOCUMENTATION_PENDING. Please complete clinical diagnosis and prescription below to issue report.'
                    : t('consult.call_ended_patient_sub', 'Call ended. The Medical Officer is currently preparing your clinical summary and prescription.')}
                </p>
                {isDoctor ? (
                  <button
                    type="button"
                    onClick={() => setActiveTab('PRESCRIPTION')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    Complete Documentation
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/reports')}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-700 transition-colors"
                  >
                    {t('consult.view_prescription', 'View Prescription & Records')}
                  </button>
                )}
              </div>
            ) : (
              /* Real Live RTC Feed Display */
              <div className="w-full flex-1 max-h-[420px] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden relative flex flex-col items-center justify-center">
                {mediaError && (
                  <div className="absolute top-3 left-3 right-3 z-20 bg-rose-950/80 border border-rose-800 p-2.5 rounded-xl text-xs text-rose-200 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{mediaError}</span>
                  </div>
                )}

                {/* Audio-only Contention Fallback Indicator */}
                {commServiceRef.current?.isAudioFallbackActive() && (
                  <div className="absolute top-3 left-3 z-20 bg-amber-950/80 border border-amber-600/50 px-2.5 py-1 rounded-xl text-[11px] text-amber-200 flex items-center gap-1.5 shadow-sm">
                    <Headphones className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('consult.audio_fallback', 'Audio-Only Mode (Camera in use or unavailable)')}</span>
                  </div>
                )}

                {/* Waiting for remote participant overlay */}
                {!hasRemoteTrack && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-900/90 z-10">
                    <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin flex items-center justify-center">
                      <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
                    </div>
                    <p className="text-sm font-bold text-slate-200">
                      {connectionState === 'CONNECTING'
                        ? t('consult.connecting_room', 'Connecting to Room...')
                        : t('consult.waiting_participant', 'Waiting for Other Participant to Connect...')}
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {isDoctor
                        ? 'Patient is joining the room. Bidirectional audio and video will establish automatically.'
                        : t('consult.doctor_connecting_sub', 'Medical Officer is connecting to this session. Please keep your audio enabled.')}
                    </p>
                  </div>
                )}

                {/* Remote Video Track */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Remote Participant Banner Overlay */}
                <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-left z-20">
                  <p className="text-xs font-bold text-white">
                    {isDoctor ? patientDisplayName : doctorDisplayName}
                  </p>
                  <p className="text-[10px] text-emerald-400">
                    {isDoctor ? 'Patient Feed' : t('consult.doctor_feed', 'Medical Officer Feed')}
                  </p>
                </div>

                {/* Local Picture-in-Picture Preview */}
                <div className="absolute top-3 right-3 w-28 h-36 rounded-2xl bg-slate-850 border border-slate-700 shadow-lg overflow-hidden z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1.5 text-[9px] text-slate-300 font-semibold bg-slate-900/70 px-1.5 py-0.5 rounded">
                    {t('consult.you', 'You')} {micMuted ? t('consult.muted', '(Muted)') : ''}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* In-Call Text Chat Tab */}
        {activeTab === 'CHAT' && (
          <div className="flex-1 flex flex-col p-4 space-y-3">
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {messages.map((msg) => {
                const isMe =
                  (isDoctor && msg.senderRole === 'DOCTOR') ||
                  (!isDoctor && msg.senderRole === 'PATIENT');
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        isMe
                          ? 'bg-emerald-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-semibold opacity-75 block mb-0.5">
                        {msg.senderRole}
                      </span>
                      {msg.body}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center space-x-2 pt-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={t('consult.type_message_placeholder', 'Type message or clinical advice...')}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Doctor Clinical Prescription Tab (clinician writes, never auto-filled) */}
        {activeTab === 'PRESCRIPTION' && isDoctor && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {consultStatus === 'DOCUMENTATION_PENDING' && (
              <div className="bg-teal-950/40 border border-teal-800 p-3 rounded-2xl text-xs text-teal-200 flex items-start gap-2">
                <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Call Concluded — Documentation Pending</p>
                  <p className="text-[11px] text-teal-300 mt-0.5">
                    Please enter the clinical diagnosis, medications, and advice below. The report will only be generated once finalized.
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Clinical Assessment & Diagnosis
              </h4>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Consultation Outcome</label>
                <select
                  value={outcomeType}
                  onChange={(e) => setOutcomeType(e.target.value as OutcomeType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="PRESCRIPTION">PRESCRIPTION (Medication Given)</option>
                  <option value="ADVICE">ADVICE ONLY (Non-pharmacological)</option>
                  <option value="REFERRAL">REFERRAL (Refer to CHC / DH)</option>
                  <option value="FOLLOW_UP">FOLLOW UP (Scheduled follow-up)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Primary Diagnosis *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acute Upper Respiratory Tract Infection"
                  value={diagnosisLabel}
                  onChange={(e) => setDiagnosisLabel(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Clinical Assessment Notes</label>
                <textarea
                  rows={2}
                  placeholder="Clinical observations and exam notes..."
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Recommended Diagnostic Tests (one per line)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. CBC&#10;Serum Creatinine"
                  value={clinicalTests}
                  onChange={(e) => setClinicalTests(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Dietary & Clinical Advice</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Rest, oral hydration, warm saline gargles..."
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white resize-none"
                />
              </div>
            </div>

            {/* Prescriptions List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                  Medications Prescribed
                </h4>
                <button
                  type="button"
                  onClick={handleAddMedication}
                  className="px-2.5 py-1 bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-lg text-xs font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Medicine</span>
                </button>
              </div>

              {medications.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">
                  No medicines added yet. Click &quot;Add Medicine&quot; to prescribe drugs.
                </p>
              ) : (
                medications.map((med, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        placeholder="Drug name (e.g. Tab Paracetamol 500mg)"
                        value={med.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMedications((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, name: val } : m)),
                          );
                        }}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMedication(idx)}
                        className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Dosage</span>
                        <input
                          type="text"
                          value={med.dosage}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMedications((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, dosage: val } : m)),
                            );
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Frequency</span>
                        <input
                          type="text"
                          value={med.frequency}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMedications((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, frequency: val } : m)),
                            );
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-0.5">Days</span>
                        <input
                          type="number"
                          value={med.durationDays}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 1;
                            setMedications((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, durationDays: val } : m)),
                            );
                          }}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={handleFinalizeConsultation}
              disabled={concluding}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{concluding ? 'Finalizing Record...' : 'Finalise and Issue Prescription'}</span>
            </button>
          </div>
        )}
      </main>

      {/* Call Control Footer */}
      <footer className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
        <div className="flex items-center justify-around">
          {/* Audio / Video toggle */}
          <button
            onClick={handleToggleCallMode}
            className={`p-3 rounded-2xl border transition-all ${
              callMode === 'AUDIO'
                ? 'bg-amber-600/30 border-amber-500 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title={t('consult.audio_video_toggle', 'Toggle Bandwidth Mode')}
          >
            {callMode === 'AUDIO' ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Mute Mic */}
          <button
            onClick={handleToggleMic}
            className={`p-3 rounded-2xl border transition-all ${
              micMuted
                ? 'bg-red-900/40 border-red-500 text-red-400'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title={t('consult.mute_toggle', 'Toggle Microphone')}
          >
            {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* End Call Button (sets DOCUMENTATION_PENDING, does not auto-finalize) */}
          <button
            onClick={handleEndCall}
            className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-600/30"
            title={t('consult.end_call', 'End Call')}
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>

        {/* Section 11.6 Mandatory Telemedicine Statutory Advisory */}
        <p className="text-[9px] text-slate-500 text-center leading-tight">
          {t('consult.guidelines_notice', 'Registered Medical Practitioner consultation pursuant to Telemedicine Practice Guidelines (2020).')}
        </p>
      </footer>
    </div>
  );
};
