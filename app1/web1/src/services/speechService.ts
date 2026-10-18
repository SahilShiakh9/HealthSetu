import type { Language, SpeechRecognitionResult } from '@healthsetu/contracts';
import { db } from '../offline/db';

export interface SpeechServiceCallbacks {
  onResult: (result: SpeechRecognitionResult) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

// Sample rural health voice phrases for mock transcription fallback
export const MOCK_VOICE_PHRASES: Record<Language, string[]> = {
  mr: [
    'माझ्या लहान बाळाला २ दिवसांपासून जुलाब आणि उलट्या होत आहेत',
    'साप चावल्यास काय करावे? तातडीने मदत हवी आहे',
    'गरोदरपणात डोके दुखत आहे आणि पायांवर सूज आली आहे',
    'बाळाचे पुढचे लसीकरण कधी करायचे आहे?',
    'खोकला २ आठवड्यांपेक्षा जास्त आहे आणि संध्याकाळी बारीक ताप येतो',
  ],
  hi: [
    'मेरे बच्चे को दो दिन से उल्टी और दस्त हो रहे हैं, ओआरएस कैसे दें?',
    'सांप काटने पर तुरंत क्या प्राथमिक उपचार करना चाहिए?',
    'गर्भावस्था में तेज सिरदर्द और आंखों के आगे अंधेरा आ रहा है',
    'पोलियो और खसरे का टीका कब लगवाना है?',
    'दो हफ्ते से ज्यादा खांसी है और बलगम आ रहा है',
  ],
  en: [
    'How do I prepare ORS for a child with loose motions and vomiting?',
    'What is the immediate first aid for a venomous snakebite?',
    'What are the emergency danger signs during pregnancy?',
    'When should my 6 month old infant get the next vaccine?',
    'Continuous cough for two weeks with fever in the evening',
  ],
};

// Map Language enum to BCP-47 locale tags
export function getLocaleTag(lang: Language): string {
  switch (lang) {
    case 'hi':
      return 'hi-IN';
    case 'mr':
      return 'mr-IN';
    case 'en':
    default:
      return 'en-IN';
  }
}

export class SpeechService {
  private recognition: any = null;
  private isListening = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  constructor() {
    this.initRecognition();
  }

  private initRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
      } catch {
        this.recognition = null;
      }
    }
  }

  public isSupported(): boolean {
    return Boolean(this.recognition);
  }

  public startListening(
    language: Language,
    callbacks: SpeechServiceCallbacks
  ): void {
    if (this.isListening) {
      this.stopListening();
    }

    if (this.recognition) {
      this.recognition.lang = getLocaleTag(language);

      this.recognition.onresult = (event: any) => {
        const lastIndex = event.results.length - 1;
        const result = event.results[lastIndex];
        const transcript = result[0]?.transcript || '';
        const confidence = result[0]?.confidence || 0.85;
        const isFinal = result.isFinal || false;

        callbacks.onResult({
          transcript,
          confidence,
          isFinal,
          isMock: false,
        });
      };

      this.recognition.onerror = (event: any) => {
        callbacks.onError?.(event.error || 'Speech recognition error');
        this.isListening = false;
      };

      this.recognition.onend = () => {
        this.isListening = false;
        callbacks.onEnd?.();
      };

      try {
        this.recognition.start();
        this.isListening = true;
      } catch (err: any) {
        callbacks.onError?.(err?.message || 'Could not start speech recognition');
        this.isListening = false;
      }
    } else {
      // Fallback: Trigger mock speech simulation
      this.isListening = true;
      const phrases = MOCK_VOICE_PHRASES[language] || MOCK_VOICE_PHRASES.en;
      const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

      setTimeout(() => {
        callbacks.onResult({
          transcript: randomPhrase,
          confidence: 0.95,
          isFinal: true,
          isMock: true,
        });
        this.isListening = false;
        callbacks.onEnd?.();
      }, 700);
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore stop error
      }
    }
    this.isListening = false;
  }

  /**
   * Start local audio recording via MediaRecorder for offline voice messages
   */
  public async startAudioRecording(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop audio recording and save blob to Dexie db.mediaBlobs
   */
  public async stopAudioRecording(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const blobId = `audio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        try {
          await db.mediaBlobs.put({
            blobId,
            mime: 'audio/webm',
            sizeBytes: audioBlob.size,
            blob: audioBlob,
            status: 'pending-transcription',
            createdAt: Date.now(),
          });
          resolve(blobId);
        } catch {
          resolve(null);
        }
      };

      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    });
  }

  /**
   * Text-to-Speech (TTS) for accessibility & low-literacy users
   */
  public speakText(text: string, language: Language = 'en'): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getLocaleTag(language);
    utterance.rate = 0.9; // Slightly slower for clear rural comprehension
    window.speechSynthesis.speak(utterance);
  }

  public stopSpeaking(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }
}

export const speechService = new SpeechService();
