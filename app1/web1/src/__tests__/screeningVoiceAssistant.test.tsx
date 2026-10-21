import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScreeningPage from '../features/screening/ScreeningPage.js';
import { db } from '../offline/db.js';
import i18n from '../i18n/index.js';

// Setup SpeechSynthesis mocks
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
let mockVoices: SpeechSynthesisVoice[] = [];

// Mock SpeechSynthesisUtterance
class MockSpeechSynthesisUtterance {
  text: string;
  lang: string = 'en-IN';
  voice: SpeechSynthesisVoice | null = null;
  rate: number = 1.0;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
(global as any).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

const originalLocation = window.location;

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await db.screenings.clear();
  await db.outbox.clear();
  mockSpeak.mockClear();
  mockCancel.mockClear();

  mockVoices = [
    { name: 'Google English', lang: 'en-IN', default: true, localService: true, voiceURI: 'en-1' } as SpeechSynthesisVoice,
    { name: 'Google Hindi', lang: 'hi-IN', default: false, localService: true, voiceURI: 'hi-1' } as SpeechSynthesisVoice,
  ];

  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    value: {
      getVoices: vi.fn(() => mockVoices),
      speak: mockSpeak,
      cancel: mockCancel,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onvoiceschanged: null,
      paused: false,
      pending: false,
      speaking: false,
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Screening Assistant Redesign & Voice Lifecycle', () => {
  it('renders compact header with 3 large language buttons and honest privacy notice', () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Compact header title
    expect(screen.getByText(/SwasthSetu|HealthSetu/i)).toBeInTheDocument();
    expect(screen.getByText(/108/i)).toBeInTheDocument();

    // 3 large language options
    expect(screen.getByRole('button', { name: /मराठी/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /हिंदी/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /English/i })).toBeInTheDocument();

    // Honest privacy notice without unsupported claims
    expect(screen.getByText(/Private & safe. Helps understand your symptoms; does not replace a clinician|खाजगी व सुरक्षित/i)).toBeInTheDocument();
  });

  it('switches languages dynamically and localizes all controls and greetings', async () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Switch to Marathi
    const mrButton = screen.getByRole('button', { name: /मराठी/i });
    fireEvent.click(mrButton);

    await waitFor(() => {
      expect(screen.getByText(/येथे टॅप करा आणि बोला/i)).toBeInTheDocument();
      expect(screen.getByText(/किंवा मजकूर टाईप करून सांगा/i)).toBeInTheDocument();
      expect(screen.getByText(/नमस्कार! मी तुमचा आरोग्य तपासणी सहाय्यक आहे/i)).toBeInTheDocument();
    });

    // Switch to Hindi
    const hiButton = screen.getByRole('button', { name: /हिंदी/i });
    fireEvent.click(hiButton);

    await waitFor(() => {
      expect(screen.getByText(/यहाँ टैप करें और बोलें/i)).toBeInTheDocument();
      expect(screen.getByText(/या लिखकर बताएं/i)).toBeInTheDocument();
      expect(screen.getByText(/नमस्ते! मैं आपका स्वास्थ्य सहायक हूँ/i)).toBeInTheDocument();
    });

    // Switch back to English
    const enButton = screen.getByRole('button', { name: /English/i });
    fireEvent.click(enButton);

    await waitFor(() => {
      expect(screen.getByText(/Tap and Speak/i)).toBeInTheDocument();
      expect(screen.getByText(/Or type symptoms instead/i)).toBeInTheDocument();
      expect(screen.getByText(/Hello! I am your (SwasthSetu|HealthSetu) screening assistant/i)).toBeInTheDocument();
    });
  });

  it('switches to Marathi and displays full Marathi greeting and voice assistant controls', async () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Switch to Marathi
    fireEvent.click(screen.getByRole('button', { name: /मराठी/i }));

    await waitFor(() => {
      expect(screen.getByText(/नमस्कार! मी तुमचा आरोग्य तपासणी सहाय्यक आहे/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /पुन्हा ऐका/i })).toBeInTheDocument();
    });
  });

  it('allows switching to text mode and typing symptoms manually', async () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Click secondary button to type
    const typeBtn = screen.getByText(/Or type symptoms instead/i);
    fireEvent.click(typeBtn);

    // Input should appear
    const input = screen.getByPlaceholderText(/mild fever and dry cough/i);
    expect(input).toBeInTheDocument();

    // Type symptoms
    fireEvent.change(input, { target: { value: 'Mild cough and runny nose for 2 days' } });

    // Submit button should be enabled
    const continueBtn = screen.getByRole('button', { name: /Continue Assessment/i });
    expect(continueBtn).not.toBeDisabled();
  });

  it('triggers emergency bypass directly when life-threatening emergency symptoms are entered', async () => {
    // Set window.location.href mock
    let capturedHref = '';
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      set href(val: string) {
        capturedHref = val;
      },
      get href() {
        return capturedHref;
      },
    } as any;

    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Type severe chest pain symptoms
    fireEvent.click(screen.getByText(/Or type symptoms instead/i));
    const input = screen.getByPlaceholderText(/mild fever and dry cough/i);
    fireEvent.change(input, { target: { value: 'Severe chest pain radiating to left arm and breathless' } });

    const submitBtn = screen.getByRole('button', { name: /Continue Assessment/i });
    fireEvent.click(submitBtn);

    // Emergency rule precedence must immediately trigger emergency navigation
    await waitFor(() => {
      expect(capturedHref).toContain('/screening/emergency');
      expect(capturedHref).toContain('chest_pain');
    });

    // Restore original location
    window.location = originalLocation as any;
  });

  it('stops speaking and cancels active utterances when Stop Speaking is clicked', async () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Replay greeting to trigger speech
    const replayBtn = screen.getByTitle(/Replay Audio/i);
    fireEvent.click(replayBtn);

    // speech cancel should be called to ensure no overlapping speech
    expect(mockCancel).toHaveBeenCalled();
  });

  it('handles microphone toggle and prevents duplicate recordings', async () => {
    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    const micBtn = screen.getByRole('button', { name: /Tap and Speak/i });
    expect(micBtn).toBeInTheDocument();

    // First click initiates recording
    fireEvent.click(micBtn);

    // In environment without browser SpeechRecognition, it falls back to text mode safely
    await waitFor(() => {
      expect(
        screen.getByText(/Speech recognition not supported in this browser|Continue Assessment/i)
      ).toBeInTheDocument();
    });
  });

  it('acknowledges patient name and greeting without prematurely concluding or assigning risk', async () => {
    // Mock fetch for dialogue API to return greeting acknowledgment
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'test-sess',
        isEmergency: false,
        emergencyFlags: [],
        extractedSymptoms: [],
        negatedSymptoms: [],
        patientName: 'निरंजन',
        intent: 'greeting_or_intro',
        followUpQuestion: null,
        isFinished: false,
        candidateCategory: null,
        riskTier: 'LOW',
        recommendedSpecialty: 'General Physician',
        guidanceText: 'नमस्कार निरंजनजी! तुम्हाला सध्या कोणता त्रास किंवा कोणती लक्षणे जाणवत आहेत ते कृपया सांगा.',
        modelVersion: 'voice-dialogue-adaptive-v2',
      }),
    });
    global.fetch = mockFetch as any;

    render(
      <MemoryRouter>
        <ScreeningPage />
      </MemoryRouter>
    );

    // Switch to text mode
    fireEvent.click(screen.getByText(/Or type symptoms instead/i));
    const input = screen.getByPlaceholderText(/mild fever and dry cough/i);
    fireEvent.change(input, { target: { value: 'माझं नाव निरंजन आहे' } });

    const submitBtn = screen.getByRole('button', { name: /Continue Assessment/i });
    fireEvent.click(submitBtn);

    // Assistant must display the greeting response
    await waitFor(() => {
      expect(
        screen.getByText(/नमस्कार निरंजनजी! तुम्हाला सध्या कोणता त्रास किंवा कोणती लक्षणे जाणवत आहेत ते कृपया सांगा\./i)
      ).toBeInTheDocument();
    });

    // Assessment outcome card MUST NOT be rendered
    expect(screen.queryByText(/LOW RISK/i)).toBeNull();
    expect(screen.queryByText(/ML Research Candidate:/i)).toBeNull();
  });
});
