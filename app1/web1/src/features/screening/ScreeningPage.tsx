import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Shield,
  Stethoscope,
  MapPin,
  CheckCircle2,
  MessageSquare,
  HelpCircle,
  FileEdit,
  PhoneCall,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../../offline/db.js';
import { queueOutboxEvent } from '../../offline/outbox.js';
import { evaluateEmergencyRules } from '../../engine/emergency.js';
import { API_BASE_URL } from '../../services/apiClient.js';
import type { Language, RiskTier, CreateScreeningInput } from '@healthsetu/contracts';

type LifecycleState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'confirming'
  | 'processing'
  | 'speaking'
  | 'concluded';

interface Message {
  id: string;
  sender: 'assistant' | 'user';
  text: string;
  timestamp: number;
  questionId?: string;
}

// Localized UI Dictionary for all patient-facing texts
const UI_STRINGS: Record<
  Language,
  {
    title: string;
    subtitle: string;
    privacy: string;
    emergencyBanner: string;
    greeting: string;
    tapToSpeak: string;
    listening: string;
    stopRecording: string;
    typeInstead: string;
    switchToVoice: string;
    typePlaceholder: string;
    reviewTranscript: string;
    continueBtn: string;
    editBtn: string;
    reRecordBtn: string;
    stopSpeaking: string;
    replayAudio: string;
    voiceUnavailable: string;
    yes: string;
    no: string;
    notSure: string;
    quickAnswer: string;
    processing: string;
    permDenied: string;
    speechError: string;
    networkError: string;
    assessmentTitle: string;
    reportedSymptoms: string;
    clinicalTriage: string;
    specialtyLabel: string;
    consultDoctor: string;
    findPhc: string;
    newScreening: string;
    disclaimer: string;
  }
> = {
  mr: {
    title: 'आरोग्य तपासणी',
    subtitle: 'आवाज-प्रथम ग्रामीण आरोग्य सहाय्यक',
    privacy: 'खाजगी व सुरक्षित. लक्षणे समजून घेण्यासाठी मदत करते, हे डॉक्टरांचा पर्याय नाही.',
    emergencyBanner: 'तातडीची वैद्यकीय मदत आवश्यक आहे? १०८ वर तात्काळ कॉल करा',
    greeting: 'नमस्कार! मी तुमचा आरोग्य तपासणी सहाय्यक आहे. तुम्हाला काय त्रास होत आहे ते कृपया सांगा किंवा खाली टाईप करा.',
    tapToSpeak: 'येथे टॅप करा आणि बोला',
    listening: 'ऐकत आहे... बोला (थांबवण्यासाठी टॅप करा)',
    stopRecording: 'रेकॉर्डिंग थांबवा',
    typeInstead: 'किंवा मजकूर टाईप करून सांगा',
    switchToVoice: 'आवाज मोडवर जा',
    typePlaceholder: 'उदा. दोन दिवसांपासून ताप व खोकला आहे...',
    reviewTranscript: 'तुम्ही जे बोललात ते खालीलप्रमाणे आहे. तपासा किंवा सुधारणा करा:',
    continueBtn: 'तपासणी पुढे सुरू ठेवा',
    editBtn: 'सुधारणा करा',
    reRecordBtn: 'पुन्हा बोला',
    stopSpeaking: 'आवाज थांबवा',
    replayAudio: 'पुन्हा ऐका',
    voiceUnavailable: 'या डिव्हाइसवर मराठी आवाज उपलब्ध नाही; वरील मजकूर वाचा.',
    yes: 'होय',
    no: 'नाही',
    notSure: 'निश्चित नाही',
    quickAnswer: 'जलद उत्तर निवडा:',
    processing: 'लक्षणांचे विश्लेषण करत आहे...',
    permDenied: 'मायक्रोफोन परवानगी नाकारली गेली आहे. कृपया ब्राऊझर सेटिंग्जमध्ये परवानगी द्या किंवा टाईप करा.',
    speechError: 'आवाज ओळखण्यात अडचण आली. कृपया पुन्हा बोला किंवा टाईप करा.',
    networkError: 'नेटवर्क जोडणीत अडचण आली. तुमचा मजकूर सुरक्षित आहे, पुन्हा प्रयत्न करा.',
    assessmentTitle: 'तपासणी निष्कर्ष',
    reportedSymptoms: 'नोंदवलेली लक्षणे:',
    clinicalTriage: 'प्राथमिक क्लिनिकल ट्रायज: प्राथमिक बाह्यरुग्ण (OPD) तपासणी',
    specialtyLabel: 'शिफारस केलेले विशेषज्ञ:',
    consultDoctor: 'डॉक्टरांशी मोफत सल्लामसलत करा',
    findPhc: 'जवळचे प्राथमिक आरोग्य केंद्र शोधा',
    newScreening: 'नवीन तपासणी सुरू करा',
    disclaimer: 'नोंद: हे प्राथमिक संगणकीय मॉडेलचे निष्कर्ष आहेत, वैद्यकीय निदान नाही. उपचारांसाठी डॉक्टरांचा सल्ला घ्या.',
  },
  hi: {
    title: 'स्वास्थ्य स्क्रीनिंग',
    subtitle: 'वॉयस-फर्स्ट ग्रामीण स्वास्थ्य सहायक',
    privacy: 'निजी और सुरक्षित। लक्षणों को समझने में मदद करता है, यह डॉक्टर का विकल्प नहीं है।',
    emergencyBanner: 'आपातकालीन चिकित्सा सहायता चाहिए? 108 पर तुरंत कॉल करें',
    greeting: 'नमस्ते! मैं आपका स्वास्थ्य सहायक हूँ। कृपया बताएं कि आपको क्या समस्या या तकलीफ हो रही है।',
    tapToSpeak: 'यहाँ टैप करें और बोलें',
    listening: 'सुन रहा है... बोलिए (रोकने के लिए टैप करें)',
    stopRecording: 'रिकॉर्डिंग रोकें',
    typeInstead: 'या लिखकर बताएं',
    switchToVoice: 'वॉयस मोड पर जाएं',
    typePlaceholder: 'जैसे दो दिन से बुखार और खांसी है...',
    reviewTranscript: 'आपने जो कहा वह नीचे लिखा है। जांचें या सुधार करें:',
    continueBtn: 'मूल्यांकन जारी रखें',
    editBtn: 'सुधारें',
    reRecordBtn: 'फिर से बोलें',
    stopSpeaking: 'बोलना रोकें',
    replayAudio: 'फिर से सुनें',
    voiceUnavailable: 'इस डिवाइस पर हिंदी आवाज उपलब्ध नहीं है; कृपया ऊपर लिखा टेक्स्ट पढ़ें।',
    yes: 'हां',
    no: 'नहीं',
    notSure: 'निश्चित नहीं',
    quickAnswer: 'उत्तर चुनें:',
    processing: 'लक्षणों का विश्लेषण कर रहा है...',
    permDenied: 'माइक्रोफोन की अनुमति नहीं मिली। कृपया ब्राउज़र सेटिंग्स में अनुमति दें या लिखकर बताएं।',
    speechError: 'आवाज पहचानने में समस्या आई। कृपया पुनः प्रयास करें या लिखें।',
    networkError: 'नेटवर्क कनेक्शन में समस्या आई। आपका टेक्स्ट सुरक्षित है, पुनः प्रयास करें।',
    assessmentTitle: 'स्क्रीनिंग परिणाम',
    reportedSymptoms: 'दर्ज किए गए लक्षण:',
    clinicalTriage: 'प्राथमिक नैदानिक ट्रायज: प्रारंभिक बाह्य रोगी (OPD) मूल्यांकन',
    specialtyLabel: 'सुझाई गई विशेषज्ञता:',
    consultDoctor: 'डॉक्टर से मुफ्त परामर्श शुरू करें',
    findPhc: 'नजदीकी प्राथमिक स्वास्थ्य केंद्र खोजें',
    newScreening: 'नई स्क्रीनिंग शुरू करें',
    disclaimer: 'नोट: यह प्रारंभिक अनुसंधान मॉडल का सुझाव है, चिकित्सीय निदान नहीं। इलाज हेतु डॉक्टर से परामर्श लें।',
  },
  en: {
    title: 'Health Screening',
    subtitle: 'Voice-First AI Health Assistant',
    privacy: 'Private & safe. Helps understand your symptoms; does not replace a clinician.',
    emergencyBanner: 'Medical Emergency? Call 108 immediately',
    greeting: 'Hello! I am your HealthSetu screening assistant. Please describe your health concern by voice or typing below.',
    tapToSpeak: 'Tap and Speak',
    listening: 'Listening... speak now (tap to stop)',
    stopRecording: 'Stop Recording',
    typeInstead: 'Or type symptoms instead',
    switchToVoice: 'Switch to Voice Input',
    typePlaceholder: 'e.g., mild fever and dry cough for two days...',
    reviewTranscript: 'Here is what was recognized. Review or edit before sending:',
    continueBtn: 'Continue Assessment',
    editBtn: 'Edit Text',
    reRecordBtn: 'Re-record',
    stopSpeaking: 'Stop Speaking',
    replayAudio: 'Replay Audio',
    voiceUnavailable: 'Native voice output is not supported on this browser; text fallback is displayed above.',
    yes: 'Yes',
    no: 'No',
    notSure: 'Not Sure',
    quickAnswer: 'Quick Answer:',
    processing: 'Analyzing your health concerns...',
    permDenied: 'Microphone permission was denied. Please allow microphone access in browser settings or type instead.',
    speechError: 'Speech recognition encountered an issue. Please try speaking again or use text mode.',
    networkError: 'Network request timed out. Your transcript has been preserved; please retry.',
    assessmentTitle: 'Screening Assessment',
    reportedSymptoms: 'Reported Symptoms:',
    clinicalTriage: 'Clinical Triage: Early Outpatient Evaluation (OPD)',
    specialtyLabel: 'Recommended Specialty:',
    consultDoctor: 'Consult Doctor Now (Free Teleconsultation)',
    findPhc: 'Find Nearby Health Facility',
    newScreening: 'Start New Screening',
    disclaimer: 'Note: Research prototype candidate only; not a validated medical diagnosis. Consult a doctor for clinical treatment.',
  },
};

export const ScreeningPage: React.FC = () => {
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  // Language state (Marathi, Hindi, English)
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(() => {
    const lang = (i18n.language || 'en').toLowerCase();
    if (lang.startsWith('mr')) return 'mr';
    if (lang.startsWith('hi')) return 'hi';
    return 'en';
  });

  const S = UI_STRINGS[selectedLanguage] || UI_STRINGS.en;

  // Lifecycle state machine
  const [state, setState] = useState<LifecycleState>('idle');
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transcript & editing state
  const [transcript, setTranscript] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [isEditingTranscript, setIsEditingTranscript] = useState<boolean>(false);

  // Conversational thread
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSymptoms, setCurrentSymptoms] = useState<string[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, 'yes' | 'no' | 'unknown'>>({});
  const [questionHistory, setQuestionHistory] = useState<string[]>([]);
  const [currentFollowUp, setCurrentFollowUp] = useState<{
    questionId: string;
    symptomId: string;
    text: string;
  } | null>(null);

  // Final outcome state
  const [screeningResult, setScreeningResult] = useState<{
    riskTier: RiskTier;
    candidateCategory: string | null;
    recommendedSpecialty: string;
    guidanceText: string;
    modelVersion: string;
  } | null>(null);

  const [localScreeningId] = useState<string>(() => crypto.randomUUID());
  const [sessionId] = useState<string>(() => `sess-${crypto.randomUUID()}`);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [negatedSymptoms, setNegatedSymptoms] = useState<string[]>([]);

  // Text-To-Speech engine state
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<any>(null);
  const voiceStopRequestedRef = useRef(false);
  const userActivatedAudioRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const transcriptRef = useRef<string>('');
  const stateRef = useRef<LifecycleState>('idle');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Safely auto-scroll conversation
  const scrollToBottom = useCallback(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, state, currentFollowUp, scrollToBottom]);

  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop active speech playback immediately and cleanly across all audio pipelines
  const handleStopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (activeAudioRef.current) {
      try {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current.src = '';
        activeAudioRef.current.onplay = null;
        activeAudioRef.current.onended = null;
        activeAudioRef.current.onerror = null;
      } catch {}
      activeAudioRef.current = null;
    }
    if (typeof document !== 'undefined') {
      try {
        const audios = document.querySelectorAll('audio');
        audios.forEach((a) => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch {}
        });
      } catch {}
    }
    setSpeakingMessageId(null);
    setIsSpeaking(false);
    setState((prev) => (prev === 'speaking' ? 'idle' : prev));
  }, []);

  // Unified high-fidelity neural audio streaming across all languages (Hindi, Marathi, English)
  // Guarantees SINGLE voice playback, zero dual-voice overlap, and instant cancellation
  const playBackendTts = useCallback(
    (textToSpeak: string, msgId?: string) => {
      try {
        handleStopSpeaking();

        const audioUrl = `${API_BASE_URL}/screenings/tts?text=${encodeURIComponent(textToSpeak)}&language=${selectedLanguage}`;
        const audio = new Audio(audioUrl);
        activeAudioRef.current = audio;

        audio.onplay = () => {
          setIsSpeaking(true);
          setSpeakingMessageId(msgId || 'active');
          setState((prev) => (prev === 'processing' ? 'speaking' : prev));
        };
        audio.onended = () => {
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setState((prev) => (prev === 'speaking' ? 'idle' : prev));
          activeAudioRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          setSpeakingMessageId(null);
          setState((prev) => (prev === 'speaking' ? 'idle' : prev));
          activeAudioRef.current = null;
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((playErr: any) => {
            console.warn('Audio play prevented or interrupted:', playErr);
            if (userActivatedAudioRef.current && window.speechSynthesis) {
              const utterance = new SpeechSynthesisUtterance(textToSpeak);
              utterance.lang =
                selectedLanguage === 'mr' ? 'mr-IN' : selectedLanguage === 'hi' ? 'hi-IN' : 'en-IN';
              utterance.rate = 0.9;
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(utterance);
            }
            setIsSpeaking(false);
            setSpeakingMessageId(null);
            setState((prev) => (prev === 'speaking' ? 'idle' : prev));
            activeAudioRef.current = null;
          });
        }
      } catch (err) {
        console.warn('Failed to initialize Audio player:', err);
        setIsSpeaking(false);
        setSpeakingMessageId(null);
        setState((prev) => (prev === 'speaking' ? 'idle' : prev));
      }
    },
    [handleStopSpeaking, selectedLanguage]
  );

  // Robust Text-to-Speech synthesis across all languages without dual voice clashing
  const speakAssistantText = useCallback(
    (textToSpeak: string, msgId?: string) => {
      const trimmed = textToSpeak.trim();
      if (!trimmed) return;
      playBackendTts(trimmed, msgId);
    },
    [playBackendTts]
  );

  // Replay speech for specific message
  const handleReplayAudio = useCallback(
    (explicitText?: string, msgId?: string) => {
      userActivatedAudioRef.current = true;
      if (explicitText) {
        speakAssistantText(explicitText, msgId);
        return;
      }
      const lastAssistantMsg = [...messages].reverse().find((m) => m.sender === 'assistant');
      if (lastAssistantMsg) {
        speakAssistantText(lastAssistantMsg.text, lastAssistantMsg.id);
      }
    },
    [messages, speakAssistantText]
  );

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = selectedLanguage === 'mr' ? 'mr-IN' : selectedLanguage === 'hi' ? 'hi-IN' : 'en-IN';

    rec.onresult = (event: any) => {
      let interimText = '';
      for (let i = event.resultIndex || 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${text}`.trim();
        } else {
          interimText += `${text} `;
        }
      }
      const cleaned = `${finalTranscriptRef.current} ${interimText}`.trim();
      setTranscript(cleaned);
      setTextInput(cleaned);
      // Interim recognition is only a visual preview. Never submit it or
      // carry it into the next microphone session.
      transcriptRef.current = finalTranscriptRef.current.trim();

      // Stop capture after a natural pause, but submit from onend only. This
      // prevents early submission and duplicate requests on mobile browsers.
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (cleaned.length > 1) {
        silenceTimerRef.current = setTimeout(() => {
          if (stateRef.current === 'listening') {
            try {
              recognitionRef.current?.stop();
            } catch {}
          }
        }, 2200);
      }
    };

    rec.onerror = (e: any) => {
      console.warn('Speech recognition error event:', e.error);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (e.error === 'not-allowed') {
        setErrorMessage(S.permDenied);
      } else if (e.error === 'no-speech') {
        // User remained silent, return to idle
      } else {
        setErrorMessage(S.speechError);
      }
      setState('idle');
    };

    rec.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (voiceStopRequestedRef.current) {
        voiceStopRequestedRef.current = false;
        return;
      }
      if (stateRef.current === 'listening') {
        const textToSubmit = transcriptRef.current.trim();
        if (textToSubmit) {
          handleProcessSubmission(textToSubmit);
        } else {
          setState('idle');
        }
      }
    };

    recognitionRef.current = rec;

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        rec.abort();
      } catch {}
    };
  }, [selectedLanguage, S.permDenied, S.speechError]);

  // Pre-warm audio cache for Marathi, Hindi, and English greetings for near-instant 0ms audio latency
  useEffect(() => {
    (['mr', 'hi', 'en'] as Language[]).forEach((l) => {
      const g = UI_STRINGS[l]?.greeting;
      if (g) {
        const audio = new Audio(
          `${API_BASE_URL}/screenings/tts?text=${encodeURIComponent(g)}&language=${l}`,
        );
        audio.preload = 'auto';
      }
    });
  }, []);

  // Initial greeting when language changes or first load - automatically speaks greeting without delay
  useEffect(() => {
    const greetingMsg: Message = {
      id: 'greeting-init',
      sender: 'assistant',
      text: S.greeting,
      timestamp: Date.now(),
    };
    setMessages([greetingMsg]);
    setTranscript('');
    setTextInput('');
    transcriptRef.current = '';
    finalTranscriptRef.current = '';
    setState('idle');
    setErrorMessage(null);

    // Auto-speak greeting immediately
    speakAssistantText(S.greeting, 'greeting-init');
  }, [selectedLanguage]);

  // Language switch handler - stops all prior audio immediately
  const handleLanguageSwitch = (lang: Language) => {
    handleStopSpeaking();
    if (state === 'listening' && recognitionRef.current) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    setSelectedLanguage(lang);
    if (typeof i18n?.changeLanguage === 'function') {
      i18n.changeLanguage(lang);
    }
  };

  // Start / Stop Microphone Recording with instant turnaround & zero lag
  const handleToggleRecording = () => {
    setErrorMessage(null);

    if (state === 'listening') {
      // User tapped to finish speaking - submit immediately!
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      try {
        voiceStopRequestedRef.current = true;
        recognitionRef.current?.stop();
      } catch (err) {
        console.warn('Could not stop recognition:', err);
      }
      const textToSubmit = (transcriptRef.current || transcript || textInput).trim();
      if (textToSubmit) {
        handleProcessSubmission(textToSubmit);
      } else {
        setState('idle');
      }
      return;
    }

    if (state === 'processing' || state === 'speaking') {
      return; // prevent duplicate clicks while busy
    }

    // Stop TTS if speaking
    handleStopSpeaking();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setInputMode('text');
      setErrorMessage(S.speechError);
      return;
    }

    setTranscript('');
    setTextInput('');
    transcriptRef.current = '';
    voiceStopRequestedRef.current = false;
    setIsEditingTranscript(false);
    setState('listening');

    try {
      recognitionRef.current?.start();
    } catch (err: any) {
      console.warn('Could not start recognition:', err);
      try {
        recognitionRef.current?.abort();
        setTimeout(() => {
          recognitionRef.current?.start();
        }, 120);
      } catch (retryErr) {
        setErrorMessage(S.speechError);
        setState('idle');
      }
    }
  };

  // Independent Emergency Warning Sign Checker
  const checkEmergencySignsLocally = (text: string): boolean => {
    const lower = text.toLowerCase();
    const localEmergencySymptoms: Record<string, 'yes' | 'no' | 'unknown'> = {};

    if (/chest pain|छातीत वेदना|छातीत दुखणे|सीने में दर्द|heart attack/i.test(lower)) {
      localEmergencySymptoms['chest_pain'] = 'yes';
    }
    if (/breathless|shortness of breath|cannot breathe|श्वास घेण्यास त्रास|सांस फूलना|difficulty breathing/i.test(lower)) {
      localEmergencySymptoms['breathing_difficulty'] = 'yes';
    }
    if (/loss of consciousness|faint|चक्कर|बेहोश|unconscious/i.test(lower)) {
      localEmergencySymptoms['loss_of_consciousness'] = 'yes';
    }
    if (/stroke|paralysis|लकवा|पक्षाघात|slurred speech|face droop/i.test(lower)) {
      localEmergencySymptoms['slurred_speech'] = 'yes';
    }
    if (/severe bleeding|heavy bleeding|अति रक्तस्राव|भारी रक्तस्राव/i.test(lower)) {
      localEmergencySymptoms['severe_bleeding'] = 'yes';
    }
    if (/seizure|convulsion|फेफरे|दौरे/i.test(lower)) {
      localEmergencySymptoms['seizure'] = 'yes';
    }

    const evalResult = evaluateEmergencyRules(localEmergencySymptoms, 'severe', selectedLanguage);
    if (evalResult.isEmergency) {
      const emergencyUrl = `/screening/emergency?flags=${encodeURIComponent(evalResult.flags.join(','))}`;
      try {
        navigate(emergencyUrl);
      } catch {}
      if (typeof window !== 'undefined' && window.location) {
        try {
          window.location.href = emergencyUrl;
        } catch {}
      }
      return true;
    }
    return false;
  };

  // Submit patient statement to backend dialogue engine
  const handleProcessSubmission = async (statementText: string) => {
    const textToSend = statementText.trim();
    if (!textToSend || state === 'processing') return;

    // Immediately stop any ongoing assistant speech
    handleStopSpeaking();

    // Independent Emergency Rule Check runs FIRST
    if (checkEmergencySignsLocally(textToSend)) {
      return;
    }

    // Append user message
    const userMsg: Message = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setState('processing');
    setErrorMessage(null);

    const startTime = performance.now();

    try {
      const res = await fetch(`${API_BASE_URL}/screenings/dialogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          text: textToSend,
          language: selectedLanguage,
          currentSymptoms,
          negatedSymptoms,
          answeredQuestions,
          questionHistory,
          patientName: patientName || undefined,
          conversationHistory: messages.slice(-6).map((m) => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            text: m.text,
          })),
        }),
      });

      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[HealthSetu AI] Dialogue turnaround: ${elapsed}ms`);

      if (!res.ok) {
        throw new Error(`API status ${res.status}`);
      }

      const data = await res.json();

      // Urgent red flag check
      if (data.isEmergency) {
        navigate(`/screening/emergency?flags=${encodeURIComponent((data.emergencyFlags || []).join(','))}`);
        return;
      }

      if (data.patientName && !patientName) {
        setPatientName(data.patientName);
      }
      if (data.negatedSymptoms) {
        setNegatedSymptoms(data.negatedSymptoms);
      }
      if (data.extractedSymptoms) {
        setCurrentSymptoms(data.extractedSymptoms);
      }

      // Check if dialogue concluded
      if (data.isFinished) {
        setState('concluded');
        setCurrentFollowUp(null);

        const resultObj = {
          riskTier: data.riskTier,
          candidateCategory: data.candidateCategory,
          recommendedSpecialty: data.recommendedSpecialty,
          guidanceText: data.guidanceText,
          modelVersion: data.modelVersion,
        };
        setScreeningResult(resultObj);

        const finalMsg: Message = {
          id: `msg-asst-${Date.now()}`,
          sender: 'assistant',
          text: data.guidanceText,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, finalMsg]);

        // Speak outcome automatically
        speakAssistantText(data.guidanceText, finalMsg.id);

        // Persist locally to Dexie and Outbox
        await persistScreening(resultObj, textToSend);
      } else {
        // Continuous adaptive dialogue: greeting acknowledged, general query answered, or follow-up question
        setCurrentFollowUp(data.followUpQuestion || null);
        if (data.followUpQuestion) {
          setQuestionHistory((prev) => [...prev, data.followUpQuestion.questionId]);
        }
        setTranscript('');
        setTextInput('');
        setState('idle');

        const replyText = data.followUpQuestion ? data.followUpQuestion.text : data.guidanceText;
        if (replyText) {
          const asstMsg: Message = {
            id: `msg-asst-${Date.now()}`,
            sender: 'assistant',
            text: replyText,
            timestamp: Date.now(),
            questionId: data.followUpQuestion?.questionId,
          };
          setMessages((prev) => [...prev, asstMsg]);

          // Speak assistant reply automatically
          speakAssistantText(replyText, asstMsg.id);
        }
      }
    } catch (err: any) {
      console.warn('Backend dialogue error; using on-device fallback:', err);

      // Preserve existing transcript so user does not have to repeat everything!
      setErrorMessage(S.networkError);

      // On-device deterministic emergency check
      const symMap: Record<string, 'yes' | 'no' | 'unknown'> = {};
      currentSymptoms.forEach((s) => {
        symMap[s] = 'yes';
      });
      const localEmerg = evaluateEmergencyRules(symMap, 'moderate', selectedLanguage);
      if (localEmerg.isEmergency) {
        navigate(`/screening/emergency?flags=${encodeURIComponent(localEmerg.flags.join(','))}`);
        return;
      }

      setState('confirming');
    }
  };

  // Handle quick Yes / No / Not Sure response
  const handleQuickAnswer = async (value: 'yes' | 'no' | 'unknown') => {
    if (!currentFollowUp) return;

    const qId = currentFollowUp.questionId;
    const updated = { ...answeredQuestions, [qId]: value };
    setAnsweredQuestions(updated);

    const valLabel = value === 'yes' ? S.yes : value === 'no' ? S.no : S.notSure;
    setCurrentFollowUp(null);
    await handleProcessSubmission(`${valLabel} (${currentFollowUp.symptomId})`);
  };

  // Persist screening to Dexie and queue Outbox synchronization
  const persistScreening = async (
    result: {
      riskTier: RiskTier;
      candidateCategory: string | null;
      recommendedSpecialty: string;
      guidanceText: string;
      modelVersion: string;
    },
    finalStatement: string
  ) => {
    try {
      const answersArray = Object.entries(answeredQuestions).map(([qId, val]) => ({
        questionId: qId,
        symptomId: qId,
        value: val,
        at: Date.now(),
      }));

      const payload: CreateScreeningInput = {
        clientId: localScreeningId,
        language: selectedLanguage,
        symptoms: currentSymptoms.length > 0 ? currentSymptoms : ['general_discomfort'],
        answers: answersArray,
        severity: 'moderate',
        emergencyFlags: [],
        riskTier: result.riskTier,
        isEmergency: false,
        possibleConditions: result.candidateCategory
          ? [{ name: result.candidateCategory, probability: 0.85 }]
          : [],
        symptomGroups: [],
        recommendedSpecialty: result.recommendedSpecialty,
        source: 'device',
        modelVersion: result.modelVersion,
        triageConfigVersion: '1.0.0',
        imageIds: [],
        inputMethod: inputMode,
        voiceTranscript: finalStatement,
        candidateCategory: result.candidateCategory || undefined,
        referralStatus: result.riskTier === 'HIGH' ? 'pending' : 'none',
        status: 'completed',
        district: 'DIST-PUNE-RURAL',
        isOfflineSync: false,
        clientCreatedAt: Date.now(),
      };

      await db.screenings.put({
        ...payload,
        id: localScreeningId,
        localId: localScreeningId,
        patientId: 'local-patient',
        submittedBy: 'local-user',
        receivedAt: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await queueOutboxEvent('SCREENING_CREATED', payload);
    } catch (e) {
      console.warn('Failed to persist screening to Dexie:', e);
    }
  };

  // Reset to start a new screening
  const handleResetScreening = () => {
    if (isSpeaking) handleStopSpeaking();
    setMessages([]);
    setCurrentSymptoms([]);
    setAnsweredQuestions({});
    setQuestionHistory([]);
    setCurrentFollowUp(null);
    setScreeningResult(null);
    setTranscript('');
    setTextInput('');
    setState('idle');
    setErrorMessage(null);

    const greetingMsg: Message = {
      id: 'greeting-reset',
      sender: 'assistant',
      text: S.greeting,
      timestamp: Date.now(),
    };
    setMessages([greetingMsg]);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Mobile-First Header */}
      <header className="bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 sticky top-0 z-30">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">{S.title}</h1>
              <p className="text-[10px] text-slate-400">{S.subtitle}</p>
            </div>
          </div>

          {/* Emergency 108 Direct Access Badge */}
          <a
            href="tel:108"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-[11px] font-bold hover:bg-rose-600/30 transition-all shrink-0"
            title={S.emergencyBanner}
          >
            <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
            <span>108</span>
          </a>
        </div>
      </header>

      {/* Main Container: Mobile-First Constrained Width */}
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-3 flex flex-col gap-3">
        {/* Three Large, Clearly Labelled Language Options */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleLanguageSwitch('mr')}
            className={`min-h-[44px] py-2 px-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
              selectedLanguage === 'mr'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/50 scale-[1.02]'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>मराठी</span>
            <span className="text-[9px] font-normal opacity-75">Marathi</span>
          </button>

          <button
            onClick={() => handleLanguageSwitch('hi')}
            className={`min-h-[44px] py-2 px-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
              selectedLanguage === 'hi'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/50 scale-[1.02]'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>हिंदी</span>
            <span className="text-[9px] font-normal opacity-75">Hindi</span>
          </button>

          <button
            onClick={() => handleLanguageSwitch('en')}
            className={`min-h-[44px] py-2 px-3 rounded-2xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center ${
              selectedLanguage === 'en'
                ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-400/50 scale-[1.02]'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>English</span>
            <span className="text-[9px] font-normal opacity-75">English</span>
          </button>
        </div>

        {/* Short, Honest Privacy Notice without Unsupported Claims */}
        <div className="bg-slate-800/40 border border-slate-800 rounded-xl px-3 py-1.5 flex items-center gap-2 text-[11px] text-slate-400">
          <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <p className="leading-snug">{S.privacy}</p>
        </div>

        {/* Conversation Stream (Co-located, dynamically sizing without artificial clipping) */}
        <div
          className={`flex-1 flex flex-col gap-2.5 overflow-y-auto min-h-0 pr-1 ${
            state === 'concluded' ? 'max-h-none pb-8' : 'max-h-[50vh]'
          }`}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-xs shadow-sm'
                    : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-xs shadow-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>

                {/* Assistant Controls: Stop Speaking / Replay */}
                {msg.sender === 'assistant' && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/60">
                    {isSpeaking && speakingMessageId === msg.id ? (
                      <button
                        onClick={handleStopSpeaking}
                        className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95"
                      >
                        <VolumeX className="w-3 h-3" />
                        <span>{S.stopSpeaking}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReplayAudio(msg.text, msg.id)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                        title={S.replayAudio}
                      >
                        <Volume2 className="w-3 h-3 text-emerald-400" />
                        <span>{S.replayAudio}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Processing / Transcribing Indicator */}
          {(state === 'processing' || state === 'transcribing') && (
            <div className="flex items-center gap-2 p-3 bg-slate-800/80 border border-slate-700 rounded-2xl text-xs text-slate-300">
              <div className="flex gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce delay-100" />
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce delay-200" />
              </div>
              <span>{S.processing}</span>
            </div>
          )}

          {/* Error Message with Transcript Preservation */}
          {errorMessage && (
            <div className="bg-rose-950/40 border border-rose-800/80 p-3 rounded-2xl text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Large Yes / No / Not Sure Touch Targets for Follow-up Questions */}
          {currentFollowUp && state !== 'processing' && (
            <div className="bg-slate-800/90 border border-emerald-500/30 p-3.5 rounded-2xl flex flex-col gap-2 mt-1 shadow-md">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                {S.quickAnswer}
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleQuickAnswer('yes')}
                  className="min-h-[46px] bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {S.yes}
                </button>
                <button
                  onClick={() => handleQuickAnswer('no')}
                  className="min-h-[46px] bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  {S.no}
                </button>
                <button
                  onClick={() => handleQuickAnswer('unknown')}
                  className="min-h-[46px] bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  {S.notSure}
                </button>
              </div>
            </div>
          )}

          {/* Final Screening Outcome Card */}
          {state === 'concluded' && screeningResult && (
            <div className="bg-slate-800/95 border-2 border-emerald-500/50 rounded-3xl p-5 flex flex-col gap-3.5 shadow-2xl mt-1">
              {/* Header with Title and Risk Tier Badge */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-700/80">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>{S.assessmentTitle}</span>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-black tracking-wide flex items-center gap-1 ${
                    screeningResult.riskTier === 'HIGH'
                      ? 'bg-rose-950 text-rose-300 border border-rose-600 shadow-sm'
                      : screeningResult.riskTier === 'MEDIUM'
                      ? 'bg-amber-950 text-amber-300 border border-amber-600 shadow-sm'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-500 shadow-sm'
                  }`}
                >
                  {screeningResult.riskTier === 'HIGH' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>{screeningResult.riskTier} RISK</span>
                </span>
              </div>

              {/* Reported & Negated Symptoms Chips */}
              {(currentSymptoms.length > 0 || negatedSymptoms.length > 0) && (
                <div className="bg-slate-900/70 p-3 rounded-2xl border border-slate-700/80 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    {S.reportedSymptoms}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentSymptoms.map((sym) => (
                      <span
                        key={sym}
                        className="px-2.5 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[11px] font-medium capitalize"
                      >
                        {sym.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {negatedSymptoms.map((sym) => (
                      <span
                        key={`neg-${sym}`}
                        className="px-2.5 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[11px] line-through"
                      >
                        {sym.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Model Assessment & Clinical Triage Guidance */}
              <div className="bg-slate-900/70 p-3.5 rounded-2xl border border-slate-700/80 text-xs flex flex-col gap-1.5">
                {screeningResult.candidateCategory ? (
                  <>
                    <span className="text-[11px] font-semibold text-slate-400">
                      ML Research Candidate:
                    </span>
                    <span className="font-bold text-emerald-400 text-base">
                      {screeningResult.candidateCategory}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5 italic">
                      {S.disclaimer}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {S.clinicalTriage}
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {screeningResult.guidanceText}
                    </p>
                  </>
                )}
              </div>

              {/* Recommended Specialty & Audio Guidance Trigger */}
              <div className="text-xs text-slate-200 flex items-center justify-between bg-slate-900/50 px-3.5 py-2.5 rounded-2xl border border-slate-700/70">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{S.specialtyLabel} <strong className="text-white font-bold">{screeningResult.recommendedSpecialty}</strong></span>
                </div>
                {isSpeaking && (speakingMessageId === 'concluded' || (messages.length > 0 && messages[messages.length - 1]?.id === speakingMessageId)) ? (
                  <button
                    onClick={handleStopSpeaking}
                    className="px-2.5 py-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 active:scale-95 shadow-sm"
                  >
                    <VolumeX className="w-3 h-3" />
                    <span>{S.stopSpeaking}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleReplayAudio(screeningResult.guidanceText, 'concluded')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-all border border-slate-700 shrink-0 active:scale-95 shadow-sm"
                    title={S.replayAudio}
                  >
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    <span>{S.replayAudio}</span>
                  </button>
                )}
              </div>

              {/* Action Buttons: Prominent, Unclipped, High Accessibility */}
              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  onClick={() => navigate('/consult/choose')}
                  className="min-h-[48px] w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-all"
                >
                  <Stethoscope className="w-4 h-4" />
                  <span>{S.consultDoctor}</span>
                </button>

                <button
                  onClick={() => navigate('/facilities')}
                  className="min-h-[46px] w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 cursor-pointer border border-slate-700 transition-all"
                >
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>{S.findPhc}</span>
                </button>

                <button
                  onClick={handleResetScreening}
                  className="w-full py-2 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{S.newScreening}</span>
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Interactive Input Dock: Unified & Positioned Right Next to Messages */}
        {state !== 'concluded' && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-4 flex flex-col items-center gap-3 shadow-lg">
            {/* Real-time recognized speech preview while listening */}
            {state === 'listening' && (
              <div className="w-full bg-slate-900/95 border border-emerald-500/50 rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center shadow-md animate-pulse">
                <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {S.listening}
                </span>
                <p className="text-xs text-white font-medium italic max-h-16 overflow-y-auto px-2">
                  {transcript ? `"${transcript}"` : '...'}
                </p>
              </div>
            )}

            {/* Transcript Preview & Confirmation Box (Only if confirming or user clicked to edit) */}
            {(state === 'confirming' || isEditingTranscript) && (
              <div className="w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                  <FileEdit className="w-3 h-3 text-emerald-400" />
                  {S.reviewTranscript}
                </span>

                <div className="text-xs text-slate-100 bg-slate-950 p-2.5 rounded-xl border border-slate-800 min-h-[40px]">
                  {transcript || textInput || <span className="text-slate-500 italic">No text recognized</span>}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => {
                      setIsEditingTranscript(true);
                      setInputMode('text');
                    }}
                    className="min-h-[44px] px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>{S.editBtn}</span>
                  </button>

                  <button
                    onClick={() => handleProcessSubmission(transcript || textInput)}
                    disabled={(!transcript && !textInput) || state === 'processing'}
                    className="min-h-[44px] px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{S.continueBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Voice Mode: One Big Prominent Microphone Button */}
            {inputMode === 'voice' && state !== 'confirming' && (
              <div className="flex flex-col items-center gap-2 w-full">
                <div className="relative my-1">
                  {state === 'listening' && (
                    <div className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
                  )}
                  <button
                    onClick={handleToggleRecording}
                    disabled={state === 'processing'}
                    className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xl ${
                      state === 'listening'
                        ? 'bg-rose-600 text-white ring-4 ring-rose-400/40 scale-105'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-105'
                    }`}
                    aria-label={state === 'listening' ? S.stopRecording : S.tapToSpeak}
                  >
                    {state === 'listening' ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                  </button>
                </div>

                <span className="text-xs font-bold text-slate-200 text-center">
                  {state === 'listening' ? S.listening : S.tapToSpeak}
                </span>

                {/* Secondary Button: Type Instead */}
                <button
                  onClick={() => {
                    if (state === 'listening' && recognitionRef.current) {
                      recognitionRef.current.abort();
                    }
                    setState('idle');
                    setInputMode('text');
                  }}
                  className="mt-1 min-h-[44px] w-full py-2.5 px-4 rounded-xl bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all border border-slate-700"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{S.typeInstead}</span>
                </button>
              </div>
            )}

            {/* Text Input Mode: Full Keyboard Accessible Textbox */}
            {inputMode === 'text' && (
              <div className="w-full flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleProcessSubmission(textInput);
                      }
                    }}
                    placeholder={S.typePlaceholder}
                    className="flex-1 min-h-[46px] text-xs p-3 rounded-2xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => handleProcessSubmission(textInput)}
                    disabled={!textInput.trim() || state === 'processing'}
                    className="min-h-[46px] px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{S.continueBtn}</span>
                  </button>
                </div>

                {/* Switch back to Voice button */}
                <button
                  onClick={() => setInputMode('voice')}
                  className="py-1 text-slate-400 hover:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>{S.switchToVoice}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ScreeningPage;
